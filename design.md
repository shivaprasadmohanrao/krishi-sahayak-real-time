# Design Document: Krishi Sahayak - Indian Farmer Voice Assistant

## Overview

This design documents the complete production implementation of Krishi Sahayak (कृषि सहायक), an AI-powered farming assistant deployed on AWS App Runner. The application provides real-time voice and text interaction using AWS Bedrock Nova2 models, with comprehensive features including multi-language support, weather forecasts, export capabilities, and contextual sidebars.

The key architectural components include:
- AWS App Runner deployment with automatic HTTPS and auto-scaling
- AWS Bedrock Nova Sonic (voice) and Nova Pro (text) models
- Socket.IO for real-time bidirectional communication
- OpenWeather API for weather forecasts
- Web Audio API with AudioWorklet for low-latency audio processing
- Export features using jsPDF, html2canvas, and QRCode.js
- Professional UI with six visual themes and Indian branding
- Three interaction modes: voice-audio, voice-text, and text chat

The application is containerized with Docker (Node.js 20 Alpine) and deployed to AWS App Runner, providing automatic HTTPS at the service URL. The frontend uses vanilla JavaScript with ES6 modules, and the backend is built with Express and Socket.IO.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS App Runner                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Docker Container                            │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │              Node.js Express Server                      │  │  │
│  │  │  - Socket.IO Server                                      │  │  │
│  │  │  - Session Management                                    │  │  │
│  │  │  - Weather API Integration                               │  │  │
│  │  │  - Health Check Endpoints                                │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Automatic HTTPS: https://[service-id].[region].awsapprunner.com    │
│  Auto-scaling, SSL Certificates, Load Balancing                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + WebSocket
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Frontend)                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  UI Components   │  │  Audio Processing│  │  Socket.IO Client│  │
│  │  - Language      │  │  - AudioWorklet  │  │  - Event Handlers│  │
│  │  - Voice Gender  │  │  - 16kHz Input   │  │  - Session Mgmt  │  │
│  │  - Mode Selector │  │  - 24kHz Output  │  │  - State Sync    │  │
│  │  - Theme Selector│  │  - Web Audio API │  │                  │  │
│  │  - Export Buttons│  │                  │  │                  │  │
│  │  - Sidebars      │  │                  │  │                  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS Bedrock Nova2                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐│
│  │  Nova Sonic (Voice)          │  │  Nova Pro (Text)             ││
│  │  us.amazon.nova-sonic-v1:0   │  │  us.amazon.nova-pro-v1:0     ││
│  │  - Speech-to-text            │  │  - Text generation           ││
│  │  - Text generation           │  │  - Farming expertise         ││
│  │  - Text-to-speech            │  │  - Multi-language support    ││
│  │  - Multi-language support    │  │                              ││
│  │  - Voice gender (M/F)        │  │                              ││
│  └──────────────────────────────┘  └──────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenWeather API                                   │
│  - Geocoding API (location → coordinates)                           │
│  - 5-Day Forecast API (weather data)                                │
│  - 24-hour analysis with farming advice                             │
└─────────────────────────────────────────────────────────────────────┘
```


### Component Responsibilities

**AWS App Runner:**
- Automatic HTTPS with SSL certificates
- Auto-scaling based on traffic
- Docker container orchestration
- Environment variable management
- Health monitoring and logging
- Cost optimization (pause/resume capability)

**Backend Components:**
- **Express Server**: HTTP server for static files and API endpoints
- **Socket.IO Server**: WebSocket management for real-time communication
- **Session Manager**: Tracks active sessions, user preferences (language, voice gender, mode)
- **NovaSonicBidirectionalStreamClient**: Wrapper for AWS Bedrock Nova Sonic API
- **BedrockRuntimeClient**: Client for AWS Bedrock Nova Pro API (text chat)
- **Weather API Integration**: OpenWeather Geocoding and Forecast APIs
- **Health Check Endpoints**: /health and /test-weather for monitoring

**Frontend Components:**
- **Language Selector**: Dropdown for 6 languages (English, Hindi, Italian, French, German, Spanish)
- **Voice Gender Selector**: Male/Female voice selection
- **Interaction Mode Selector**: Voice-Audio, Voice-Text, Text Chat
- **Response Style Selector**: Concise/Detailed responses
- **Theme Selector**: 6 visual themes
- **Audio Processing**: AudioWorklet for low-latency audio (16kHz input, 24kHz output)
- **Transcription Display**: Real-time conversation text with proper character encoding
- **Left Sidebar**: Contextual resources (government schemes, articles, links)
- **Right Sidebar**: Visual guides (images, farming guides)
- **Export Features**: PDF download, Email, WhatsApp, QR code generation
- **Help Modal**: Interactive tutorials, FAQs, features, resources, search
- **Socket.IO Client**: Event-driven communication with backend

**AWS Bedrock Nova2:**
- **Nova Sonic**: Speech-to-speech processing for voice modes
- **Nova Pro**: Text generation for text chat mode
- Multi-language support with automatic detection
- Voice gender selection (Kiara/Matthew)
- Farming domain expertise via system prompts

**OpenWeather API:**
- **Geocoding API**: Converts location names to coordinates
- **5-Day Forecast API**: Provides weather data in 3-hour intervals
- **Analysis**: 24-hour forecast with temperature, rain probability, farming advice

## Components and Interfaces

### 1. AWS App Runner Deployment

**Deployment Configuration:**
- **Service Name**: krishi-sahayak
- **Region**: us-east-1
- **Container Registry**: AWS ECR (772770127418.dkr.ecr.us-east-1.amazonaws.com/krishi-sahayak)
- **Port**: 3000
- **CPU**: 1 vCPU
- **Memory**: 2 GB
- **Auto-scaling**: Enabled
- **HTTPS URL**: https://g7rkxv4szn.us-east-1.awsapprunner.com

**Environment Variables:**
```
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>
AWS_REGION=us-east-1
OPEN_WEATHER_APIKEY=<openweather-key>
PORT=3000
NODE_ENV=production
```

**Docker Configuration (Dockerfile):**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**Deployment Commands:**
```bash
# Build and tag image
docker build -t krishi-sahayak .
docker tag krishi-sahayak:latest 772770127418.dkr.ecr.us-east-1.amazonaws.com/krishi-sahayak:latest

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 772770127418.dkr.ecr.us-east-1.amazonaws.com
docker push 772770127418.dkr.ecr.us-east-1.amazonaws.com/krishi-sahayak:latest

# Pause/Resume service
aws apprunner pause-service --service-arn <arn> --region us-east-1
aws apprunner resume-service --service-arn <arn> --region us-east-1
```

### 2. Language and Preference Selectors

**HTML Structure (public/index.html):**
```html
<div class="controls-row">
  <div class="header-controls">
    <!-- Language Selector -->
    <div class="control-group">
      <label for="language-select">Language:</label>
      <select id="language-select" class="styled-select">
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="it">Italian</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="es">Spanish</option>
      </select>
    </div>
    
    <!-- Response Style Selector -->
    <div class="control-group">
      <label for="response-style">Response:</label>
      <select id="response-style" class="styled-select">
        <option value="concise">Concise</option>
        <option value="chatty">Detailed</option>
      </select>
    </div>
    
    <!-- Voice Gender Selector -->
    <div class="control-group">
      <label for="voice-gender">Voice:</label>
      <select id="voice-gender" class="styled-select">
        <option value="female">Female</option>
        <option value="male">Male</option>
      </select>
    </div>
    
    <!-- Interaction Mode Selector -->
    <div class="control-group">
      <label for="interaction-mode">Mode:</label>
      <select id="interaction-mode" class="styled-select">
        <option value="voice-audio">Speak + Listen</option>
        <option value="voice-text">Speak, Read Text</option>
        <option value="text-chat">Text Chat</option>
      </select>
    </div>
    
    <!-- Theme Selector -->
    <div class="control-group">
      <label for="theme-select">Theme:</label>
      <select id="theme-select" class="styled-select">
        <option value="emerald">Emerald Garden</option>
        <option value="sunset">Golden Harvest</option>
        <option value="ocean">Ocean Breeze</option>
        <option value="lavender">Lavender Fields</option>
        <option value="autumn">Autumn Glow</option>
        <option value="midnight">Midnight Sky</option>
      </select>
    </div>
  </div>
</div>
```

**JavaScript State Management (public/src/main.js):**
```javascript
let selectedLanguage = 'en';
let selectedVoiceGender = 'female';
let selectedInteractionMode = 'voice-audio';
let selectedResponseStyle = 'concise';
let selectedTheme = 'emerald';

// Event listeners
document.getElementById('language-select').addEventListener('change', (e) => {
  selectedLanguage = e.target.value;
  socket.emit('setLanguage', selectedLanguage);
});

document.getElementById('voice-gender').addEventListener('change', (e) => {
  selectedVoiceGender = e.target.value;
  socket.emit('setVoiceGender', selectedVoiceGender);
});

document.getElementById('interaction-mode').addEventListener('change', (e) => {
  selectedInteractionMode = e.target.value;
  socket.emit('setInteractionMode', selectedInteractionMode);
  updateUIForMode(selectedInteractionMode);
});

document.getElementById('response-style').addEventListener('change', (e) => {
  selectedResponseStyle = e.target.value;
  updateSystemPrompt();
});

document.getElementById('theme-select').addEventListener('change', (e) => {
  selectedTheme = e.target.value;
  applyTheme(selectedTheme);
});
```


### 3. Backend Session Management

**Session Tracking (src/server.js):**
```javascript
// Track active sessions per socket
const socketSessions = new Map();
const sessionLanguages = new Map();
const sessionVoiceGenders = new Map();
const sessionInteractionModes = new Map();
const sessionStates = new Map();
const cleanupInProgress = new Map();

// Session states
const SessionState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  ACTIVE: 'active',
  CLOSED: 'closed'
};

// Event handlers
socket.on('setLanguage', (language) => {
  const supportedLanguages = ['en', 'hi', 'it', 'fr', 'de', 'es'];
  if (language && supportedLanguages.includes(language)) {
    sessionLanguages.set(socket.id, language);
  } else {
    sessionLanguages.set(socket.id, 'en'); // default
  }
});

socket.on('setVoiceGender', (gender) => {
  const supportedGenders = ['male', 'female'];
  if (gender && supportedGenders.includes(gender)) {
    sessionVoiceGenders.set(socket.id, gender);
  } else {
    sessionVoiceGenders.set(socket.id, 'female'); // default
  }
});

socket.on('setInteractionMode', (mode) => {
  const supportedModes = ['voice-audio', 'voice-text', 'text-chat'];
  if (mode && supportedModes.includes(mode)) {
    sessionInteractionModes.set(socket.id, mode);
  } else {
    sessionInteractionModes.set(socket.id, 'voice-audio'); // default
  }
});

// Cleanup on disconnect
socket.on('disconnect', async () => {
  socketSessions.delete(socket.id);
  sessionStates.delete(socket.id);
  sessionLanguages.delete(socket.id);
  sessionVoiceGenders.delete(socket.id);
  sessionInteractionModes.delete(socket.id);
  cleanupInProgress.delete(socket.id);
});

// Automatic cleanup of inactive sessions (5 minutes)
setInterval(() => {
  const now = Date.now();
  bedrockClient.getActiveSessions().forEach(sessionId => {
    const lastActivity = bedrockClient.getLastActivityTime(sessionId);
    if (now - lastActivity > 5 * 60 * 1000) {
      bedrockClient.forceCloseSession(sessionId);
    }
  });
}, 60000);
```

### 4. Weather API Integration

**OpenWeather API Functions (src/server.js):**
```javascript
// Geocoding: location name → coordinates
async function getCoordinates(locationName) {
  const apiKey = process.env.OPEN_WEATHER_APIKEY;
  const searchQueries = [
    `${locationName},IN`,
    `${locationName},India`,
    locationName
  ];
  
  for (const query of searchQueries) {
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${apiKey}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.length > 0) {
      const indianLocation = response.data.find(loc => loc.country === 'IN');
      const location = indianLocation || response.data[0];
      return { lat: location.lat, lon: location.lon, name: location.name, state: location.state, country: location.country };
    }
  }
  return null;
}

// Forecast: coordinates → weather data
async function getWeatherForecast(lat, lon) {
  const apiKey = process.env.OPEN_WEATHER_APIKEY;
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const response = await axios.get(url);
  return response.data;
}

// Analysis: forecast data → 24-hour summary
function analyzeWeatherForecast(forecastData) {
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const relevantForecasts = forecastData.list.filter(item => {
    const forecastTime = new Date(item.dt * 1000);
    return forecastTime >= now && forecastTime <= next24Hours;
  });
  
  let maxTemp = -Infinity, minTemp = Infinity;
  let totalRainProb = 0, rainCount = 0;
  let humidity = 0, windSpeed = 0;
  let weatherConditions = [];
  
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
  
  return {
    location: forecastData.city.name,
    country: forecastData.city.country,
    maxTemp: Math.round(maxTemp),
    minTemp: Math.round(minTemp),
    rainProbability: Math.round((totalRainProb / rainCount) * 100),
    weatherConditions: weatherConditions.join(', '),
    humidity: Math.round(humidity / relevantForecasts.length),
    windSpeed: Math.round((windSpeed / relevantForecasts.length) * 3.6)
  };
}

// Format: analysis → farming advice message
function formatWeatherMessage(weatherAnalysis, language = 'en') {
  const messages = {
    en: `Weather for ${weatherAnalysis.location} (Next 24 Hours):
Temperature: ${weatherAnalysis.minTemp}°C to ${weatherAnalysis.maxTemp}°C
Rain Chance: ${weatherAnalysis.rainProbability}%

${weatherAnalysis.rainProbability > 60 
  ? '⚠️ High rain expected - Prepare for irrigation needs to be minimal.'
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
  ? '⚠️ अच्छी बारिश होगी - सिंचाई की जरूरत कम होगी।'
  : weatherAnalysis.rainProbability > 30
  ? '🌦️ बारिश हो सकती है - बैकअप सिंचाई तैयार रखें।'
  : '☀️ बारिश कम होगी - सिंचाई की योजना बनाएं।'}

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
  const patterns = [
    /(?:weather|forecast|prediction|temperature|rain).*?(?:in|for|at|near|of)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.|tomorrow|today|next)/i,
    /(?:in|for|at|near)\s+([a-zA-Z\s]+?)\s+(?:weather|forecast|prediction|temperature|rain)/i,
    /([a-zA-Z\s]+?)\s+(?:weather|forecast|rain|temperature)/i,
    /(?:मौसम|पूर्वानुमान|तापमान|बारिश).*?(?:में|के लिए|का)\s+([a-zA-Z\s]+?)(?:\?|$|,|\.)/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      let location = match[1].trim().replace(/\s+/g, ' ');
      if (location.length > 2) return location;
    }
  }
  return null;
}

// Check if message is weather-related
function isWeatherQuery(message) {
  const weatherKeywords = ['weather', 'forecast', 'prediction', 'temperature', 'rain', 'rainfall', 'मौसम', 'पूर्वानुमान', 'तापमान', 'बारिश'];
  return weatherKeywords.some(keyword => message.toLowerCase().includes(keyword));
}
```

**Text Message Handler with Weather Integration:**
```javascript
socket.on('textMessage', async (data) => {
  const language = sessionLanguages.get(socket.id) || 'en';
  
  // Check if weather query
  if (isWeatherQuery(data.message)) {
    let location = extractLocation(data.message);
    
    if (!location) {
      socket.emit('textResponse', {
        content: language === 'hi' 
          ? 'कृपया मुझे बताएं कि आप किस स्थान के लिए मौसम की जानकारी चाहते हैं?'
          : 'Please tell me which location you want weather information for?',
        language: language
      });
      return;
    }
    
    const coords = await getCoordinates(location);
    if (!coords) {
      socket.emit('textResponse', {
        content: language === 'hi'
          ? `क्षमा करें, मैं "${location}" के लिए स्थान नहीं ढूंढ सका।`
          : `Sorry, I couldn't find the location "${location}".`,
        language: language
      });
      return;
    }
    
    const forecastData = await getWeatherForecast(coords.lat, coords.lon);
    const weatherAnalysis = analyzeWeatherForecast(forecastData);
    const weatherMessage = formatWeatherMessage(weatherAnalysis, language);
    
    socket.emit('textResponse', {
      content: weatherMessage,
      language: language,
      isWeatherData: true
    });
    return;
  }
  
  // Regular text chat using Nova Pro
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });
  
  const command = new ConverseCommand({
    modelId: "us.amazon.nova-pro-v1:0",
    messages: [{ role: "user", content: [{ text: data.message }] }],
    system: [{ text: data.systemPrompt }],
    inferenceConfig: { maxTokens: 1024, temperature: 0.7, topP: 0.9 }
  });
  
  const response = await client.send(command);
  const responseText = response.output.message.content[0].text;
  
  socket.emit('textResponse', {
    content: responseText,
    language: language
  });
});
```


### 5. Voice Processing with Nova Sonic

**Voice Gender Configuration (src/server.js):**
```javascript
socket.on('promptStart', async () => {
  const session = socketSessions.get(socket.id);
  const language = sessionLanguages.get(socket.id) || 'en';
  const voiceGender = sessionVoiceGenders.get(socket.id) || 'female';
  
  const audioOutputConfig = {
    audioType: "SPEECH",
    encoding: "base64",
    mediaType: "audio/lpcm",
    sampleRateHertz: 24000,
    sampleSizeBits: 16,
    channelCount: 1,
    voiceId: voiceGender === 'male' ? 'matthew' : 'kiara'
  };
  
  await session.setupSessionAndPromptStart(audioOutputConfig);
});
```

**Audio Input Processing:**
```javascript
socket.on('audioInput', async (audioData) => {
  const session = socketSessions.get(socket.id);
  const currentState = sessionStates.get(socket.id);
  
  if (!session || currentState !== SessionState.ACTIVE) {
    socket.emit('error', { message: 'Session not ready for audio input' });
    return;
  }
  
  const audioBuffer = typeof audioData === 'string'
    ? Buffer.from(audioData, 'base64')
    : Buffer.from(audioData);
  
  await session.streamAudio(audioBuffer);
});
```

### 6. Export Features

**PDF Generation (public/src/main.js):**
```javascript
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  
  // Add title
  pdf.setFontSize(20);
  pdf.text('Krishi Sahayak - Conversation Transcript', 20, 20);
  
  // Add timestamp
  pdf.setFontSize(12);
  pdf.text(`Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 20, 30);
  
  // Add conversation history
  let yPosition = 40;
  const messages = document.querySelectorAll('.message');
  
  messages.forEach((message, index) => {
    const role = message.classList.contains('user-message') ? 'You' : 'Assistant';
    const text = message.textContent;
    const timestamp = message.dataset.timestamp || '';
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text(`${role} (${timestamp}):`, 20, yPosition);
    
    pdf.setFont(undefined, 'normal');
    const lines = pdf.splitTextToSize(text, 170);
    pdf.text(lines, 20, yPosition + 5);
    
    yPosition += (lines.length * 5) + 10;
    
    if (yPosition > 270) {
      pdf.addPage();
      yPosition = 20;
    }
  });
  
  // Add resources from left sidebar
  const resources = document.querySelectorAll('#sidebar-content .resource-item');
  if (resources.length > 0) {
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.text('Helpful Resources', 20, 20);
    yPosition = 30;
    
    resources.forEach(resource => {
      pdf.setFontSize(10);
      pdf.text(`• ${resource.textContent}`, 20, yPosition);
      yPosition += 7;
    });
  }
  
  // Save PDF
  pdf.save(`krishi-sahayak-transcript-${Date.now()}.pdf`);
}

document.getElementById('download-pdf-btn').addEventListener('click', generatePDF);
```

**Email Sharing:**
```javascript
function shareViaEmail() {
  const messages = Array.from(document.querySelectorAll('.message'))
    .map(msg => msg.textContent)
    .join('\n\n');
  
  const subject = encodeURIComponent('Krishi Sahayak - Farming Advice');
  const body = encodeURIComponent(`Conversation Transcript:\n\n${messages}\n\n---\nGenerated by Krishi Sahayak`);
  
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
}

document.getElementById('share-email-btn').addEventListener('click', shareViaEmail);
```

**WhatsApp Sharing:**
```javascript
function shareViaWhatsApp() {
  const messages = Array.from(document.querySelectorAll('.message'))
    .map(msg => msg.textContent)
    .join('\n\n');
  
  const text = encodeURIComponent(`Krishi Sahayak Conversation:\n\n${messages}`);
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

document.getElementById('share-whatsapp-btn').addEventListener('click', shareViaWhatsApp);
```

**QR Code Generation:**
```javascript
async function generateQRCode() {
  // Generate PDF first
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  // ... (same as generatePDF)
  
  // Convert PDF to blob URL
  const pdfBlob = pdf.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  
  // Generate QR code
  const qrContainer = document.getElementById('qr-code-container');
  qrContainer.innerHTML = '';
  
  const qrCode = new QRCode(qrContainer, {
    text: pdfUrl,
    width: 256,
    height: 256,
    colorDark: '#000000',
    colorLight: '#ffffff'
  });
  
  // Show modal
  document.getElementById('qr-modal').style.display = 'flex';
}

document.getElementById('generate-qr-btn').addEventListener('click', generateQRCode);
```

### 7. Theme System

**Theme Configuration (public/src/main.js):**
```javascript
const themes = {
  emerald: {
    primary: '#10b981',
    secondary: '#059669',
    accent: '#34d399',
    background: '#f0fdf4'
  },
  sunset: {
    primary: '#f59e0b',
    secondary: '#d97706',
    accent: '#fbbf24',
    background: '#fffbeb'
  },
  ocean: {
    primary: '#0ea5e9',
    secondary: '#0284c7',
    accent: '#38bdf8',
    background: '#f0f9ff'
  },
  lavender: {
    primary: '#a855f7',
    secondary: '#9333ea',
    accent: '#c084fc',
    background: '#faf5ff'
  },
  autumn: {
    primary: '#f97316',
    secondary: '#ea580c',
    accent: '#fb923c',
    background: '#fff7ed'
  },
  midnight: {
    primary: '#1e3a8a',
    secondary: '#1e40af',
    accent: '#3b82f6',
    background: '#eff6ff'
  }
};

function applyTheme(themeName) {
  const theme = themes[themeName];
  document.documentElement.style.setProperty('--primary-color', theme.primary);
  document.documentElement.style.setProperty('--secondary-color', theme.secondary);
  document.documentElement.style.setProperty('--accent-color', theme.accent);
  document.documentElement.style.setProperty('--background-color', theme.background);
  
  sessionStorage.setItem('selectedTheme', themeName);
}

// Load theme on page load
const storedTheme = sessionStorage.getItem('selectedTheme') || 'emerald';
applyTheme(storedTheme);
document.getElementById('theme-select').value = storedTheme;
```

### 8. Indian Branding UI

**Header with Indian Flag Colors (public/index.html):**
```html
<div class="logo-section">
  <div class="title-group">
    <h1 class="app-title">
      <span class="title-hindi" style="color: #FF9933;">कृषि सहायक</span>
      <div class="logo-icon-center">
        <!-- Ashoka Chakra SVG -->
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="48" fill="none" stroke="#000080" stroke-width="2"/>
          <circle cx="50" cy="50" r="8" fill="#000080"/>
          <!-- 24 spokes -->
          <g stroke="#000080" stroke-width="2">
            <line x1="50" y1="50" x2="50" y2="10" />
            <!-- ... 23 more spokes ... -->
          </g>
        </svg>
      </div>
      <span class="title-english" style="color: #138808;">Krishi Sahayak</span>
    </h1>
  </div>
</div>
```

**Jai Kisan Badge:**
```html
<div class="jai-kissan-badge">
  <svg class="india-flag-icon" viewBox="0 0 24 16">
    <rect width="24" height="5.33" fill="#FF9933"/>
    <rect y="5.33" width="24" height="5.33" fill="#FFFFFF"/>
    <rect y="10.67" width="24" height="5.33" fill="#138808"/>
    <circle cx="12" cy="8" r="2" fill="none" stroke="#000080" stroke-width="0.3"/>
  </svg>
  <div class="jai-text-group">
    <span class="jai-text-hindi">जय किसान!</span>
    <span class="jai-text-english">Jai Kisan!</span>
  </div>
</div>
```

**Live Date/Time Display:**
```javascript
function updateDateTime() {
  const now = new Date();
  const timeOptions = { 
    timeZone: 'Asia/Kolkata', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  };
  const dateOptions = { 
    timeZone: 'Asia/Kolkata', 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  };
  
  document.getElementById('current-time').textContent = now.toLocaleTimeString('en-IN', timeOptions);
  document.getElementById('current-date').textContent = now.toLocaleDateString('en-IN', dateOptions);
}

setInterval(updateDateTime, 1000);
updateDateTime();
```


## Data Models

### Session State Model

```javascript
const SessionState = {
  INITIALIZING: 'initializing',  // Session being created
  READY: 'ready',                // Session created, waiting for audio start
  ACTIVE: 'active',              // Session active, ready for audio input
  CLOSED: 'closed'               // Session ended
};

// Session tracking maps
const socketSessions = new Map();           // socket.id → NovaSonicSession
const sessionStates = new Map();            // socket.id → SessionState
const sessionLanguages = new Map();         // socket.id → language code
const sessionVoiceGenders = new Map();      // socket.id → 'male'|'female'
const sessionInteractionModes = new Map();  // socket.id → 'voice-audio'|'voice-text'|'text-chat'
const cleanupInProgress = new Map();        // socket.id → boolean
```

### Language Configuration

```javascript
const SupportedLanguages = {
  ENGLISH: 'en',
  HINDI: 'hi',
  ITALIAN: 'it',
  FRENCH: 'fr',
  GERMAN: 'de',
  SPANISH: 'es'
};

const LanguageNames = {
  'en': 'English',
  'hi': 'हिंदी',
  'it': 'Italian',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish'
};
```

### Voice Configuration

```javascript
const VoiceGenders = {
  MALE: 'male',
  FEMALE: 'female'
};

const VoiceMap = {
  male: 'matthew',    // AWS Bedrock Nova Sonic male voice
  female: 'kiara'     // AWS Bedrock Nova Sonic female voice
};
```

### Interaction Modes

```javascript
const InteractionModes = {
  VOICE_AUDIO: 'voice-audio',    // Speak + Listen (full voice)
  VOICE_TEXT: 'voice-text',      // Speak, Read Text (hearing-impaired)
  TEXT_CHAT: 'text-chat'         // Type and Read (with weather)
};
```

### Weather Data Model

```javascript
interface WeatherAnalysis {
  location: string;           // City name
  country: string;            // Country code
  maxTemp: number;            // Max temperature (°C)
  minTemp: number;            // Min temperature (°C)
  rainProbability: number;    // Rain chance (%)
  weatherConditions: string;  // Weather conditions (comma-separated)
  humidity: number;           // Average humidity (%)
  windSpeed: number;          // Average wind speed (km/h)
  forecastCount: number;      // Number of forecast data points
}

interface Coordinates {
  lat: number;                // Latitude
  lon: number;                // Longitude
  name: string;               // Location name
  state?: string;             // State (if available)
  country: string;            // Country code
}
```

### System Prompt Configuration

```javascript
const FarmingAssistantSystemPrompt = `You are an expert farming assistant specializing in Indian agriculture. Your role is to provide practical, concise advice to Indian farmers on various agricultural topics including:

- Crop management and seasonal planning
- Pest and disease identification and treatment
- Soil health and fertilizer recommendations
- Weather-based farming advice
- Government schemes and subsidies for farmers
- Modern farming technologies and equipment
- Organic farming methods
- Water management and irrigation
- Market prices and selling strategies

When starting a conversation:
1. Greet the farmer warmly
2. Ask about their location (state/district)
3. Ask about their primary crops
4. Ask about their specific concerns or questions

Keep your responses:
- ${responseStyle === 'concise' ? 'Concise and practical (2-3 sentences when possible)' : 'Detailed and comprehensive with explanations'}
- Specific to Indian farming conditions
- Easy to understand for farmers with varying education levels
- Action-oriented with clear next steps

Always be respectful, patient, and supportive. Ask one question at a time and wait for the farmer's response before proceeding.`;
```

### Audio Configuration

```javascript
// Input audio configuration (from browser)
const AudioInputConfiguration = {
  audioType: "SPEECH",
  encoding: "base64",
  mediaType: "audio/lpcm",
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1
};

// Output audio configuration (to browser)
const AudioOutputConfiguration = {
  audioType: "SPEECH",
  encoding: "base64",
  mediaType: "audio/lpcm",
  sampleRateHertz: 24000,
  sampleSizeBits: 16,
  channelCount: 1,
  voiceId: "kiara" // or "matthew"
};
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Language Selection State Management

*For any* supported language selection, when a user selects that language, the frontend state should be updated, the selection should be visually indicated, the language should be stored in session storage, and a setLanguage event should be sent to the backend with the correct language code.

**Validates: Requirements 1.1, 1.2**

### Property 2: Voice Gender Application

*For any* voice gender selection (male or female), when a user selects that gender, all subsequent audio responses should use the corresponding voice (Matthew for male, Kiara for female).

**Validates: Requirements 4.2, 4.3, 4.4**

### Property 3: Interaction Mode Switching

*For any* interaction mode selection, when a user switches modes, the UI should update to show/hide appropriate controls (microphone button for voice modes, text input for text chat), and the backend should use the correct model (Nova Sonic for voice, Nova Pro for text).

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 4: Weather Query Detection and Processing

*For any* text message in text chat mode, if the message contains weather-related keywords, the system should detect it as a weather query, extract the location, fetch coordinates, retrieve forecast data, analyze it, and return farming-specific weather advice.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

### Property 5: Weather Advice Based on Conditions

*For any* weather analysis with rain probability > 60%, the system should advise minimal irrigation; for temperature > 35°C, advise adequate watering; for temperature < 15°C, advise frost protection.

**Validates: Requirements 5.7, 5.8, 5.9**

### Property 6: Export Feature Completeness

*For any* conversation transcript, when exported to PDF, the PDF should include all messages with timestamps, helpful resources from the left sidebar, and visual guides from the right sidebar.

**Validates: Requirements 6.2, 6.6**

### Property 7: Session Cleanup on Disconnect

*For any* active session, when a user disconnects, the backend should clean up the session, delete all session maps (language, voice gender, mode), and release AWS Bedrock resources.

**Validates: Requirements 13.3**

### Property 8: Inactive Session Timeout

*For any* session inactive for more than 5 minutes, the backend should automatically close the session and release resources.

**Validates: Requirements 13.4**

### Property 9: Theme Persistence

*For any* theme selection, when a user selects a theme, the theme should be applied immediately, stored in session storage, and persist across page reloads within the same session.

**Validates: Requirements 8.8**

### Property 10: Multi-Language Transcription Display

*For any* language selection, when the assistant responds, the transcription display should show text in the selected language with proper character encoding (including Devanagari for Hindi).

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 11: HTTPS Requirement for Voice Modes

*For any* voice mode (voice-audio or voice-text), when accessed via HTTP, the system should display a warning that HTTPS is required for AudioWorklet; when accessed via HTTPS, all voice modes should function normally.

**Validates: Requirements 12.2, 12.3, 12.4**

### Property 12: Health Check Endpoint Accuracy

*For any* request to /health endpoint, the response should include accurate counts of active sessions and socket connections.

**Validates: Requirements 14.1**

### Property 13: Response Style Application

*For any* response style selection (concise or detailed), when a user selects a style, the system prompt should be updated to include the style preference, and all subsequent responses should follow that style.

**Validates: Requirements 15.2, 15.3, 15.4, 15.5**

## Error Handling

### Language Selection Errors

**Invalid Language Code:**
- If an invalid language code is received by the backend, default to English ('en')
- Log a warning message indicating the invalid code
- Continue session initialization with the default language

**Missing Language Preference:**
- If no language preference is sent during session initialization, default to English
- Log an info message indicating default language is being used

### Voice Mode Errors

**HTTPS Not Available:**
- If voice modes are accessed via HTTP, display warning message
- Suggest switching to text chat mode or accessing via HTTPS
- Disable microphone button and audio playback

**AudioWorklet Initialization Failure:**
- If AudioWorklet fails to initialize, fall back to ScriptProcessorNode
- Log error message with details
- Display warning to user about potential audio quality issues

### Weather API Errors

**Location Not Found:**
- If geocoding API returns no results, ask user to provide a valid Indian city name
- Suggest common city names (Delhi, Mumbai, Bangalore, etc.)
- Log the failed location query for debugging

**API Key Missing:**
- If OPEN_WEATHER_APIKEY is not set, log error and return error message to user
- Inform user that weather forecasts are temporarily unavailable
- Continue with regular farming advice (non-weather queries)

**API Request Failure:**
- If weather API request fails (network error, timeout), return error message
- Log the error details for debugging
- Suggest user try again later

### Session Management Errors

**Session Not Found:**
- If audio input is received for non-existent session, emit error event to client
- Instruct client to reinitialize session
- Log the error with session ID

**Session State Mismatch:**
- If audio input is received when session state is not ACTIVE, emit error event
- Inform client that session is not ready
- Log the current state and expected state

**Cleanup Timeout:**
- If session cleanup takes longer than 5 seconds, force close the session
- Log timeout error with session details
- Ensure all resources are released

### Export Feature Errors

**PDF Generation Failure:**
- If jsPDF fails to generate PDF, display error message to user
- Log the error details
- Suggest user try again or use alternative export methods (Email, WhatsApp)

**QR Code Generation Failure:**
- If QRCode.js fails to generate QR code, display error message
- Log the error details
- Offer direct PDF download as alternative

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of language selection, voice gender, and mode switching
- Weather API integration with known locations
- Export feature functionality with sample conversations
- Theme application and persistence
- Session cleanup and timeout scenarios

**Property-Based Tests** focus on:
- Universal properties that hold across all language selections
- State management and persistence across multiple sessions
- Event ordering and communication between frontend and backend
- Weather query detection across various message formats
- Export completeness across different conversation lengths

### Property-Based Testing Configuration

**Testing Library**: For JavaScript/Node.js, use **fast-check** library for property-based testing

**Test Configuration:**
- Minimum 100 iterations per property test
- Each property test must reference its design document property
- Tag format: **Feature: indian-farmer-voice-assistant, Property {number}: {property_text}**

### Unit Testing Focus Areas

**Language and Preference Selectors:**
- Test that all selectors contain correct options
- Test that default values are set correctly
- Test that selections trigger correct Socket.IO events

**Weather API Integration:**
- Test geocoding with known Indian cities
- Test forecast data parsing and analysis
- Test weather message formatting in English and Hindi
- Test location extraction from various message formats

**Export Features:**
- Test PDF generation with sample conversations
- Test Email and WhatsApp sharing URL generation
- Test QR code generation with valid data

**Session Management:**
- Test session creation and initialization
- Test preference storage and retrieval
- Test session cleanup on disconnect
- Test inactive session timeout

### Integration Testing

**End-to-End Language Flow:**
1. Load application
2. Select a language (e.g., Hindi)
3. Start voice-audio mode
4. Verify setLanguage event is sent before audioStart
5. Verify transcriptions appear in Hindi
6. Stop streaming
7. Reload page
8. Verify language preference is retained

**Weather Forecast Flow:**
1. Switch to text chat mode
2. Type "Weather forecast for Bangalore"
3. Verify location extraction
4. Verify geocoding API call
5. Verify forecast API call
6. Verify 24-hour analysis
7. Verify farming advice in response

**Export Flow:**
1. Have a conversation with multiple messages
2. Click "Download PDF"
3. Verify PDF contains all messages with timestamps
4. Verify PDF includes resources and images
5. Click "QR Code"
6. Verify QR code is generated and scannable

### Manual Testing Requirements

**Multi-Language Voice Testing:**
- Manually test voice input and output in each supported language
- Verify transcription accuracy for each language (requires native speakers)
- Verify voice quality and naturalness for male and female voices

**Weather Forecast Accuracy:**
- Manually verify weather forecasts match OpenWeather data
- Test with various Indian cities
- Verify farming advice is appropriate for weather conditions

**UI/UX Testing:**
- Test all themes for visual consistency
- Verify Indian branding elements display correctly
- Test responsive design on mobile and desktop
- Verify accessibility compliance (keyboard navigation, screen readers)

**AWS App Runner Deployment:**
- Test HTTPS access and SSL certificate
- Test auto-scaling under load
- Test pause/resume functionality
- Verify environment variables are loaded correctly
