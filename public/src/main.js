import { AudioPlayer } from './lib/play/AudioPlayer.js';
import { ChatHistoryManager } from "./lib/util/ChatHistoryManager.js";

// Connect to the server
const socket = io();

// DOM elements
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const statusElement = document.getElementById('status');
const chatContainer = document.getElementById('chat-container');
const microphoneBtn = document.getElementById('microphone-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const muteBtn = document.getElementById('mute-btn');
const languageSelect = document.getElementById('language-select');
const responseStyleSelect = document.getElementById('response-style');
const themeSelect = document.getElementById('theme-select');
const voiceGenderSelect = document.getElementById('voice-gender');
const interactionModeSelect = document.getElementById('interaction-mode');
const textChatInput = document.getElementById('text-chat-input');
const textInputField = document.getElementById('text-input');
const sendTextBtn = document.getElementById('send-text-btn');

// Language selection state
let selectedLanguage = 'en'; // default to English
let selectedResponseStyle = 'concise'; // default to concise
let selectedTheme = 'emerald'; // default to emerald theme
let selectedVoiceGender = 'female'; // default to female
let selectedInteractionMode = 'voice-audio'; // default to voice + audio

// Load preferences from sessionStorage on page load
const storedLanguage = sessionStorage.getItem('selectedLanguage');
if (storedLanguage) {
    selectedLanguage = storedLanguage;
    if (languageSelect) {
        languageSelect.value = storedLanguage;
    }
}

const storedResponseStyle = sessionStorage.getItem('selectedResponseStyle');
if (storedResponseStyle) {
    selectedResponseStyle = storedResponseStyle;
    if (responseStyleSelect) {
        responseStyleSelect.value = storedResponseStyle;
    }
}

const storedTheme = sessionStorage.getItem('selectedTheme');
if (storedTheme) {
    selectedTheme = storedTheme;
    if (themeSelect) {
        themeSelect.value = storedTheme;
    }
    // Apply theme immediately
    document.body.setAttribute('data-theme', storedTheme);
} else {
    // Apply default theme
    document.body.setAttribute('data-theme', 'emerald');
}

const storedVoiceGender = sessionStorage.getItem('selectedVoiceGender');
if (storedVoiceGender) {
    selectedVoiceGender = storedVoiceGender;
    if (voiceGenderSelect) {
        voiceGenderSelect.value = storedVoiceGender;
    }
}

const storedInteractionMode = sessionStorage.getItem('selectedInteractionMode');
if (storedInteractionMode) {
    selectedInteractionMode = storedInteractionMode;
    if (interactionModeSelect) {
        interactionModeSelect.value = storedInteractionMode;
    }
    // Apply interaction mode UI changes
    updateInteractionModeUI();
} else {
    updateInteractionModeUI();
}

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };

// Track conversation data for PDF export
let conversationData = {
    messages: [],
    resources: [],
    images: [],
    startTime: null,
    endTime: null
};

const chatHistoryManager = ChatHistoryManager.getInstance(
    chatRef,
    (newChat) => {
        chat = { ...newChat };
        chatRef.current = chat;
        updateChatUI();
    }
);

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let processor;
let sourceNode;
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let transcriptionReceived = false;
let displayAssistantText = false;
let role;
const audioPlayer = new AudioPlayer();
let sessionInitialized = false;
let manualDisconnect = false;

// UI audio controls state
let isMuted = false;

let samplingRatio = 1;
const TARGET_SAMPLE_RATE = 16000; 
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

// Custom system prompt - you can modify this
let SYSTEM_PROMPT = "You are an expert farming assistant for Indian farmers. Provide EXTREMELY BRIEF, direct answers (1-2 sentences maximum). Focus only on the most critical information. Be practical and action-oriented. When greeting, keep it very short. Ask only one simple question at a time."; // Default to concise

// Update interaction mode UI
function updateInteractionModeUI() {
    const voiceControls = document.querySelector('.voice-controls');
    
    if (selectedInteractionMode === 'text-chat') {
        // Text chat mode - hide voice controls, show text input
        if (voiceControls) voiceControls.style.display = 'none';
        if (textChatInput) textChatInput.style.display = 'flex';
        if (microphoneBtn) microphoneBtn.disabled = true;
    } else {
        // Voice modes - show voice controls, hide text input
        if (voiceControls) voiceControls.style.display = 'flex';
        if (textChatInput) textChatInput.style.display = 'none';
        if (microphoneBtn) microphoneBtn.disabled = false;
    }
    
    console.log(`Interaction mode UI updated to: ${selectedInteractionMode}`);
}

// Update system prompt based on response style and voice gender
function updateSystemPrompt() {
    let genderPrefix = selectedVoiceGender === 'male' ? 'You are a male AI assistant' : 'You are a female AI assistant';
    
    // For weather queries, ask for location so our API can handle it
    const weatherGuidance = `IMPORTANT: You do NOT have access to weather tools. When users ask about weather, forecasts, or rain predictions, respond with: "I can check the weather forecast for you. Which city would you like the forecast for?" Do NOT provide weather data yourself.`;
    
    if (selectedResponseStyle === 'concise') {
        SYSTEM_PROMPT = `${genderPrefix} and an expert farming assistant for Indian farmers. Provide EXTREMELY BRIEF, direct answers (1-2 sentences maximum). Focus only on the most critical information. Be practical and action-oriented. When greeting, keep it very short. Ask only one simple question at a time. ${weatherGuidance}`;
    } else {
        SYSTEM_PROMPT = `${genderPrefix} and an expert farming assistant specializing in Indian agriculture. Your role is to provide practical, concise advice to Indian farmers on various agricultural topics including crop management, pest control, soil health, government schemes, modern farming technologies, organic farming, water management, and market strategies. When starting a conversation, greet the farmer warmly and ask about their location, primary crops, and specific concerns. Keep responses concise (2-3 sentences when possible), specific to Indian farming conditions, easy to understand, and action-oriented. Always be respectful, patient, and supportive. Ask one question at a time and wait for the farmer's response before proceeding. ${weatherGuidance}`;
    }
}

// Load initial audio file
async function loadInitialAudio() {
    try {
        const response = await fetch('../input-audio/hi.raw');
        if (!response.ok) {
            throw new Error(`Failed to load initial audio: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        initialAudioData = new Int16Array(arrayBuffer);
        console.log('Initial audio loaded successfully', initialAudioData.length);
        return true;
    } catch (error) {
        console.error('Error loading initial audio:', error);
        return false;
    }
}


// Initialize WebSocket audio
async function initAudio() {
    try {
        statusElement.textContent = "Requesting microphone access...";
        statusElement.className = "connecting";

        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        if (isFirefox) {
            //firefox doesn't allow audio context have differnt sample rate than what the user media device offers
            audioContext = new AudioContext();
        } else {
            audioContext = new AudioContext({
                sampleRate: TARGET_SAMPLE_RATE
            });
        }

        //samplingRatio - is only relevant for firefox, for Chromium based browsers, it's always 1
        samplingRatio = audioContext.sampleRate / TARGET_SAMPLE_RATE;
        console.log(`Debug AudioContext- sampleRate: ${audioContext.sampleRate} samplingRatio: ${samplingRatio}`)
        

        await audioPlayer.start();

        updateStatus("Farming Assistant ready. Select your language and click the microphone.", "connected");
        startButton.disabled = false;
    } catch (error) {
        console.error("Error accessing microphone:", error);
        updateStatus("Error: " + error.message, "error");
    }
}

// Initialize the session with Bedrock
async function initializeSession() {
    if (sessionInitialized) {
        console.log('Session already initialized, skipping...');
        return;
    }

    updateStatus("Initializing session...", "disconnected");

    try {
        console.log('Step 1: Requesting connection initialization...');
        // Wait for server acknowledgment before proceeding
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
            
            socket.emit('initializeConnection', (ack) => {
                clearTimeout(timeout);
                if (ack?.success) {
                    console.log('Connection initialized successfully');
                    resolve();
                } else {
                    reject(new Error(ack?.error || 'Connection failed'));
                }
            });
        });

        console.log('Step 2: Sending language preference...');
        // Send language preference to backend BEFORE other events
        socket.emit('setLanguage', selectedLanguage);
        console.log(`Language preference sent to backend: ${selectedLanguage}`);
        
        // Send voice gender preference to backend
        socket.emit('setVoiceGender', selectedVoiceGender);
        console.log(`Voice gender preference sent to backend: ${selectedVoiceGender}`);
        
        // Send interaction mode preference to backend
        socket.emit('setInteractionMode', selectedInteractionMode);
        console.log(`Interaction mode preference sent to backend: ${selectedInteractionMode}`);

        // Small delay to ensure preferences are set
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('Step 3: Starting prompt sequence...');
        // Send events in sequence with small delays
        socket.emit('promptStart');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Step 4: Sending system prompt...');
        socket.emit('systemPrompt', SYSTEM_PROMPT);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Step 5: Starting audio...');
        socket.emit('audioStart');

        console.log('Step 6: Waiting for audioReady event...');
        // Wait for audioReady event from backend before marking session as initialized
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Audio ready timeout after 15 seconds')), 15000);
            
            socket.once('audioReady', () => {
                clearTimeout(timeout);
                console.log('✓ Audio ready event received from backend');
                resolve();
            });
        });

        // Add a longer delay to ensure backend is fully ready
        console.log('Step 7: Final wait for backend readiness...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Mark session as initialized
        sessionInitialized = true;
        updateStatus("✓ Session ready - You can start speaking", "connected");
        console.log('✓ Session fully initialized and ready for audio input');
    } catch (error) {
        console.error("Failed to initialize session:", error);
        updateStatus("Error initializing session: " + error.message, "error");
        sessionInitialized = false;
        throw error;
    }
}

async function startStreaming() {
    if (isStreaming) return;

    try {
        updateStatus("Preparing to start...", "disconnected");
        
        // Reconnect if disconnected
        if (!socket.connected) {
            socket.connect();
            // Wait for connection
            await new Promise((resolve) => {
                if (socket.connected) {
                    resolve();
                } else {
                    socket.once('connect', resolve);
                }
            });
        }

        // Restart audioPlayer if needed
        if (!audioPlayer.initialized) {
            await audioPlayer.start();
        }

        // First, make sure the session is initialized and READY
        if (!sessionInitialized) {
            console.log('Initializing session before streaming...');
            await initializeSession();
            // Add a longer delay to ensure backend is fully ready
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Session is ready, starting audio streaming...');

        // Create audio processor
        sourceNode = audioContext.createMediaStreamSource(audioStream);

        // Use ScriptProcessorNode for audio processing
        if (audioContext.createScriptProcessor) {
            processor = audioContext.createScriptProcessor(512, 1, 1);

            processor.onaudioprocess = (e) => {
                // Double-check session is still initialized before sending audio
                if (!isStreaming || !sessionInitialized) return;
                if (isMuted) return; // respect mute toggle

                const inputData = e.inputBuffer.getChannelData(0);
                const numSamples = Math.round(inputData.length / samplingRatio)
                const pcmData = isFirefox ? (new Int16Array(numSamples)) : (new Int16Array(inputData.length));
                
                // Convert to 16-bit PCM
                if (isFirefox) {                    
                    for (let i = 0; i < inputData.length; i++) {
                        //NOTE: for firefox the samplingRatio is not 1, 
                        // so it will downsample by skipping some input samples
                        // A better approach is to compute the mean of the samplingRatio samples.
                        // or pass through a low-pass filter first 
                        // But skipping is a preferable low-latency operation
                        pcmData[i] = Math.max(-1, Math.min(1, inputData[i * samplingRatio])) * 0x7FFF;
                    }
                } else {
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                    }
                }
                

                // Convert to base64 (browser-safe way)
                const base64Data = arrayBufferToBase64(pcmData.buffer);

                // Send to server
                socket.emit('audioInput', base64Data);
            };

            sourceNode.connect(processor);
            processor.connect(audioContext.destination);
        }

        isStreaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        updateStatus("Listening... Speak now", "recording");

        // Show user thinking indicator when starting to record
        transcriptionReceived = false;
        showUserThinkingIndicator();

    } catch (error) {
        console.error("Error starting recording:", error);
        updateStatus("Error: " + error.message, "error");
        // Reset session state on error
        sessionInitialized = false;
    }
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary.push(String.fromCharCode(bytes[i]));
    }
    return btoa(binary.join(''));
}

function stopStreaming() {
    if (!isStreaming) return;

    isStreaming = false;

    // Clean up audio processing
    if (processor) {
        processor.disconnect();
        sourceNode.disconnect();
    }

    startButton.disabled = false;
    stopButton.disabled = true;
    updateStatus("Processing your request...", "disconnected");

    audioPlayer.bargeIn();
    // Tell server to finalize processing
    socket.emit('stopAudio');

    // End the current turn in chat history
    chatHistoryManager.endTurn();

    // Reset session for new connection
    sessionInitialized = false;
    
    // Mark as manual disconnect
    manualDisconnect = true;
    
    // Disconnect from server to end current session
    socket.disconnect();
    
    updateStatus("Stopped. Click microphone to start new session.", "disconnected");
}

// Base64 to Float32Array conversion
function base64ToFloat32Array(base64String) {
    try {
        const binaryString = window.atob(base64String);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        return float32Array;
    } catch (error) {
        console.error('Error in base64ToFloat32Array:', error);
        throw error;
    }
}

// Process message data and add to chat history
function handleTextOutput(data) {
    console.log("Processing text output:", data);
    if (data.content) {
        const messageData = {
            role: data.role,
            message: data.content,
            timestamp: new Date()
        };
        chatHistoryManager.addTextMessage(messageData);
        
        // Track for PDF export
        conversationData.messages.push({
            role: data.role,
            content: data.content,
            timestamp: new Date()
        });
        
        // Set start time if this is the first message
        if (!conversationData.startTime) {
            conversationData.startTime = new Date();
        }
        conversationData.endTime = new Date();
    }
}

// Show the "Listening" indicator for user
function showUserThinkingIndicator() {
    hideUserThinkingIndicator();

    waitingForUserTranscription = true;
    userThinkingIndicator = document.createElement('div');
    userThinkingIndicator.className = 'message user thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'USER';
    userThinkingIndicator.appendChild(roleLabel);

    const listeningText = document.createElement('div');
    listeningText.className = 'thinking-text';
    listeningText.textContent = 'Listening';
    userThinkingIndicator.appendChild(listeningText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    userThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(userThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Thinking" indicator for assistant
function showAssistantThinkingIndicator() {
    hideAssistantThinkingIndicator();

    waitingForAssistantResponse = true;
    assistantThinkingIndicator = document.createElement('div');
    assistantThinkingIndicator.className = 'message assistant thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'ASSISTANT';
    assistantThinkingIndicator.appendChild(roleLabel);

    const thinkingText = document.createElement('div');
    thinkingText.className = 'thinking-text';
    thinkingText.textContent = 'Thinking';
    assistantThinkingIndicator.appendChild(thinkingText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    assistantThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(assistantThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide the user thinking indicator
function hideUserThinkingIndicator() {
    waitingForUserTranscription = false;
    if (userThinkingIndicator && userThinkingIndicator.parentNode) {
        userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
    }
    userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
function hideAssistantThinkingIndicator() {
    waitingForAssistantResponse = false;
    if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
        assistantThinkingIndicator.parentNode.removeChild(assistantThinkingIndicator);
    }
    assistantThinkingIndicator = null;
}

// EVENT HANDLERS
// --------------

// Handle content start from the server
socket.on('contentStart', (data) => {
    console.log('Content start received:', data);

    if (data.type === 'TEXT') {
        // Below update will be enabled when role is moved to the contentStart
        role = data.role;
        if (data.role === 'USER') {
            // When user's text content starts, hide user thinking indicator
            hideUserThinkingIndicator();
        }
        else if (data.role === 'ASSISTANT') {
            // When assistant's text content starts, hide assistant thinking indicator
            hideAssistantThinkingIndicator();
            let isSpeculative = false;
            try {
                if (data.additionalModelFields) {
                    const additionalFields = JSON.parse(data.additionalModelFields);
                    isSpeculative = additionalFields.generationStage === "SPECULATIVE";
                    if (isSpeculative) {
                        console.log("Received speculative content");
                        displayAssistantText = true;
                    }
                    else {
                        displayAssistantText = false;
                    }
                }
            } catch (e) {
                console.error("Error parsing additionalModelFields:", e);
            }
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content starts, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Handle text output from the server
socket.on('textOutput', (data) => {
    console.log('Received text output:', data);

    if (role === 'USER') {
        // When user text is received, show thinking indicator for assistant response
        transcriptionReceived = true;
        //hideUserThinkingIndicator();

        // Add user message to chat
        handleTextOutput({
            role: data.role,
            content: data.content
        });
        
        // Check if this is a weather query in voice mode
        if (selectedInteractionMode !== 'text-chat' && isWeatherQuery(data.content)) {
            console.log('Weather query detected in voice mode:', data.content);
            
            // Extract location from the query
            const location = extractLocation(data.content);
            
            if (location) {
                console.log('Location extracted:', location);
                // Request weather data from server
                socket.emit('weatherQuery', { location: location });
            }
        }

        // Show assistant thinking indicator after user text appears
        showAssistantThinkingIndicator();
    }
    else if (role === 'ASSISTANT') {
        //hideAssistantThinkingIndicator();
        if (displayAssistantText) {
            handleTextOutput({
                role: data.role,
                content: data.content
            });
        }
        
        // ALWAYS update sidebar with contextual content regardless of display mode
        if (data.content) {
            updateSidebarContent(data.content);
        }
    }
});

// Handle weather response from server
socket.on('weatherResponse', (response) => {
    console.log('Weather response received:', response);
    
    if (response.success) {
        // Add weather data as assistant message
        const weatherMessageData = {
            role: 'ASSISTANT',
            message: response.message,
            timestamp: new Date()
        };
        
        chatHistoryManager.addTextMessage(weatherMessageData);
        
        // Track for PDF export
        conversationData.messages.push({
            role: 'ASSISTANT',
            content: response.message,
            timestamp: new Date()
        });
        
        conversationData.endTime = new Date();
        
        // Update status
        updateStatus("Weather forecast provided", "connected");
    } else {
        console.error('Weather query failed:', response.message);
    }
});

// Helper function to check if message is weather-related
function isWeatherQuery(message) {
    const weatherKeywords = [
        'weather', 'forecast', 'prediction', 'temperature', 'rain', 'rainfall',
        'मौसम', 'पूर्वानुमान', 'तापमान', 'बारिश', 'वर्षा',
        'tomorrow', 'कल', 'today', 'आज', 'climate', 'जलवायु'
    ];
    
    const lowerMessage = message.toLowerCase();
    return weatherKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Helper function to extract location from message
function extractLocation(message) {
    // Common patterns for location queries
    const patterns = [
        /(?:weather|forecast|prediction|temperature|rain).*?(?:in|for|at|near)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.|tomorrow|today)/i,
        /([a-zA-Z\s]+?)\s+(?:weather|forecast|prediction|temperature|rain)/i,
        /(?:tomorrow|today).*?(?:in|for|at|near)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.)/i,
        /(?:मौसम|पूर्वानुमान|तापमान|बारिश).*?(?:में|के लिए)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.)/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            const location = match[1].trim();
            // Filter out common words that aren't locations
            const excludeWords = ['the', 'will', 'be', 'is', 'what', 'how', 'when', 'where', 'में', 'के'];
            if (!excludeWords.includes(location.toLowerCase()) && location.length > 2) {
                return location;
            }
        }
    }
    
    return null;
}

// Handle audio output
socket.on('audioOutput', (data) => {
    // Only play audio if in voice-audio mode
    if (selectedInteractionMode === 'voice-audio' && data.content) {
        try {
            const audioData = base64ToFloat32Array(data.content);
            audioPlayer.playAudio(audioData);
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    } else if (selectedInteractionMode === 'voice-text') {
        // Voice to text mode - audio is muted, only show text
        console.log('Voice-to-text mode: Audio output muted, showing text only');
    }
});

// Handle content end events
socket.on('contentEnd', (data) => {
    console.log('Content end received:', data);

    if (data.type === 'TEXT') {
        if (role === 'USER') {
            // When user's text content ends, make sure assistant thinking is shown
            hideUserThinkingIndicator();
            showAssistantThinkingIndicator();
        }
        else if (role === 'ASSISTANT') {
            // When assistant's text content ends, prepare for user input in next turn
            hideAssistantThinkingIndicator();
        }

        // Handle stop reasons
        if (data.stopReason && data.stopReason.toUpperCase() === 'END_TURN') {
            chatHistoryManager.endTurn();
        } else if (data.stopReason && data.stopReason.toUpperCase() === 'INTERRUPTED') {
            console.log("Interrupted by user");
            handleInterruption();
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content ends, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Stream completion event
socket.on('streamComplete', () => {
    if (isStreaming) {
        stopStreaming();
    }
    updateStatus("Farming Assistant ready. Click microphone to begin.", "connected");
});

// Handle connection status updates
socket.on('connect', () => {
    updateStatus("Connected to server", "connected");
    sessionInitialized = false;
});

socket.on('disconnect', () => {
    if (manualDisconnect) {
        // Manual disconnect - keep buttons enabled for restart
        manualDisconnect = false;
        updateStatus("Stopped. Click microphone to begin new session.", "disconnected");
        startButton.disabled = false;
        stopButton.disabled = true;
    } else {
        // Unexpected disconnect - disable buttons
        updateStatus("Disconnected from server", "error");
        startButton.disabled = true;
        stopButton.disabled = true;
    }
    sessionInitialized = false;
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

// Handle errors
socket.on('error', (error) => {
    console.error("Server error:", error);
    updateStatus("Error: " + (error.message || JSON.stringify(error).substring(0, 50)), "error");
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

// Button event listeners
startButton.addEventListener('click', startStreaming);
stopButton.addEventListener('click', stopStreaming);

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    
    // Initialize system prompt based on stored preference
    updateSystemPrompt();
    
    // Initialize audio
    initAudio();
    
    // Set initial status
    updateStatus('Initializing...', 'disconnected');
    
    // Start date and time updates
    updateDateTime();
    setInterval(updateDateTime, 1000); // Update every second
    
    // Verify all required elements exist
    const requiredElements = {
        'status': document.getElementById('status'),
        'chat-container': document.getElementById('chat-container'),
        'microphone-btn': document.getElementById('microphone-btn'),
        'disconnect-btn': document.getElementById('disconnect-btn'),
        'mute-btn': document.getElementById('mute-btn'),
        'language-select': document.getElementById('language-select'),
        'response-style': document.getElementById('response-style'),
        'voice-gender': document.getElementById('voice-gender'),
        'interaction-mode': document.getElementById('interaction-mode'),
        'theme-select': document.getElementById('theme-select'),
        'text-chat-input': document.getElementById('text-chat-input'),
        'text-input': document.getElementById('text-input'),
        'send-text-btn': document.getElementById('send-text-btn'),
        'sidebar-content': document.getElementById('sidebar-content'),
        'media-content': document.getElementById('media-content')
    };
    
    for (const [name, element] of Object.entries(requiredElements)) {
        if (!element) {
            console.error(`Required element not found: ${name}`);
        } else {
            console.log(`✓ Element found: ${name}`);
        }
    }
});

// Function to update date and time display
function updateDateTime() {
    const now = new Date();
    
    // Format date - more compact
    const dateOptions = { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    };
    const dateStr = now.toLocaleDateString('en-IN', dateOptions);
    
    // Format time
    const timeOptions = { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
    };
    const timeStr = now.toLocaleTimeString('en-IN', timeOptions);
    
    // Update DOM
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');
    
    if (dateElement) dateElement.textContent = dateStr;
    if (timeElement) timeElement.textContent = timeStr;
}

// Language selector event listener
if (languageSelect) {
    languageSelect.addEventListener('change', (event) => {
        selectedLanguage = event.target.value;
        // Store in session storage for persistence
        try {
            sessionStorage.setItem('selectedLanguage', selectedLanguage);
        } catch (error) {
            console.warn('SessionStorage unavailable, language preference will not persist:', error);
        }
        console.log(`Language changed to: ${selectedLanguage}`);
        
        // If there's an active session, inform the user
        if (sessionInitialized || isStreaming) {
            updateStatus("Language will change in the next session", "disconnected");
        }
    });
}

// Response style selector event listener
if (responseStyleSelect) {
    responseStyleSelect.addEventListener('change', (event) => {
        selectedResponseStyle = event.target.value;
        // Store in session storage for persistence
        try {
            sessionStorage.setItem('selectedResponseStyle', selectedResponseStyle);
        } catch (error) {
            console.warn('SessionStorage unavailable, response style preference will not persist:', error);
        }
        console.log(`Response style changed to: ${selectedResponseStyle}`);
        
        // Update the system prompt
        updateSystemPrompt();
        
        // If there's an active session, inform the user
        if (sessionInitialized || isStreaming) {
            updateStatus("Response style will change in the next session", "disconnected");
        }
    });
}

// Theme selector event listener
if (themeSelect) {
    themeSelect.addEventListener('change', (event) => {
        selectedTheme = event.target.value;
        // Store in session storage for persistence
        try {
            sessionStorage.setItem('selectedTheme', selectedTheme);
        } catch (error) {
            console.warn('SessionStorage unavailable, theme preference will not persist:', error);
        }
        console.log(`Theme changed to: ${selectedTheme}`);
        
        // Apply theme immediately to body
        document.body.setAttribute('data-theme', selectedTheme);
        
        // Visual feedback
        updateStatus(`Theme changed to ${selectedTheme}`, 'connected');
        setTimeout(() => {
            if (!isStreaming) {
                updateStatus('Farming Assistant ready. Click microphone to begin.', 'connected');
            }
        }, 2000);
    });
}

// Voice gender selector event listener
if (voiceGenderSelect) {
    voiceGenderSelect.addEventListener('change', (event) => {
        selectedVoiceGender = event.target.value;
        // Store in session storage for persistence
        try {
            sessionStorage.setItem('selectedVoiceGender', selectedVoiceGender);
        } catch (error) {
            console.warn('SessionStorage unavailable, voice gender preference will not persist:', error);
        }
        console.log(`Voice gender changed to: ${selectedVoiceGender}`);
        
        // Update the system prompt
        updateSystemPrompt();
        
        // If there's an active session, inform the user
        if (sessionInitialized || isStreaming) {
            updateStatus("Voice gender will change in the next session", "disconnected");
        }
    });
}

// Interaction mode selector event listener
if (interactionModeSelect) {
    interactionModeSelect.addEventListener('change', (event) => {
        selectedInteractionMode = event.target.value;
        // Store in session storage for persistence
        try {
            sessionStorage.setItem('selectedInteractionMode', selectedInteractionMode);
        } catch (error) {
            console.warn('SessionStorage unavailable, interaction mode preference will not persist:', error);
        }
        console.log(`Interaction mode changed to: ${selectedInteractionMode}`);
        
        // Update UI based on mode
        updateInteractionModeUI();
        
        // If there's an active session, inform the user
        if (sessionInitialized || isStreaming) {
            updateStatus("Interaction mode will change in the next session", "disconnected");
        }
    });
}

// Function to handle microphone button click
microphoneBtn.addEventListener('click', () => {
    // Toggle streaming (start/stop)
    if (!isStreaming) {
        startStreaming();
        microphoneBtn.classList.add('active');
        microphoneBtn.title = 'Stop microphone';
        // Show disconnect button when session is active
        if (disconnectBtn) {
            disconnectBtn.style.display = 'flex';
        }
    } else {
        stopStreaming();
        microphoneBtn.classList.remove('active');
        microphoneBtn.title = 'Start microphone';
    }
});

// Disconnect button handler
if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
        console.log('Disconnect button clicked');
        
        // Stop streaming if active
        if (isStreaming) {
            stopStreaming();
        }
        
        // Hide disconnect button
        disconnectBtn.style.display = 'none';
        
        // Reset microphone button
        if (microphoneBtn) {
            microphoneBtn.classList.remove('active');
            microphoneBtn.title = 'Start microphone';
        }
        
        updateStatus('Disconnected. Click microphone to start new session.', 'disconnected');
    });
}

// Handle mute toggle
muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.classList.toggle('muted', isMuted);
    
    // Update SVG icon
    const btnIcon = muteBtn.querySelector('.btn-icon');
    if (btnIcon) {
        if (isMuted) {
            // Muted icon - speaker with X
            btnIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            `;
        } else {
            // Unmuted icon - speaker with sound waves
            btnIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            `;
        }
    }
    
    if (isMuted) {
        updateStatus('Microphone muted', 'disconnected');
    } else if (isStreaming) {
        updateStatus('Listening... Speak now', 'recording');
    } else {
        updateStatus('Farming Assistant ready. Click microphone to begin.', 'connected');
    }
});

// ===== CONTEXTUAL CONTENT HELPERS =====

// Enhanced keywords with more variations and better content
const contentKeywords = {
    pest: {
        keywords: ['pest', 'insect', 'bug', 'aphid', 'caterpillar', 'locust', 'termite', 'beetle'],
        images: [
            'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🐛 Integrated Pest Management', url: 'https://agricoop.nic.in/', desc: 'Government guidelines for pest control' },
            { title: '🌿 Organic Pest Control Methods', url: 'https://www.fao.org/pest-and-pesticide-management', desc: 'Natural pest management techniques' },
            { title: '📋 Pesticide Registration', url: 'https://ppqs.gov.in/', desc: 'Approved pesticides in India' }
        ]
    },
    crop: {
        keywords: ['crop', 'wheat', 'rice', 'paddy', 'maize', 'corn', 'soybean', 'cotton', 'sugarcane', 'cultivation', 'harvest', 'sowing', 'planting'],
        images: [
            'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🌾 Crop Production Guide', url: 'https://agricoop.nic.in/', desc: 'Best practices for major crops' },
            { title: '📅 Crop Calendar', url: 'https://www.fao.org/agriculture', desc: 'Seasonal crop planning' },
            { title: '🌱 Seed Varieties', url: 'https://seednet.gov.in/', desc: 'Certified seed information' }
        ]
    },
    soil: {
        keywords: ['soil', 'fertility', 'ph', 'nutrients', 'nitrogen', 'phosphorus', 'potassium', 'npk', 'compost', 'manure'],
        images: [
            'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🧪 Soil Health Card', url: 'https://soilhealth.dac.gov.in/', desc: 'Get your soil tested' },
            { title: '📊 Soil Testing Labs', url: 'https://agricoop.nic.in/', desc: 'Find nearby testing centers' },
            { title: '🌱 Soil Management Tips', url: 'https://www.fao.org/soils-portal', desc: 'Improve soil health' }
        ]
    },
    water: {
        keywords: ['water', 'irrigation', 'drip', 'sprinkler', 'flood', 'canal', 'well', 'borewell', 'rainfall', 'drought'],
        images: [
            'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop',
            'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '💧 Drip Irrigation Guide', url: 'https://agricoop.nic.in/', desc: 'Water-efficient irrigation' },
            { title: '🌊 Water Conservation', url: 'https://www.fao.org/water', desc: 'Save water in farming' },
            { title: '⛲ Pradhan Mantri Krishi Sinchayee Yojana', url: 'https://pmksy.gov.in/', desc: 'Irrigation scheme benefits' }
        ]
    },
    fertilizer: {
        keywords: ['fertilizer', 'urea', 'dap', 'potash', 'organic', 'biofertilizer', 'vermicompost', 'green manure'],
        images: [
            'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🧪 Fertilizer Recommendations', url: 'https://agricoop.nic.in/', desc: 'Crop-specific fertilizer guide' },
            { title: '🌿 Organic Fertilizers', url: 'https://www.fao.org/agriculture', desc: 'Natural alternatives' },
            { title: '💰 Fertilizer Subsidy', url: 'https://fert.nic.in/', desc: 'Government subsidy schemes' }
        ]
    },
    scheme: {
        keywords: ['scheme', 'subsidy', 'loan', 'credit', 'insurance', 'pm-kisan', 'kisan', 'government', 'yojana', 'benefit'],
        images: [],
        links: [
            { title: '💰 PM-KISAN Scheme', url: 'https://pmkisan.gov.in/', desc: '₹6000 annual income support' },
            { title: '💳 Kisan Credit Card', url: 'https://agricoop.nic.in/', desc: 'Easy farm credit access' },
            { title: '🛡️ Pradhan Mantri Fasal Bima Yojana', url: 'https://pmfby.gov.in/', desc: 'Crop insurance scheme' },
            { title: '🌾 MSP Information', url: 'https://agricoop.nic.in/', desc: 'Minimum Support Price' }
        ]
    },
    weather: {
        keywords: ['weather', 'rain', 'temperature', 'climate', 'monsoon', 'forecast', 'season'],
        images: [
            'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🌦️ IMD Weather Forecast', url: 'https://mausam.imd.gov.in/', desc: 'India Meteorological Department' },
            { title: '📱 Kisan Suvidha App', url: 'https://agricoop.nic.in/', desc: 'Weather alerts for farmers' }
        ]
    },
    disease: {
        keywords: ['disease', 'fungus', 'blight', 'rot', 'wilt', 'rust', 'mildew', 'virus', 'bacterial'],
        images: [
            'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?w=400&h=300&fit=crop'
        ],
        links: [
            { title: '🔬 Plant Disease Management', url: 'https://agricoop.nic.in/', desc: 'Identify and treat diseases' },
            { title: '🌿 Organic Disease Control', url: 'https://www.fao.org/', desc: 'Natural remedies' }
        ]
    }
};

// Function to detect keywords in text with better matching
function detectKeywords(text) {
    const lowerText = text.toLowerCase();
    const detected = new Set(); // Use Set to avoid duplicates
    
    for (const [category, data] of Object.entries(contentKeywords)) {
        // Check if any keyword matches
        const hasMatch = data.keywords.some(keyword => lowerText.includes(keyword));
        if (hasMatch) {
            detected.add(category);
        }
    }
    
    return Array.from(detected);
}

// Async function to update sidebar with contextual content
async function updateSidebarContent(text) {
    // Run in background without blocking
    setTimeout(async () => {
        try {
            const detectedCategories = detectKeywords(text);
            
            console.log('Detected categories:', detectedCategories);
            
            if (detectedCategories.length === 0) return;
            
            const sidebarContent = document.getElementById('sidebar-content');
            const mediaContent = document.getElementById('media-content');
            
            if (!sidebarContent || !mediaContent) return;
            
            // Update info sidebar with links
            let linksHTML = '<div class="contextual-content">';
            linksHTML += '<div class="content-header">📚 Related Resources</div>';
            
            detectedCategories.forEach(category => {
                const data = contentKeywords[category];
                if (data.links && data.links.length > 0) {
                    data.links.forEach(link => {
                        // Track resources for PDF export
                        if (!conversationData.resources.find(r => r.url === link.url)) {
                            conversationData.resources.push({
                                title: link.title,
                                description: link.desc,
                                url: link.url,
                                category: category,
                                timestamp: new Date()
                            });
                        }
                        
                        linksHTML += `
                            <div class="resource-card">
                                <h4>${link.title}</h4>
                                <p>${link.desc}</p>
                                <a href="${link.url}" target="_blank" rel="noopener noreferrer">Visit Resource →</a>
                            </div>
                        `;
                    });
                }
            });
            linksHTML += '</div>';
            
            sidebarContent.innerHTML = linksHTML;
            
            // Update media sidebar with images
            let imagesHTML = '<div class="content-header">🖼️ Visual Guides</div>';
            let hasImages = false;
            
            detectedCategories.forEach(category => {
                const data = contentKeywords[category];
                if (data.images && data.images.length > 0) {
                    hasImages = true;
                    data.images.forEach((imageUrl) => {
                        // Track images for PDF export
                        if (!conversationData.images.find(img => img.url === imageUrl)) {
                            conversationData.images.push({
                                url: imageUrl,
                                category: category,
                                description: `${category.charAt(0).toUpperCase() + category.slice(1)} Guide`,
                                timestamp: new Date()
                            });
                        }
                        
                        imagesHTML += `
                            <div class="image-card">
                                <img src="${imageUrl}" alt="${category} guide" 
                                     onerror="this.parentElement.style.display='none'"
                                     loading="lazy">
                                <div class="image-card-content">
                                    <h4>${category.charAt(0).toUpperCase() + category.slice(1)} Guide</h4>
                                    <p>Visual reference for ${category} management</p>
                                </div>
                            </div>
                        `;
                    });
                }
            });
            
            if (hasImages) {
                mediaContent.innerHTML = imagesHTML;
            } else {
                mediaContent.innerHTML = `
                    <div class="placeholder-image">
                        <span class="placeholder-icon">📸</span>
                        <p>Visual guides will appear here based on the conversation</p>
                    </div>
                `;
            }
            
            console.log('Sidebar content updated successfully');
        } catch (error) {
            console.error('Error updating sidebar content:', error);
        }
    }, 0); // Run asynchronously
}

// Function to update status bar
function updateStatus(text, className = 'connected') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        const statusText = statusEl.querySelector('.status-text');
        if (statusText) {
            statusText.textContent = text;
        } else {
            statusEl.innerHTML = `<span class="status-icon">●</span><span class="status-text">${text}</span>`;
        }
        statusEl.className = `status-bar ${className}`;
    } else {
        console.warn('Status element not found');
    }
}

// Improved interruption handling
function handleInterruption() {
    console.log('Interruption detected - stopping assistant audio');
    
    // Stop audio playback immediately
    if (audioPlayer) {
        audioPlayer.bargeIn();
    }
    
    // Hide assistant thinking indicator
    hideAssistantThinkingIndicator();
    
    // Show user is speaking
    showUserThinkingIndicator();
    
    updateStatus('Listening to you...', 'recording');
}

// Enhanced updateChatUI to remove welcome message and show transcriptions
function updateChatUI() {
    if (!chatContainer) {
        console.error("Chat container not found");
        return;
    }

    // Remove welcome message if it exists
    const welcomeMsg = chatContainer.querySelector('.chat-welcome');
    if (welcomeMsg && chat.history.length > 0) {
        welcomeMsg.remove();
    }

    // Clear existing chat messages (but not welcome)
    const existingMessages = chatContainer.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());

    // Add all messages from history
    chat.history.forEach(item => {
        if (item.endOfConversation) {
            const endDiv = document.createElement('div');
            endDiv.className = 'message system';
            endDiv.textContent = "Conversation ended";
            chatContainer.appendChild(endDiv);
            return;
        }

        if (item.role) {
            const messageDiv = document.createElement('div');
            const roleLowerCase = item.role.toLowerCase();
            messageDiv.className = `message ${roleLowerCase}`;

            const roleLabel = document.createElement('div');
            roleLabel.className = 'role-label';
            roleLabel.textContent = item.role;
            messageDiv.appendChild(roleLabel);

            const content = document.createElement('div');
            content.textContent = item.message || "No content";
            messageDiv.appendChild(content);

            chatContainer.appendChild(messageDiv);
            
            // Update contextual content based on message
            if (item.role === 'ASSISTANT' && item.message) {
                updateSidebarContent(item.message);
            }
        }
    });

    // Re-add thinking indicators if we're still waiting
    if (waitingForUserTranscription) {
        showUserThinkingIndicator();
    }

    if (waitingForAssistantResponse) {
        showAssistantThinkingIndicator();
    }

    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}


// ===== PDF GENERATION FUNCTIONALITY =====

// Format timestamp for display
function formatTimestamp(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
    });
}

// Format date for PDF header
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Generate PDF from conversation data
async function generatePDF() {
    try {
        const { jsPDF } = window.jspdf;
        
        if (!jsPDF) {
            alert('PDF library not loaded. Please refresh the page and try again.');
            return;
        }
        
        if (conversationData.messages.length === 0) {
            alert('No conversation to export. Start a conversation first!');
            return;
        }
        
        // Create new PDF document
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const contentWidth = pageWidth - (2 * margin);
        let yPosition = margin;
        
        // Helper function to add new page if needed
        function checkPageBreak(requiredSpace = 20) {
            if (yPosition + requiredSpace > pageHeight - margin) {
                doc.addPage();
                yPosition = margin;
                return true;
            }
            return false;
        }
        
        // Add header with logo and title
        doc.setFillColor(16, 185, 129); // Emerald color
        doc.rect(0, 0, pageWidth, 35, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('🌾 Krishi Sahayak', margin, 15);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('Farming Assistant - Conversation Transcript', margin, 25);
        
        yPosition = 45;
        
        // Add conversation metadata
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        if (conversationData.startTime) {
            doc.text(`Date: ${formatDate(conversationData.startTime)}`, margin, yPosition);
            yPosition += 6;
        }
        
        if (conversationData.startTime && conversationData.endTime) {
            const duration = Math.round((conversationData.endTime - conversationData.startTime) / 1000 / 60);
            doc.text(`Duration: ${duration} minutes`, margin, yPosition);
            yPosition += 6;
        }
        
        doc.text(`Total Messages: ${conversationData.messages.length}`, margin, yPosition);
        yPosition += 10;
        
        // Add separator line
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
        
        // Add conversation messages
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Conversation Transcript', margin, yPosition);
        yPosition += 8;
        
        conversationData.messages.forEach((msg, index) => {
            checkPageBreak(30);
            
            // Message header with role and timestamp
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            
            if (msg.role === 'USER') {
                doc.setTextColor(14, 165, 233); // Blue for user
                doc.text(`👤 USER`, margin, yPosition);
            } else {
                doc.setTextColor(16, 185, 129); // Green for assistant
                doc.text(`🤖 ASSISTANT`, margin, yPosition);
            }
            
            doc.setTextColor(107, 114, 128); // Gray for timestamp
            doc.setFont('helvetica', 'normal');
            doc.text(formatTimestamp(msg.timestamp), pageWidth - margin - 30, yPosition);
            
            yPosition += 6;
            
            // Message content
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            const lines = doc.splitTextToSize(msg.content, contentWidth - 5);
            lines.forEach(line => {
                checkPageBreak(8);
                doc.text(line, margin + 3, yPosition);
                yPosition += 5;
            });
            
            yPosition += 5;
            
            // Add light separator between messages
            doc.setDrawColor(229, 231, 235);
            doc.setLineWidth(0.2);
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 8;
        });
        
        // Add resources section if any
        if (conversationData.resources.length > 0) {
            checkPageBreak(40);
            yPosition += 5;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(16, 185, 129);
            doc.text('📚 Shared Resources & Links', margin, yPosition);
            yPosition += 8;
            
            conversationData.resources.forEach((resource, index) => {
                checkPageBreak(25);
                
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${index + 1}. ${resource.title}`, margin + 3, yPosition);
                yPosition += 5;
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(107, 114, 128);
                
                const descLines = doc.splitTextToSize(resource.description, contentWidth - 10);
                descLines.forEach(line => {
                    checkPageBreak(6);
                    doc.text(line, margin + 6, yPosition);
                    yPosition += 4;
                });
                
                doc.setTextColor(14, 165, 233);
                doc.textWithLink('🔗 ' + resource.url, margin + 6, yPosition, { url: resource.url });
                yPosition += 8;
            });
        }
        
        // Add images section if any
        if (conversationData.images.length > 0) {
            checkPageBreak(40);
            yPosition += 5;
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(16, 185, 129);
            doc.text('🖼️ Visual Guides Shown', margin, yPosition);
            yPosition += 8;
            
            conversationData.images.forEach((image, index) => {
                checkPageBreak(15);
                
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                doc.text(`${index + 1}. ${image.description}`, margin + 3, yPosition);
                yPosition += 5;
                
                doc.setFontSize(9);
                doc.setTextColor(107, 114, 128);
                doc.text(`Category: ${image.category}`, margin + 6, yPosition);
                yPosition += 4;
                
                doc.setTextColor(14, 165, 233);
                doc.text(`Image URL: ${image.url}`, margin + 6, yPosition);
                yPosition += 8;
            });
        }
        
        // Add footer to all pages
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');
            doc.text(
                `Page ${i} of ${pageCount} | Generated by Krishi Sahayak | ${formatDate(new Date())}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        // Save the PDF
        const filename = `Krishi_Sahayak_Transcript_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        console.log('PDF generated successfully');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Please try again.');
    }
}

// ===== EXPORT AND SHARING FUNCTIONALITY =====

// Download PDF button event listener
const downloadPdfBtn = document.getElementById('download-pdf-btn');
if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
        console.log('Download PDF button clicked');
        generatePDF();
    });
}

// Share via Email button
const shareEmailBtn = document.getElementById('share-email-btn');
if (shareEmailBtn) {
    shareEmailBtn.addEventListener('click', async () => {
        console.log('Share via Email clicked');
        
        if (conversationData.messages.length === 0) {
            alert('No conversation to share. Start a conversation first!');
            return;
        }
        
        // Create email body with conversation summary
        const subject = encodeURIComponent('Krishi Sahayak - Farming Assistant Conversation');
        const body = encodeURIComponent(
            `Hello,\n\nPlease find my conversation with Krishi Sahayak farming assistant.\n\n` +
            `Date: ${formatDate(conversationData.startTime)}\n` +
            `Messages: ${conversationData.messages.length}\n\n` +
            `You can download the full PDF transcript from the attached link.\n\n` +
            `Best regards`
        );
        
        // Open Gmail compose
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
    });
}

// Share via WhatsApp button
const shareWhatsAppBtn = document.getElementById('share-whatsapp-btn');
if (shareWhatsAppBtn) {
    shareWhatsAppBtn.addEventListener('click', () => {
        console.log('Share via WhatsApp clicked');
        
        if (conversationData.messages.length === 0) {
            alert('No conversation to share. Start a conversation first!');
            return;
        }
        
        // Create WhatsApp message
        const text = encodeURIComponent(
            `🌾 Krishi Sahayak Conversation\n\n` +
            `Date: ${formatDate(conversationData.startTime)}\n` +
            `Messages: ${conversationData.messages.length}\n\n` +
            `I had a helpful conversation with the Krishi Sahayak farming assistant!`
        );
        
        // Open WhatsApp
        window.open(`https://wa.me/?text=${text}`, '_blank');
    });
}

// Generate QR Code button
const generateQRBtn = document.getElementById('generate-qr-btn');
const qrModal = document.getElementById('qr-modal');
const closeQRModal = document.getElementById('close-qr-modal');

if (generateQRBtn) {
    generateQRBtn.addEventListener('click', async () => {
        console.log('Generate QR Code clicked');
        
        if (conversationData.messages.length === 0) {
            alert('No conversation to generate QR code. Start a conversation first!');
            return;
        }
        
        // Generate a shareable text summary instead of PDF blob
        try {
            // Create a simple text summary
            let summary = `Krishi Sahayak Conversation\n\n`;
            summary += `Date: ${formatDate(conversationData.startTime)}\n`;
            summary += `Messages: ${conversationData.messages.length}\n\n`;
            summary += `Conversation:\n`;
            
            conversationData.messages.forEach((msg, index) => {
                summary += `\n${msg.role}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`;
            });
            
            // Create a data URL with the summary
            const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(summary)}`;
            
            // For better mobile compatibility, use the current page URL with a parameter
            const currentUrl = window.location.href.split('?')[0];
            const shareUrl = `${currentUrl}?conversation=${Date.now()}`;
            
            // Clear previous QR code
            const qrContainer = document.getElementById('qr-code-container');
            qrContainer.innerHTML = '';
            
            // Generate QR code with the share URL
            new QRCode(qrContainer, {
                text: shareUrl,
                width: 256,
                height: 256,
                colorDark: '#7C3AED',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            
            // Show modal
            qrModal.style.display = 'flex';
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            alert('Failed to generate QR code. Please try again.');
        }
    });
}

// Close QR modal
if (closeQRModal) {
    closeQRModal.addEventListener('click', () => {
        qrModal.style.display = 'none';
    });
}

// Close modal when clicking outside
if (qrModal) {
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.style.display = 'none';
        }
    });
}


// ===== HELP MODAL FUNCTIONALITY =====

const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpModal = document.getElementById('close-help-modal');

// Open help modal
if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });
}

// Close help modal
if (closeHelpModal) {
    closeHelpModal.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });
}

// Close modal when clicking outside
if (helpModal) {
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });
}

// Help tabs functionality
const helpTabs = document.querySelectorAll('.help-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

helpTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        
        // Remove active class from all tabs and panels
        helpTabs.forEach(t => t.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding panel
        tab.classList.add('active');
        document.getElementById(`${targetTab}-panel`).classList.add('active');
    });
});

// FAQ accordion functionality
document.addEventListener('click', (e) => {
    if (e.target.closest('.faq-question')) {
        const faqItem = e.target.closest('.faq-item');
        faqItem.classList.toggle('open');
    }
});

// Farming search functionality
const searchBtn = document.getElementById('search-btn');
const farmingSearch = document.getElementById('farming-search');

if (searchBtn && farmingSearch) {
    const performSearch = () => {
        const query = farmingSearch.value.trim();
        if (query) {
            // Open Google search in new tab with farming-specific query
            const searchQuery = encodeURIComponent(`${query} farming India agriculture`);
            window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank');
        }
    };
    
    searchBtn.addEventListener('click', performSearch);
    
    farmingSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}


// ===== TEXT CHAT FUNCTIONALITY =====

// Send text message
async function sendTextMessage() {
    const message = textInputField.value.trim();
    
    if (!message) {
        return;
    }
    
    try {
        // Disable send button while processing
        if (sendTextBtn) sendTextBtn.disabled = true;
        
        // Add user message to chat immediately
        const userMessageData = {
            role: 'USER',
            message: message,
            timestamp: new Date()
        };
        
        chatHistoryManager.addTextMessage(userMessageData);
        
        // Track for PDF export
        conversationData.messages.push({
            role: 'USER',
            content: message,
            timestamp: new Date()
        });
        
        if (!conversationData.startTime) {
            conversationData.startTime = new Date();
        }
        
        // Clear input field
        textInputField.value = '';
        
        // Show assistant thinking indicator
        showAssistantThinkingIndicator();
        
        // Send to backend for processing
        updateStatus("Processing your message...", "disconnected");
        
        // Emit text message to server
        socket.emit('textMessage', {
            message: message,
            language: selectedLanguage,
            systemPrompt: SYSTEM_PROMPT
        });
        
    } catch (error) {
        console.error('Error sending text message:', error);
        updateStatus("Error sending message", "error");
        if (sendTextBtn) sendTextBtn.disabled = false;
    }
}

// Handle text response from server
socket.on('textResponse', (data) => {
    console.log('Received text response:', data);
    
    hideAssistantThinkingIndicator();
    
    if (data.content) {
        const assistantMessageData = {
            role: 'ASSISTANT',
            message: data.content,
            timestamp: new Date()
        };
        
        chatHistoryManager.addTextMessage(assistantMessageData);
        
        // Track for PDF export
        conversationData.messages.push({
            role: 'ASSISTANT',
            content: data.content,
            timestamp: new Date()
        });
        
        conversationData.endTime = new Date();
        
        // Update contextual content
        updateSidebarContent(data.content);
    }
    
    // Re-enable send button
    if (sendTextBtn) sendTextBtn.disabled = false;
    updateStatus("Ready for your next message", "connected");
});

// Send text button event listener
if (sendTextBtn) {
    sendTextBtn.addEventListener('click', () => {
        sendTextMessage();
    });
}

// Text input field - send on Enter (Shift+Enter for new line)
if (textInputField) {
    textInputField.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendTextMessage();
        }
    });
}
