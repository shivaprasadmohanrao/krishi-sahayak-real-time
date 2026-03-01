const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { fromIni } = require("@aws-sdk/credential-providers");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
const { NovaSonicBidirectionalStreamClient } = require('./client');
const { Buffer } = require('node:buffer');
const dotenv = require('dotenv');
const axios = require('axios');
dotenv.config();

// Verify AWS credentials are loaded
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('ERROR: AWS credentials not found in environment variables!');
    console.error('Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env file');
    process.exit(1);
}

console.log('AWS credentials loaded successfully');
console.log('AWS Region:', process.env.AWS_REGION || 'us-east-1');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Create the AWS Bedrock client with explicit credentials
const bedrockClient = new NovaSonicBidirectionalStreamClient({
    requestHandlerConfig: {
        maxConcurrentStreams: 10,
    },
    clientConfig: {
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN })
        }
    }
});

// ===== WEATHER API INTEGRATION =====

// Geocoding API to get coordinates from location name
async function getCoordinates(locationName) {
    try {
        const apiKey = process.env.OPEN_WEATHER_APIKEY;
        
        if (!apiKey) {
            console.error('ERROR: OPEN_WEATHER_APIKEY not found in environment variables');
            return null;
        }
        
        // Try multiple search patterns for better results
        const searchQueries = [
            `${locationName},IN`,  // City, India
            `${locationName},India`,  // City, India (full name)
            locationName  // Just the city name
        ];
        
        for (const query of searchQueries) {
            const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
            
            console.log(`Fetching coordinates for: ${query}`);
            console.log(`Geocoding URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
            
            const response = await axios.get(url);
            
            console.log(`Geocoding response status: ${response.status}`);
            console.log(`Geocoding response data:`, JSON.stringify(response.data, null, 2));
            
            if (response.data && response.data.length > 0) {
                // Prefer Indian locations
                const indianLocation = response.data.find(loc => loc.country === 'IN');
                const location = indianLocation || response.data[0];
                
                const { lat, lon, name, state, country } = location;
                console.log(`✓ Found coordinates: ${name}, ${state || ''}, ${country} - Lat: ${lat}, Lon: ${lon}`);
                return { lat, lon, name, state, country };
            }
        }
        
        console.log(`No coordinates found for: ${locationName}`);
        return null;
    } catch (error) {
        console.error('Error fetching coordinates:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.status, error.response.data);
        }
        return null;
    }
}

// Fetch weather forecast from OpenWeather API
async function getWeatherForecast(lat, lon) {
    try {
        const apiKey = process.env.OPEN_WEATHER_APIKEY;
        
        if (!apiKey) {
            console.error('ERROR: OPEN_WEATHER_APIKEY not found in environment variables');
            return null;
        }
        
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        
        console.log(`Fetching weather forecast for coordinates: ${lat}, ${lon}`);
        console.log(`Forecast URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
        
        const response = await axios.get(url);
        
        console.log(`Weather forecast response status: ${response.status}`);
        console.log(`Weather forecast data points: ${response.data.list ? response.data.list.length : 0}`);
        
        return response.data;
    } catch (error) {
        console.error('Error fetching weather forecast:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.status, error.response.data);
        }
        return null;
    }
}

// Analyze forecast data for next 24 hours
function analyzeWeatherForecast(forecastData) {
    if (!forecastData || !forecastData.list) {
        return null;
    }
    
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Filter forecasts for next 24 hours
    const relevantForecasts = forecastData.list.filter(item => {
        const forecastTime = new Date(item.dt * 1000);
        return forecastTime >= now && forecastTime <= next24Hours;
    });
    
    if (relevantForecasts.length === 0) {
        return null;
    }
    
    // Calculate statistics
    let maxTemp = -Infinity;
    let minTemp = Infinity;
    let totalRainProb = 0;
    let rainCount = 0;
    let weatherConditions = [];
    let humidity = 0;
    let windSpeed = 0;
    
    relevantForecasts.forEach(forecast => {
        maxTemp = Math.max(maxTemp, forecast.main.temp_max);
        minTemp = Math.min(minTemp, forecast.main.temp);
        
        if (forecast.pop > 0) {
            totalRainProb += forecast.pop;
            rainCount++;
        }
        
        humidity += forecast.main.humidity;
        windSpeed += forecast.wind.speed;
        
        const condition = forecast.weather[0].main;
        if (!weatherConditions.includes(condition)) {
            weatherConditions.push(condition);
        }
    });
    
    const avgRainProb = rainCount > 0 ? (totalRainProb / rainCount) * 100 : 0;
    const avgHumidity = humidity / relevantForecasts.length;
    const avgWindSpeed = windSpeed / relevantForecasts.length;
    
    return {
        location: forecastData.city.name,
        country: forecastData.city.country,
        maxTemp: Math.round(maxTemp),
        minTemp: Math.round(minTemp),
        rainProbability: Math.round(avgRainProb),
        weatherConditions: weatherConditions.join(', '),
        humidity: Math.round(avgHumidity),
        windSpeed: Math.round(avgWindSpeed * 3.6), // Convert m/s to km/h
        forecastCount: relevantForecasts.length
    };
}

// Format weather data into a readable message
function formatWeatherMessage(weatherAnalysis, language = 'en') {
    if (!weatherAnalysis) {
        return language === 'hi' 
            ? 'क्षमा करें, मैं मौसम की जानकारी प्राप्त नहीं कर सका।'
            : 'Sorry, I could not fetch weather information.';
    }
    
    const messages = {
        en: `Weather for ${weatherAnalysis.location} (Next 24 Hours):

Temperature: ${weatherAnalysis.minTemp}°C to ${weatherAnalysis.maxTemp}°C
Rain Chance: ${weatherAnalysis.rainProbability}%

${weatherAnalysis.rainProbability > 60 
    ? '⚠️ High rain expected - Prepare for irrigation needs to be minimal. Protect crops if needed.'
    : weatherAnalysis.rainProbability > 30
    ? '🌦️ Moderate rain possible - Keep backup irrigation ready.'
    : '☀️ Low rain chance - Plan irrigation. Crops will need watering.'}

${weatherAnalysis.maxTemp > 35
    ? '🔥 Hot day ahead - Ensure adequate watering, especially in afternoon.'
    : weatherAnalysis.maxTemp < 15
    ? '❄️ Cold weather - Protect sensitive crops from frost.'
    : '✓ Good temperature for farming activities.'}`,
        
        hi: `${weatherAnalysis.location} का मौसम (अगले 24 घंटे):

तापमान: ${weatherAnalysis.minTemp}°C से ${weatherAnalysis.maxTemp}°C
बारिश की संभावना: ${weatherAnalysis.rainProbability}%

${weatherAnalysis.rainProbability > 60
    ? '⚠️ अच्छी बारिश होगी - सिंचाई की जरूरत कम होगी। जरूरत हो तो फसलों को बचाएं।'
    : weatherAnalysis.rainProbability > 30
    ? '🌦️ बारिश हो सकती है - बैकअप सिंचाई तैयार रखें।'
    : '☀️ बारिश कम होगी - सिंचाई की योजना बनाएं। फसलों को पानी चाहिए होगा।'}

${weatherAnalysis.maxTemp > 35
    ? '🔥 गर्मी रहेगी - पर्याप्त पानी दें, खासकर दोपहर में।'
    : weatherAnalysis.maxTemp < 15
    ? '❄️ ठंड रहेगी - संवेदनशील फसलों को पाले से बचाएं।'
    : '✓ खेती के लिए अच्छा तापमान।'}`
    };
    
    return messages[language] || messages.en;
}

// Extract location from user message
function extractLocation(message) {
    // Common patterns for location queries
    const patterns = [
        // English patterns
        /(?:weather|forecast|prediction|temperature|rain).*?(?:in|for|at|near|of)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.|tomorrow|today|next)/i,
        /(?:in|for|at|near)\s+([a-zA-Z\s]+?)\s+(?:weather|forecast|prediction|temperature|rain)/i,
        /(?:tomorrow|today|next).*?(?:in|for|at|near)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.)/i,
        /([a-zA-Z\s]+?)\s+(?:weather|forecast|rain|temperature)/i,
        // Hindi patterns
        /(?:मौसम|पूर्वानुमान|तापमान|बारिश).*?(?:में|के लिए|का)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.)/i,
        /([a-zA-Z\s]+?)\s+(?:में|का|के)\s+(?:मौसम|पूर्वानुमान|तापमान|बारिश)/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            let location = match[1].trim();
            
            // Clean up the location
            location = location.replace(/\s+/g, ' '); // Remove extra spaces
            location = location.replace(/^(the|a|an)\s+/i, ''); // Remove articles
            
            // Filter out common words that aren't locations
            const excludeWords = ['the', 'will', 'be', 'is', 'what', 'how', 'when', 'where', 'there', 'here', 'my', 'your', 'our', 'में', 'के', 'का', 'से'];
            const words = location.toLowerCase().split(' ');
            
            // If location is just excluded words, skip it
            if (words.every(word => excludeWords.includes(word))) {
                continue;
            }
            
            // Remove excluded words from location
            location = location.split(' ')
                .filter(word => !excludeWords.includes(word.toLowerCase()))
                .join(' ');
            
            if (location.length > 2) {
                console.log(`Extracted location from message: "${location}"`);
                return location;
            }
        }
    }
    
    console.log(`Could not extract location from message: "${message}"`);
    return null;
}

// Check if message is weather-related
function isWeatherQuery(message) {
    const weatherKeywords = [
        'weather', 'forecast', 'prediction', 'temperature', 'rain', 'rainfall',
        'मौसम', 'पूर्वानुमान', 'तापमान', 'बारिश', 'वर्षा',
        'tomorrow', 'कल', 'today', 'आज', 'climate', 'जलवायु'
    ];
    
    const lowerMessage = message.toLowerCase();
    return weatherKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Track active sessions per socket
const socketSessions = new Map();

// Track language preferences per session
const sessionLanguages = new Map();

// Track voice gender preferences per session
const sessionVoiceGenders = new Map();

// Track interaction mode preferences per session
const sessionInteractionModes = new Map();

// Session states
const SessionState = {
    INITIALIZING: 'initializing',
    READY: 'ready',
    ACTIVE: 'active',
    CLOSED: 'closed'
};

const sessionStates = new Map();
const cleanupInProgress = new Map();

// Periodically check for and close inactive sessions (every minute)
setInterval(() => {
    console.log("Session cleanup check");
    const now = Date.now();

    bedrockClient.getActiveSessions().forEach(sessionId => {
        const lastActivity = bedrockClient.getLastActivityTime(sessionId);

        if (now - lastActivity > 5 * 60 * 1000) {
            console.log(`Closing inactive session ${sessionId} after 5 minutes of inactivity`);
            try {
                bedrockClient.forceCloseSession(sessionId);
            } catch (error) {
                console.error(`Error force closing inactive session ${sessionId}:`, error);
            }
        }
    });
}, 60000);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Helper function to create and initialize a new session
async function createNewSession(socket) {
    const sessionId = socket.id;

    try {
        console.log(`Creating new session for client: ${sessionId}`);
        sessionStates.set(sessionId, SessionState.INITIALIZING);

        const session = bedrockClient.createStreamSession(sessionId);

        setupSessionEventHandlers(session, socket);

        socketSessions.set(sessionId, session);
        sessionStates.set(sessionId, SessionState.READY);

        console.log(`Session ${sessionId} created and ready, stored in maps`);
        console.log(`Session map size: ${socketSessions.size}, States map size: ${sessionStates.size}`);
        console.log(`Stored session for ${sessionId}:`, !!socketSessions.get(sessionId));

        return session;
    } catch (error) {
        console.error(`Error creating session for ${sessionId}:`, error);
        sessionStates.set(sessionId, SessionState.CLOSED);
        throw error;
    }
}

// Helper function to set up event handlers for a session
function setupSessionEventHandlers(session, socket) {
    session.onEvent('usageEvent', (data) => {
        console.log('usageEvent:', data);
        socket.emit('usageEvent', data);
    });

    session.onEvent('completionStart', (data) => {
        console.log('completionStart:', data);
        socket.emit('completionStart', data);
    });

    session.onEvent('contentStart', (data) => {
        console.log('contentStart:', data);
        socket.emit('contentStart', data);
    });

    session.onEvent('textOutput', (data) => {
        console.log('Text output:', data);
        socket.emit('textOutput', data);
    });

    session.onEvent('audioOutput', (data) => {
        console.log('Audio output received, sending to client');
        socket.emit('audioOutput', data);
    });

    session.onEvent('error', (data) => {
        console.error('Error in session:', data);
        socket.emit('error', data);
    });

    session.onEvent('toolUse', (data) => {
        console.log('Tool use detected:', data.toolName);
        socket.emit('toolUse', data);
    });

    session.onEvent('toolResult', (data) => {
        console.log('Tool result received');
        socket.emit('toolResult', data);
    });

    session.onEvent('contentEnd', (data) => {
        console.log('Content end received: ', data);
        socket.emit('contentEnd', data);
    });

    session.onEvent('streamComplete', () => {
        console.log('Stream completed for client:', socket.id);
        socket.emit('streamComplete');
        sessionStates.set(socket.id, SessionState.CLOSED);
    });
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    sessionStates.set(socket.id, SessionState.CLOSED);

    const connectionInterval = setInterval(() => {
        const connectionCount = Object.keys(io.sockets.sockets).length;
        console.log(`Active socket connections: ${connectionCount}`);
    }, 60000);

    // Handle language preference setting
    socket.on('setLanguage', (language) => {
        // Validate language code
        const supportedLanguages = ['en', 'hi', 'it', 'fr', 'de', 'es'];
        if (language && supportedLanguages.includes(language)) {
            console.log(`Setting language for session ${socket.id}: ${language}`);
            sessionLanguages.set(socket.id, language);
        } else if (!language) {
            console.info(`No language preference received for session ${socket.id}, defaulting to English`);
            sessionLanguages.set(socket.id, 'en');
        } else {
            console.warn(`Invalid language code received: ${language}, defaulting to English`);
            sessionLanguages.set(socket.id, 'en');
        }
    });

    // Handle voice gender preference setting
    socket.on('setVoiceGender', (gender) => {
        // Validate gender
        const supportedGenders = ['male', 'female'];
        if (gender && supportedGenders.includes(gender)) {
            console.log(`Setting voice gender for session ${socket.id}: ${gender}`);
            sessionVoiceGenders.set(socket.id, gender);
        } else {
            console.info(`No voice gender preference received for session ${socket.id}, defaulting to female`);
            sessionVoiceGenders.set(socket.id, 'female');
        }
    });

    // Handle interaction mode preference setting
    socket.on('setInteractionMode', (mode) => {
        // Validate mode
        const supportedModes = ['voice-audio', 'voice-text', 'text-chat'];
        if (mode && supportedModes.includes(mode)) {
            console.log(`Setting interaction mode for session ${socket.id}: ${mode}`);
            sessionInteractionModes.set(socket.id, mode);
        } else {
            console.info(`No interaction mode preference received for session ${socket.id}, defaulting to voice-audio`);
            sessionInteractionModes.set(socket.id, 'voice-audio');
        }
    });

    // Handle text message (for text chat mode)
    socket.on('textMessage', async (data) => {
        try {
            console.log(`[${socket.id}] Text message received:`, data.message);
            
            const language = sessionLanguages.get(socket.id) || 'en';
            
            // Check if this is a weather-related query
            if (isWeatherQuery(data.message)) {
                console.log(`[${socket.id}] Weather query detected`);
                
                // Extract location from message
                let location = extractLocation(data.message);
                
                // If no location found, ask user for location
                if (!location) {
                    const askLocationMessage = language === 'hi'
                        ? 'कृपया मुझे बताएं कि आप किस स्थान के लिए मौसम की जानकारी चाहते हैं? (उदाहरण: बेंगलुरु, दिल्ली, मुंबई)'
                        : 'Please tell me which location you want weather information for? (Example: Bangalore, Delhi, Mumbai)';
                    
                    socket.emit('textResponse', {
                        content: askLocationMessage,
                        language: language
                    });
                    return;
                }
                
                console.log(`[${socket.id}] Extracted location: ${location}`);
                
                // Get coordinates for the location
                const coords = await getCoordinates(location);
                
                if (!coords) {
                    const errorMessage = language === 'hi'
                        ? `क्षमा करें, मैं "${location}" के लिए स्थान नहीं ढूंढ सका। कृपया एक वैध भारतीय शहर का नाम दें।`
                        : `Sorry, I couldn't find the location "${location}". Please provide a valid Indian city name.`;
                    
                    socket.emit('textResponse', {
                        content: errorMessage,
                        language: language
                    });
                    return;
                }
                
                // Fetch weather forecast
                const forecastData = await getWeatherForecast(coords.lat, coords.lon);
                
                if (!forecastData) {
                    const errorMessage = language === 'hi'
                        ? 'क्षमा करें, मैं मौसम की जानकारी प्राप्त नहीं कर सका। कृपया बाद में पुनः प्रयास करें।'
                        : 'Sorry, I could not fetch weather information. Please try again later.';
                    
                    socket.emit('textResponse', {
                        content: errorMessage,
                        language: language
                    });
                    return;
                }
                
                // Analyze forecast data
                const weatherAnalysis = analyzeWeatherForecast(forecastData);
                
                // Format and send weather message
                const weatherMessage = formatWeatherMessage(weatherAnalysis, language);
                
                socket.emit('textResponse', {
                    content: weatherMessage,
                    language: language,
                    isWeatherData: true
                });
                
                return;
            }
            
            // Regular text chat (non-weather queries)
            // Use AWS Bedrock Converse API for text-only chat
            const client = new BedrockRuntimeClient({
                region: process.env.AWS_REGION || "us-east-1",
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN })
                }
            });
            
            // Prepare the conversation
            const conversation = [
                {
                    role: "user",
                    content: [{ text: data.message }]
                }
            ];
            
            // Create the converse command
            const command = new ConverseCommand({
                modelId: "us.amazon.nova-pro-v1:0", // Using Nova Pro for text
                messages: conversation,
                system: [{ text: data.systemPrompt }],
                inferenceConfig: {
                    maxTokens: 1024,
                    temperature: 0.7,
                    topP: 0.9
                }
            });
            
            console.log(`[${socket.id}] Sending request to AWS Bedrock...`);
            
            // Send request to Bedrock
            const response = await client.send(command);
            
            console.log(`[${socket.id}] Received response from AWS Bedrock`);
            
            // Extract the response text
            const responseText = response.output.message.content[0].text;
            
            // Send response back to client
            socket.emit('textResponse', {
                content: responseText,
                language: language
            });
            
        } catch (error) {
            console.error(`[${socket.id}] ERROR processing text message:`, error);
            socket.emit('textResponse', {
                content: `I apologize, but I encountered an error processing your message. Please try again. Error: ${error.message}`,
                language: sessionLanguages.get(socket.id) || 'en'
            });
        }
    });

    // Handle weather query request (can be called from any mode)
    socket.on('weatherQuery', async (data) => {
        try {
            console.log(`[${socket.id}] Weather query request:`, data.location);
            
            const language = sessionLanguages.get(socket.id) || 'en';
            const location = data.location;
            
            if (!location) {
                socket.emit('weatherResponse', {
                    success: false,
                    message: language === 'hi'
                        ? 'कृपया एक स्थान प्रदान करें।'
                        : 'Please provide a location.'
                });
                return;
            }
            
            // Get coordinates for the location
            const coords = await getCoordinates(location);
            
            if (!coords) {
                socket.emit('weatherResponse', {
                    success: false,
                    message: language === 'hi'
                        ? `क्षमा करें, मैं "${location}" के लिए स्थान नहीं ढूंढ सका।`
                        : `Sorry, I couldn't find the location "${location}".`
                });
                return;
            }
            
            // Fetch weather forecast
            const forecastData = await getWeatherForecast(coords.lat, coords.lon);
            
            if (!forecastData) {
                socket.emit('weatherResponse', {
                    success: false,
                    message: language === 'hi'
                        ? 'मौसम की जानकारी प्राप्त नहीं कर सका।'
                        : 'Could not fetch weather information.'
                });
                return;
            }
            
            // Analyze forecast data
            const weatherAnalysis = analyzeWeatherForecast(forecastData);
            
            // Format weather message
            const weatherMessage = formatWeatherMessage(weatherAnalysis, language);
            
            socket.emit('weatherResponse', {
                success: true,
                message: weatherMessage,
                data: weatherAnalysis
            });
            
        } catch (error) {
            console.error(`[${socket.id}] ERROR processing weather query:`, error);
            socket.emit('weatherResponse', {
                success: false,
                message: 'Error fetching weather data.'
            });
        }
    });

    // Handle session initialization request
    socket.on('initializeConnection', async (callback) => {
        try {
            const currentState = sessionStates.get(socket.id);
            console.log(`Initializing session for ${socket.id}, current state: ${currentState}`);
            if (currentState === SessionState.INITIALIZING || currentState === SessionState.READY || currentState === SessionState.ACTIVE) {
                console.log(`Session already exists for ${socket.id}, state: ${currentState}`);
                if (callback) callback({ success: true });
                return;
            }

            await createNewSession(socket);

            console.log(`Starting AWS Bedrock connection for ${socket.id}`);
            bedrockClient.initiateBidirectionalStreaming(socket.id);

            sessionStates.set(socket.id, SessionState.ACTIVE);

            if (callback) callback({ success: true });

        } catch (error) {
            console.error('Error initializing session:', error);
            sessionStates.set(socket.id, SessionState.CLOSED);
            if (callback) callback({ success: false, error: error instanceof Error ? error.message : String(error) });
            socket.emit('error', {
                message: 'Failed to initialize session',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Handle starting a new chat
    socket.on('startNewChat', async () => {
        try {
            const currentState = sessionStates.get(socket.id);
            console.log(`Starting new chat for ${socket.id}, current state: ${currentState}`);

            const existingSession = socketSessions.get(socket.id);
            if (existingSession && bedrockClient.isSessionActive(socket.id)) {
                console.log(`Cleaning up existing session for ${socket.id}`);
                try {
                    await existingSession.endAudioContent();
                    await existingSession.endPrompt();
                    await existingSession.close();
                } catch (cleanupError) {
                    console.error(`Error during cleanup for ${socket.id}:`, cleanupError);
                    bedrockClient.forceCloseSession(socket.id);
                }
                socketSessions.delete(socket.id);
            }

            await createNewSession(socket);
        } catch (error) {
            console.error('Error starting new chat:', error);
            socket.emit('error', {
                message: 'Failed to start new chat',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Audio input handler with session validation
    socket.on('audioInput', async (audioData) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);

            if (!session) {
                console.error(`[${socket.id}] ERROR: No session found for audio input`);
                socket.emit('error', {
                    message: 'No active session for audio input',
                    details: `Session does not exist. Please restart the session.`
                });
                return;
            }

            if (currentState !== SessionState.ACTIVE) {
                console.error(`[${socket.id}] ERROR: Invalid session state for audio input. Current state: ${currentState}, Expected: ${SessionState.ACTIVE}`);
                socket.emit('error', {
                    message: 'Session not ready for audio input',
                    details: `Session state is ${currentState}. Session must be ACTIVE to receive audio. Please wait for initialization to complete.`
                });
                return;
            }

            const audioBuffer = typeof audioData === 'string'
                ? Buffer.from(audioData, 'base64')
                : Buffer.from(audioData);

            await session.streamAudio(audioBuffer);

        } catch (error) {
            console.error(`[${socket.id}] ERROR processing audio:`, error);
            socket.emit('error', {
                message: 'Error processing audio',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('promptStart', async () => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            const language = sessionLanguages.get(socket.id) || 'en';
            const voiceGender = sessionVoiceGenders.get(socket.id) || 'female';
            console.log(`[${socket.id}] Prompt start received, session exists: ${!!session}, state: ${currentState}, language: ${language}, voice gender: ${voiceGender}`);

            if (!session) {
                console.error(`[${socket.id}] ERROR: No session found for promptStart`);
                socket.emit('error', { message: 'No active session for prompt start' });
                return;
            }

            console.log(`[${socket.id}] Setting up session and prompt start with language: ${language}, voice gender: ${voiceGender}...`);
            
            // Create language-specific audio output configuration
            const audioOutputConfig = {
                audioType: "SPEECH",
                encoding: "base64",
                mediaType: "audio/lpcm",
                sampleRateHertz: 24000,
                sampleSizeBits: 16,
                channelCount: 1,
                voiceId: "kiara" // Default voice
            };
            
            // Set voice based on gender (AWS Bedrock Nova Sonic voices)
            // Female voices: kiara, tiffany
            // Male voices: matthew, liam
            if (voiceGender === 'male') {
                audioOutputConfig.voiceId = 'matthew'; // Male voice
            } else {
                audioOutputConfig.voiceId = 'kiara'; // Female voice (default)
            }
            
            console.log(`[${socket.id}] Using voice: ${audioOutputConfig.voiceId} for language: ${language}, gender: ${voiceGender}`);
            
            await session.setupSessionAndPromptStart(audioOutputConfig);
            console.log(`[${socket.id}] Prompt start completed successfully`);
        } catch (error) {
            console.error(`[${socket.id}] ERROR processing prompt start:`, error);
            socket.emit('error', {
                message: 'Error processing prompt start',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('systemPrompt', async (data) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            console.log(`[${socket.id}] System prompt received, session exists: ${!!session}, state: ${currentState}`);

            if (!session) {
                console.error(`[${socket.id}] ERROR: No session found for systemPrompt`);
                socket.emit('error', { message: 'No active session for system prompt' });
                return;
            }

            console.log(`[${socket.id}] Setting up system prompt...`);
            await session.setupSystemPrompt(undefined, data);
            console.log(`[${socket.id}] System prompt completed successfully`);
        } catch (error) {
            console.error(`[${socket.id}] ERROR processing system prompt:`, error);
            socket.emit('error', {
                message: 'Error processing system prompt',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('audioStart', async (data) => {
        try {
            const session = socketSessions.get(socket.id);
            const currentState = sessionStates.get(socket.id);
            const language = sessionLanguages.get(socket.id) || 'en';
            console.log(`[${socket.id}] Audio start received, session exists: ${!!session}, state: ${currentState}, language: ${language}`);

            if (!session) {
                console.error(`[${socket.id}] ERROR: No session found for audioStart`);
                socket.emit('error', { message: 'No active session for audio start' });
                return;
            }

            console.log(`[${socket.id}] Setting up audio start with language: ${language}...`);
            
            // Create language-specific audio configuration
            const audioConfig = {
                audioType: "SPEECH",
                encoding: "base64",
                mediaType: "audio/lpcm",
                sampleRateHertz: 24000,
                sampleSizeBits: 16,
                channelCount: 1,
                voiceId: "kiara" // Default voice
            };
            
            // Set voice based on language
            const voiceMap = {
                'en': 'kiara',
                'hi': 'kiara', // Hindi voice
                'it': 'kiara', // Italian voice
                'fr': 'kiara', // French voice
                'de': 'kiara', // German voice
                'es': 'kiara'  // Spanish voice
            };
            
            audioConfig.voiceId = voiceMap[language] || 'kiara';
            console.log(`[${socket.id}] Using voice: ${audioConfig.voiceId} for language: ${language}`);
            
            await session.setupStartAudio(audioConfig);
            console.log(`[${socket.id}] Audio start setup completed successfully`);

            // Mark session as ACTIVE - ready to receive audio
            sessionStates.set(socket.id, SessionState.ACTIVE);
            console.log(`[${socket.id}] Session state set to ACTIVE`);

            // Send audioReady event to client
            socket.emit('audioReady');
            console.log(`[${socket.id}] audioReady event sent to client`);
        } catch (error) {
            console.error(`[${socket.id}] ERROR in audio start:`, error);
            sessionStates.set(socket.id, SessionState.CLOSED);
            socket.emit('error', {
                message: 'Error processing audio start',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    socket.on('stopAudio', async () => {
        try {
            const session = socketSessions.get(socket.id);
            if (!session || cleanupInProgress.get(socket.id)) {
                console.log('No active session to stop or cleanup already in progress');
                return;
            }

            console.log('Stop audio requested, beginning proper shutdown sequence');
            cleanupInProgress.set(socket.id, true);
            sessionStates.set(socket.id, SessionState.CLOSED);

            const cleanupPromise = Promise.race([
                (async () => {
                    await session.endAudioContent();
                    await session.endPrompt();
                    await session.close();
                    console.log('Session cleanup complete');
                })(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session cleanup timeout')), 5000)
                )
            ]);

            await cleanupPromise;

            socketSessions.delete(socket.id);
            cleanupInProgress.delete(socket.id);

            socket.emit('sessionClosed');

        } catch (error) {
            console.error('Error processing streaming end events:', error);

            try {
                bedrockClient.forceCloseSession(socket.id);
                socketSessions.delete(socket.id);
                cleanupInProgress.delete(socket.id);
                sessionStates.set(socket.id, SessionState.CLOSED);
            } catch (forceError) {
                console.error('Error during force cleanup:', forceError);
            }

            socket.emit('error', {
                message: 'Error processing streaming end events',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('Client disconnected abruptly:', socket.id);

        clearInterval(connectionInterval);

        const session = socketSessions.get(socket.id);
        const sessionId = socket.id;

        if (session && bedrockClient.isSessionActive(sessionId) && !cleanupInProgress.get(socket.id)) {
            try {
                console.log(`Beginning cleanup for abruptly disconnected session: ${socket.id}`);
                cleanupInProgress.set(socket.id, true);

                const cleanupPromise = Promise.race([
                    (async () => {
                        await session.endAudioContent();
                        await session.endPrompt();
                        await session.close();
                    })(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Session cleanup timeout')), 3000)
                    )
                ]);

                await cleanupPromise;
                console.log(`Successfully cleaned up session after abrupt disconnect: ${socket.id}`);
            } catch (error) {
                console.error(`Error cleaning up session after disconnect: ${socket.id}`, error);
                try {
                    bedrockClient.forceCloseSession(sessionId);
                    console.log(`Force closed session: ${sessionId}`);
                } catch (e) {
                    console.error(`Failed even force close for session: ${sessionId}`, e);
                }
            }
        }

        socketSessions.delete(socket.id);
        sessionStates.delete(socket.id);
        cleanupInProgress.delete(socket.id);
        sessionLanguages.delete(socket.id);
        sessionVoiceGenders.delete(socket.id);
        sessionInteractionModes.delete(socket.id);

        console.log(`Cleanup complete for disconnected client: ${socket.id}`);
    });
});

// Health check endpoint
app.get('/health', (_req, res) => {
    const activeSessions = bedrockClient.getActiveSessions().length;
    const socketConnections = Object.keys(io.sockets.sockets).length;

    res.status(200).json({
        status: 'ok123',
        timestamp: new Date().toISOString(),
        activeSessions,
        socketConnections
    });
});

// Weather API test endpoint
app.get('/test-weather', async (req, res) => {
    try {
        const location = req.query.location || 'Bangalore';
        
        console.log(`\n=== Testing Weather API for: ${location} ===`);
        
        // Test geocoding
        const coords = await getCoordinates(location);
        
        if (!coords) {
            return res.status(404).json({
                success: false,
                message: `Could not find coordinates for ${location}`,
                apiKey: process.env.OPEN_WEATHER_APIKEY ? 'Present' : 'Missing'
            });
        }
        
        console.log(`Coordinates found:`, coords);
        
        // Test weather forecast
        const forecastData = await getWeatherForecast(coords.lat, coords.lon);
        
        if (!forecastData) {
            return res.status(500).json({
                success: false,
                message: 'Could not fetch weather forecast',
                coordinates: coords
            });
        }
        
        console.log(`Forecast data received: ${forecastData.list.length} data points`);
        
        // Analyze forecast
        const analysis = analyzeWeatherForecast(forecastData);
        
        console.log(`Analysis:`, analysis);
        
        // Format message
        const message = formatWeatherMessage(analysis, 'en');
        
        res.status(200).json({
            success: true,
            location: location,
            coordinates: coords,
            forecastPoints: forecastData.list.length,
            analysis: analysis,
            message: message
        });
        
    } catch (error) {
        console.error('Weather test error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the application`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down server...');

    const forceExitTimer = setTimeout(() => {
        console.error('Forcing server shutdown after timeout');
        process.exit(1);
    }, 5000);

    try {
        await new Promise(resolve => io.close(resolve));
        console.log('Socket.IO server closed');

        const activeSessions = bedrockClient.getActiveSessions();
        console.log(`Closing ${activeSessions.length} active sessions...`);

        await Promise.all(activeSessions.map(async (sessionId) => {
            try {
                await bedrockClient.closeSession(sessionId);
                console.log(`Closed session ${sessionId} during shutdown`);
            } catch (error) {
                console.error(`Error closing session ${sessionId} during shutdown:`, error);
                bedrockClient.forceCloseSession(sessionId);
            }
        }));

        await new Promise(resolve => server.close(resolve));
        clearTimeout(forceExitTimer);
        console.log('Server shut down');
        process.exit(0);
    } catch (error) {
        console.error('Error during server shutdown:', error);
        process.exit(1);
    }
});
