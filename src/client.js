const {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const {
  NodeHttp2Handler,
} = require("@smithy/node-http-handler");
const { Buffer } = require("node:buffer");
const { randomUUID } = require("node:crypto");
const { Subject } = require('rxjs');
const { take } = require('rxjs/operators');
const { firstValueFrom } = require('rxjs');
const {
  DefaultAudioInputConfiguration,
  DefaultAudioOutputConfiguration,
  DefaultSystemPrompt,
  DefaultTextConfiguration,
  DefaultToolSchema,
  WeatherToolSchema
} = require("./consts");

class StreamSession {
  constructor(sessionId, client) {
    this.sessionId = sessionId;
    this.client = client;
    this.audioBufferQueue = [];
    this.maxQueueSize = 200;
    this.isProcessingAudio = false;
    this.isActive = true;
  }

  onEvent(eventType, handler) {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  async setupSessionAndPromptStart(audioOutputConfig) {
    this.client.setupSessionStartEvent(this.sessionId);
    this.client.setupPromptStartEvent(this.sessionId, audioOutputConfig);
  }

  async setupSystemPrompt(
    textConfig = DefaultTextConfiguration,
    systemPromptContent = DefaultSystemPrompt
  ) {
    this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
  }

  async setupStartAudio(audioConfig = DefaultAudioInputConfiguration) {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  async streamAudio(audioData) {
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      this.audioBufferQueue.shift();
      console.log("Audio queue full, dropping oldest chunk");
    }
    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  async processAudioQueue() {
    if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) return;

    this.isProcessingAudio = true;
    try {
      let processedChunks = 0;
      const maxChunksPerBatch = 5;

      while (this.audioBufferQueue.length > 0 && processedChunks < maxChunksPerBatch && this.isActive) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }
    } finally {
      this.isProcessingAudio = false;

      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setTimeout(() => this.processAudioQueue(), 0);
      }
    }
  }

  getSessionId() {
    return this.sessionId;
  }

  async endAudioContent() {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  async endPrompt() {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  async close() {
    if (!this.isActive) return;

    this.isActive = false;
    this.audioBufferQueue = [];

    await this.client.sendSessionEnd(this.sessionId);
    console.log(`Session ${this.sessionId} close completed`);
  }
}

class NovaSonicBidirectionalStreamClient {
  constructor(config) {
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
      ...config.requestHandlerConfig,
    });

    if (!config.clientConfig.credentials) {
      throw new Error("No credentials provided");
    }

    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      ...config.clientConfig,
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1",
      requestHandler: nodeHttp2Handler
    });

    this.inferenceConfig = config.inferenceConfig ?? {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 0.7,
    };

    this.activeSessions = new Map();
    this.sessionLastActivity = new Map();
    this.sessionCleanupInProgress = new Set();
  }

  isSessionActive(sessionId) {
    const session = this.activeSessions.get(sessionId);
    return !!session && session.isActive;
  }

  getActiveSessions() {
    return Array.from(this.activeSessions.keys());
  }

  getLastActivityTime(sessionId) {
    return this.sessionLastActivity.get(sessionId) || 0;
  }

  updateSessionActivity(sessionId) {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  isCleanupInProgress(sessionId) {
    return this.sessionCleanupInProgress.has(sessionId);
  }

  createStreamSession(sessionId = randomUUID(), config) {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Stream session with ID ${sessionId} already exists`);
    }

    const session = {
      queue: [],
      queueSignal: new Subject(),
      closeSignal: new Subject(),
      responseSubject: new Subject(),
      toolUseContent: null,
      toolUseId: "",
      toolName: "",
      responseHandlers: new Map(),
      promptName: randomUUID(),
      inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: randomUUID()
    };

    this.activeSessions.set(sessionId, session);
    return new StreamSession(sessionId, this);
  }

  async processToolUse(toolName, toolUseContent) {
    const tool = toolName.toLowerCase();

    switch (tool) {
      case "getdateandtimetool":
        const date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
        const pstDate = new Date(date);
        return {
          date: pstDate.toISOString().split('T')[0],
          year: pstDate.getFullYear(),
          month: pstDate.getMonth() + 1,
          day: pstDate.getDate(),
          dayOfWeek: pstDate.toLocaleString('en-US', { weekday: 'long' }).toUpperCase(),
          timezone: "PST",
          formattedTime: pstDate.toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit'
          })
        };
      case "getweathertool":
        console.log(`weather tool`);
        const parsedContent = await this.parseToolUseContentForWeather(toolUseContent);
        console.log("parsed content");
        if (!parsedContent) {
          throw new Error('parsedContent is undefined');
        }
        return this.fetchWeatherData(parsedContent.latitude, parsedContent.longitude);
      default:
        console.log(`Tool ${tool} not supported`);
        throw new Error(`Tool ${tool} not supported`);
    }
  }

  async parseToolUseContentForWeather(toolUseContent) {
    try {
      if (toolUseContent && typeof toolUseContent.content === 'string') {
        const parsedContent = JSON.parse(toolUseContent.content);
        console.log(`parsedContent ${parsedContent}`);
        return {
          latitude: parsedContent.latitude,
          longitude: parsedContent.longitude
        };
      }
      return null;
    } catch (error) {
      console.error("Failed to parse tool use content:", error);
      return null;
    }
  }

  async fetchWeatherData(latitude, longitude) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MyApp/1.0',
          'Accept': 'application/json'
        }
      });
      const weatherData = await response.json();
      console.log("weatherData:", weatherData);

      return {
        weather_data: weatherData
      };
    } catch (error) {
      console.error(`Error fetching weather data: ${error instanceof Error ? error.message : String(error)} `, error);
      throw error;
    }
  }

  async initiateBidirectionalStreaming(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Stream session ${sessionId} not found`);
    }

    try {
      const asyncIterable = this.createSessionAsyncIterable(sessionId);

      console.log(`Starting bidirectional stream for session ${sessionId}...`);

      const response = await this.bedrockRuntimeClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-2-sonic-v1:0",
          body: asyncIterable,
        })
      );

      console.log(`Stream established for session ${sessionId}, processing responses...`);

      await this.processResponseStream(sessionId, response);

    } catch (error) {
      console.error(`Error in session ${sessionId}: `, error);
      this.dispatchEventForSession(sessionId, 'error', {
        source: 'bidirectionalStream',
        error
      });

      if (session.isActive) {
        this.closeSession(sessionId);
      }
    }
  }

  dispatchEventForSession(sessionId, eventType, data) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
      }
    }

    const anyHandler = session.responseHandlers.get('any');
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}: `, e);
      }
    }
  }

  createSessionAsyncIterable(sessionId) {
    if (!this.isSessionActive(sessionId)) {
      console.log(`Cannot create async iterable: Session ${sessionId} not active`);
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true })
        })
      };
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
    }

    let eventCount = 0;

    return {
      [Symbol.asyncIterator]: () => {
        console.log(`AsyncIterable iterator requested for session ${sessionId}`);

        return {
          next: async () => {
            try {
              if (!session.isActive || !this.activeSessions.has(sessionId)) {
                console.log(`Iterator closing for session ${sessionId}, done = true`);
                return { value: undefined, done: true };
              }

              if (session.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(session.queueSignal.pipe(take(1))),
                    firstValueFrom(session.closeSignal.pipe(take(1))).then(() => {
                      throw new Error("Stream closed");
                    })
                  ]);
                } catch (error) {
                  if (error instanceof Error) {
                    if (error.message === "Stream closed" || !session.isActive) {
                      if (this.activeSessions.has(sessionId)) {
                        console.log(`Session ${sessionId} closed during wait`);
                      }
                      return { value: undefined, done: true };
                    }
                  } else {
                    console.error(`Error on event close`, error);
                  }
                }
              }

              if (session.queue.length === 0 || !session.isActive) {
                console.log(`Queue empty or session inactive: ${sessionId}`);
                return { value: undefined, done: true };
              }

              const nextEvent = session.queue.shift();
              eventCount++;

              return {
                value: {
                  chunk: {
                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent))
                  }
                },
                done: false
              };
            } catch (error) {
              console.error(`Error in session ${sessionId} iterator: `, error);
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async () => {
            console.log(`Iterator return () called for session ${sessionId}`);
            session.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (error) => {
            console.log(`Iterator throw () called for session ${sessionId} with error: `, error);
            session.isActive = false;
            throw error;
          }
        };
      }
    };
  }

  async processResponseStream(sessionId, response) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) {
          console.log(`Session ${sessionId} is no longer active, stopping response processing`);
          break;
        }

        if (event.chunk?.bytes) {
          try {
            this.updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              if (jsonResponse.event?.contentStart) {
                this.dispatchEvent(sessionId, 'contentStart', jsonResponse.event.contentStart);
              } else if (jsonResponse.event?.textOutput) {
                this.dispatchEvent(sessionId, 'textOutput', jsonResponse.event.textOutput);
              } else if (jsonResponse.event?.audioOutput) {
                this.dispatchEvent(sessionId, 'audioOutput', jsonResponse.event.audioOutput);
              } else if (jsonResponse.event?.toolUse) {
                this.dispatchEvent(sessionId, 'toolUse', jsonResponse.event.toolUse);

                session.toolUseContent = jsonResponse.event.toolUse;
                session.toolUseId = jsonResponse.event.toolUse.toolUseId;
                session.toolName = jsonResponse.event.toolUse.toolName;
              } else if (jsonResponse.event?.contentEnd &&
                jsonResponse.event?.contentEnd?.type === 'TOOL') {

                console.log(`Processing tool use for session ${sessionId}`);
                this.dispatchEvent(sessionId, 'toolEnd', {
                  toolUseContent: session.toolUseContent,
                  toolUseId: session.toolUseId,
                  toolName: session.toolName
                });

                console.log("calling tooluse");
                console.log("tool use content : ", session.toolUseContent);
                const toolResult = await this.processToolUse(session.toolName, session.toolUseContent);

                this.sendToolResult(sessionId, session.toolUseId, toolResult);

                this.dispatchEvent(sessionId, 'toolResult', {
                  toolUseId: session.toolUseId,
                  result: toolResult
                });
              } else if (jsonResponse.event?.contentEnd) {
                this.dispatchEvent(sessionId, 'contentEnd', jsonResponse.event.contentEnd);
              } else {
                const eventKeys = Object.keys(jsonResponse.event || {});
                console.log(`Event keys for session ${sessionId}: `, eventKeys);
                console.log(`Handling other events`);
                if (eventKeys.length > 0) {
                  this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
                } else if (Object.keys(jsonResponse).length > 0) {
                  this.dispatchEvent(sessionId, 'unknown', jsonResponse);
                }
              }
            } catch (e) {
              console.log(`Raw text response for session ${sessionId}(parse error): `, textResponse);
            }
          } catch (e) {
            console.error(`Error processing response chunk for session ${sessionId}: `, e);
          }
        } else if (event.modelStreamErrorException) {
          console.error(`Model stream error for session ${sessionId}: `, event.modelStreamErrorException);
          this.dispatchEvent(sessionId, 'error', {
            type: 'modelStreamErrorException',
            details: event.modelStreamErrorException
          });
        } else if (event.internalServerException) {
          console.error(`Internal server error for session ${sessionId}: `, event.internalServerException);
          this.dispatchEvent(sessionId, 'error', {
            type: 'internalServerException',
            details: event.internalServerException
          });
        }
      }

      console.log(`Response stream processing complete for session ${sessionId}`);
      this.dispatchEvent(sessionId, 'streamComplete', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Error processing response stream for session ${sessionId}: `, error);
      this.dispatchEvent(sessionId, 'error', {
        source: 'responseStream',
        message: 'Error processing response stream',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  addEventToSessionQueue(sessionId, event) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.updateSessionActivity(sessionId);
    session.queue.push(event);
    session.queueSignal.next();
  }

  setupSessionStartEvent(sessionId) {
    console.log(`Setting up initial events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig
        }
      }
    });
  }

  setupPromptStartEvent(sessionId, audioOutputConfig = DefaultAudioOutputConfiguration) {
    console.log(`Setting up prompt start event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        promptStart: {
          promptName: session.promptName,
          textOutputConfiguration: {
            mediaType: "text/plain",
          },
          audioOutputConfiguration: audioOutputConfig,
          toolUseOutputConfiguration: {
            mediaType: "application/json",
          },
          toolConfiguration: {
            tools: [{
              toolSpec: {
                name: "getDateAndTimeTool",
                description: "Get information about the current date and time.",
                inputSchema: {
                  json: DefaultToolSchema
                }
              }
            },
            {
              toolSpec: {
                name: "getWeatherTool",
                description: "Get the current weather for a given location, based on its WGS84 coordinates.",
                inputSchema: {
                  json: WeatherToolSchema
                }
              }
            }
            ]
          },
        },
      }
    });
    session.isPromptStartSent = true;
  }

  setupSystemPromptEvent(sessionId,
    textConfig = DefaultTextConfiguration,
    systemPromptContent = DefaultSystemPrompt
  ) {
    console.log(`Setting up systemPrompt events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const textPromptID = randomUUID();
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: false,
          role: "SYSTEM",
          textInputConfiguration: textConfig,
        },
      }
    });

    this.addEventToSessionQueue(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content: systemPromptContent,
        },
      }
    });

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      }
    });
  }

  setupStartAudioEvent(
    sessionId,
    audioConfig = DefaultAudioInputConfiguration
  ) {
    console.log(`Setting up startAudioContent event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    console.log(`Using audio content ID: ${session.audioContentId}`);
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      }
    });
    session.isAudioContentStartSent = true;
    console.log(`Initial events setup complete for session ${sessionId}`);
  }

  async streamAudioChunk(sessionId, audioData) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }

    const base64Data = audioData.toString('base64');

    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64Data,
        },
      }
    });
  }

  async sendToolResult(sessionId, toolUseId, result) {
    const session = this.activeSessions.get(sessionId);
    console.log("inside tool result");
    if (!session || !session.isActive) return;

    console.log(`Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`);
    const contentId = randomUUID();

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: contentId,
          interactive: false,
          type: "TOOL",
          role: "TOOL",
          toolResultInputConfiguration: {
            toolUseId: toolUseId,
            type: "TEXT",
            textInputConfiguration: {
              mediaType: "text/plain"
            }
          }
        }
      }
    });

    const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
    this.addEventToSessionQueue(sessionId, {
      event: {
        toolResult: {
          promptName: session.promptName,
          contentName: contentId,
          content: resultContent
        }
      }
    });

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: contentId
        }
      }
    });

    console.log(`Tool result sent for session ${sessionId}`);
  }

  async sendContentEnd(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isAudioContentStartSent) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: session.audioContentId,
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async sendPromptEnd(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isPromptStartSent) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        promptEnd: {
          promptName: session.promptName
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  async sendSessionEnd(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionEnd: {}
      }
    });

    await new Promise(resolve => setTimeout(resolve, 300));

    session.isActive = false;
    session.closeSignal.next();
    session.closeSignal.complete();
    this.activeSessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    console.log(`Session ${sessionId} closed and removed from active sessions`);
  }

  registerEventHandler(sessionId, eventType, handler) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.responseHandlers.set(eventType, handler);
  }

  dispatchEvent(sessionId, eventType, data) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
      }
    }

    const anyHandler = session.responseHandlers.get('any');
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}:`, e);
      }
    }
  }

  async closeSession(sessionId) {
    if (this.sessionCleanupInProgress.has(sessionId)) {
      console.log(`Cleanup already in progress for session ${sessionId}, skipping`);
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      console.log(`Starting close process for session ${sessionId}`);
      await this.sendContentEnd(sessionId);
      await this.sendPromptEnd(sessionId);
      await this.sendSessionEnd(sessionId);
      console.log(`Session ${sessionId} cleanup complete`);
    } catch (error) {
      console.error(`Error during closing sequence for session ${sessionId}:`, error);

      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
      }
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

  forceCloseSession(sessionId) {
    if (this.sessionCleanupInProgress.has(sessionId) || !this.activeSessions.has(sessionId)) {
      console.log(`Session ${sessionId} already being cleaned up or not active`);
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      console.log(`Force closing session ${sessionId}`);

      session.isActive = false;
      session.closeSignal.next();
      session.closeSignal.complete();
      this.activeSessions.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);

      console.log(`Session ${sessionId} force closed`);
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }
}

module.exports = {
  NovaSonicBidirectionalStreamClient,
  StreamSession
};
