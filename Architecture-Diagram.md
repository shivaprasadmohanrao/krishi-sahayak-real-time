# Krishi Sahayak - Architecture Diagrams & System Documentation

## Table of Contents
1. [Actors Definition](#actors-definition)
2. [Sequence Diagrams](#sequence-diagrams)
3. [Component Flow Diagram](#component-flow-diagram)
4. [Infrastructure Architecture](#infrastructure-architecture)
5. [System Prompt](#system-prompt)
6. [Deployment Architecture](#deployment-architecture)

---

## 1. Actors Definition

### Primary Actors

**1. Indian Farmer (End User)**
- Role: Primary user of the application
- Capabilities: 
  - Speaks/types in preferred language (English, Hindi, Italian, French, German, Spanish)
  - Asks farming-related questions
  - Requests weather forecasts
  - Exports conversation transcripts
- Devices: Desktop browser, Mobile browser (requires HTTPS for voice modes)

**2. Browser (Frontend Client)**
- Role: User interface and audio processing
- Responsibilities:
  - Render UI with Indian branding
  - Capture microphone audio using Web Audio API
  - Process audio with AudioWorklet (16kHz PCM)
  - Play assistant audio responses (24kHz PCM)
  - Manage Socket.IO connection
  - Handle user preferences (language, voice gender, mode, theme)
  - Generate PDF exports, QR codes
  - Display contextual sidebars

**3. AWS App Runner (Application Host)**
- Role: Container orchestration and HTTPS provider
- Responsibilities:
  - Host Docker container with Node.js application
  - Provide automatic HTTPS with SSL certificates
  - Auto-scale based on traffic
  - Load balancing
  - Environment variable management
  - Health monitoring


**4. Express Server (Backend)**
- Role: HTTP server and WebSocket manager
- Responsibilities:
  - Serve static files (HTML, CSS, JS)
  - Manage Socket.IO connections
  - Track user sessions and preferences
  - Route requests to AWS Bedrock
  - Integrate with OpenWeather API
  - Provide health check endpoints

**5. AWS Bedrock Nova2 (AI Models)**
- Role: AI inference engine
- Components:
  - **Nova Sonic** (us.amazon.nova-sonic-v1:0): Voice-to-voice processing
  - **Nova Pro** (us.amazon.nova-pro-v1:0): Text-only chat
- Capabilities:
  - Speech-to-text transcription
  - Text generation with farming expertise
  - Text-to-speech synthesis
  - Multi-language support
  - Voice gender selection (Matthew/Kiara)

**6. OpenWeather API (Weather Service)**
- Role: Weather data provider
- Components:
  - **Geocoding API**: Converts location names to coordinates
  - **5-Day Forecast API**: Provides weather data in 3-hour intervals
- Capabilities:
  - Location search (prioritizes Indian cities)
  - Temperature, rain probability, humidity, wind speed
  - 24-hour forecast analysis

---

## 2. Sequence Diagrams

### 2.1 Voice-Audio Mode Interaction (Speak + Listen)

```
┌──────────┐     ┌─────────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐
│  Farmer  │     │ Browser │     │ Express │     │ AWS Bedrock  │     │ OpenWeather │
│  (User)  │     │(Frontend)│    │ Server  │     │   Nova2      │     │     API     │
└────┬─────┘     └────┬────┘     └────┬────┘     └──────┬───────┘     └──────┬──────┘
     │                │                │                  │                    │
     │ 1. Load Page   │                │                  │                    │
     ├───────────────>│                │                  │                    │
     │                │                │                  │                    │
     │ 2. Select      │                │                  │                    │
     │    Language    │                │                  │                    │
     │    (Hindi)     │                │                  │                    │
     ├───────────────>│                │                  │                    │
     │                │                │                  │                    │
     │                │ 3. setLanguage('hi')  │                    │
     │                ├──────────────────────>│                  │                    │
     │                │                       │                  │                    │
     │                │ 4. setVoiceGender     │                  │                    │
     │                │    ('female')         │                  │                    │
     │                ├──────────────────────>│                  │                    │
     │                │                       │                  │                    │
     │ 5. Click Mic   │                       │                  │                    │
     ├───────────────>│                       │                  │                    │
     │                │                       │                  │                    │
     │                │ 6. initializeConnection│                 │                    │
     │                ├──────────────────────>│                  │                    │
     │                │                       │                  │                    │
     │                │                       │ 7. Create Session│                    │
     │                │                       ├─────────────────>│                    │
     │                │                       │                  │                    │
     │                │ 8. promptStart        │                  │                    │
     │                ├──────────────────────>│                  │                    │
     │                │                       │                  │                    │
     │                │ 9. systemPrompt       │                  │                    │
     │                │    (farming expert)   │                  │                    │
     │                ├──────────────────────>│ 10. Setup Prompt │                    │
     │                │                       ├─────────────────>│                    │
     │                │                       │                  │                    │
     │                │ 11. audioStart        │                  │                    │
     │                ├──────────────────────>│                  │                    │
     │                │                       │                  │                    │
     │                │ 12. audioReady        │                  │                    │
     │                │<──────────────────────┤                  │                    │
     │                │                       │                  │                    │
     │ 13. Speak      │                       │                  │                    │
     │    "मेरी गेहूं  │                       │                  │                    │
     │     की फसल में │                       │                  │                    │
     │     कीड़े हैं"  │                       │                  │                    │
     ├───────────────>│                       │                  │                    │
     │                │                       │                  │                    │
     │                │ 14. audioInput        │                  │                    │
     │                │    (16kHz PCM)        │                  │                    │
     │                ├──────────────────────>│ 15. Speech-to-   │                    │
     │                │                       │     Text         │                    │
     │                │                       ├─────────────────>│                    │
     │                │                       │                  │                    │
     │                │ 16. textOutput        │ 17. Transcription│                    │
     │                │    (USER: "मेरी...")  │<─────────────────┤                    │
     │                │<──────────────────────┤                  │                    │
     │                │                       │                  │                    │
     │ Display Text   │                       │                  │                    │
     │<───────────────┤                       │                  │                    │
     │                │                       │                  │                    │
     │                │                       │ 18. Generate     │                    │
     │                │                       │     Response     │                    │
     │                │                       │<─────────────────┤                    │
     │                │                       │                  │                    │
     │                │ 19. textOutput        │ 20. Text Response│                    │
     │                │    (ASSISTANT: "...")  │<─────────────────┤                    │
     │                │<──────────────────────┤                  │                    │
     │                │                       │                  │                    │
     │ Display Text   │                       │ 21. Text-to-     │                    │
     │<───────────────┤                       │     Speech       │                    │
     │                │                       │<─────────────────┤                    │
     │                │                       │                  │                    │
     │                │ 22. audioOutput       │ 23. Audio (24kHz)│                    │
     │                │    (24kHz PCM)        │<─────────────────┤                    │
     │                │<──────────────────────┤                  │                    │
     │                │                       │                  │                    │
     │ 24. Play Audio │                       │                  │                    │
     │<───────────────┤                       │                  │                    │
     │                │                       │                  │                    │
     │ 25. Click Stop │                       │                  │                    │
     ├───────────────>│                       │                  │                    │
     │                │                       │                  │                    │
     │                │ 26. stopAudio         │                  │                    │
     │                ├──────────────────────>│ 27. Close Session│                    │
     │                │                       ├─────────────────>│                    │
     │                │                       │                  │                    │
     │                │ 28. streamComplete    │                  │                    │
     │                │<──────────────────────┤                  │                    │
     │                │                       │                  │                    │
```


### 2.2 Text Chat Mode with Weather Forecast

```
┌──────────┐     ┌─────────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐
│  Farmer  │     │ Browser │     │ Express │     │ AWS Bedrock  │     │ OpenWeather │
│  (User)  │     │(Frontend)│    │ Server  │     │   Nova Pro   │     │     API     │
└────┬─────┘     └────┬────┘     └────┬────┘     └──────┬───────┘     └──────┬──────┘
     │                │                │                  │                    │
     │ 1. Select      │                │                  │                    │
     │    "Text Chat" │                │                  │                    │
     │    Mode        │                │                  │                    │
     ├───────────────>│                │                  │                    │
     │                │                │                  │                    │
     │                │ 2. setInteractionMode             │                    │
     │                │    ('text-chat')                  │                    │
     │                ├──────────────────────>│           │                    │
     │                │                       │           │                    │
     │ 3. Type:       │                       │           │                    │
     │    "Weather    │                       │           │                    │
     │     forecast   │                       │           │                    │
     │     for        │                       │           │                    │
     │     Bangalore" │                       │           │                    │
     ├───────────────>│                       │           │                    │
     │                │                       │           │                    │
     │ 4. Click Send  │                       │           │                    │
     ├───────────────>│                       │           │                    │
     │                │                       │           │                    │
     │                │ 5. textMessage        │           │                    │
     │                │    {message, prompt}  │           │                    │
     │                ├──────────────────────>│           │                    │
     │                │                       │           │                    │
     │                │                       │ 6. Detect Weather Query       │
     │                │                       │    isWeatherQuery() = true    │
     │                │                       │                               │
     │                │                       │ 7. Extract Location           │
     │                │                       │    extractLocation()          │
     │                │                       │    → "Bangalore"              │
     │                │                       │                               │
     │                │                       │ 8. getCoordinates             │
     │                │                       │    ("Bangalore")              │
     │                │                       ├──────────────────────────────>│
     │                │                       │                               │
     │                │                       │ 9. Geocoding API              │
     │                │                       │    /geo/1.0/direct            │
     │                │                       │    ?q=Bangalore,IN            │
     │                │                       │                               │
     │                │                       │ 10. Coordinates               │
     │                │                       │     {lat: 12.97, lon: 77.59}  │
     │                │                       │<──────────────────────────────┤
     │                │                       │                               │
     │                │                       │ 11. getWeatherForecast        │
     │                │                       │     (12.97, 77.59)            │
     │                │                       ├──────────────────────────────>│
     │                │                       │                               │
     │                │                       │ 12. Forecast API              │
     │                │                       │     /data/2.5/forecast        │
     │                │                       │     ?lat=12.97&lon=77.59      │
     │                │                       │                               │
     │                │                       │ 13. 5-Day Forecast            │
     │                │                       │     (40 data points)          │
     │                │                       │<──────────────────────────────┤
     │                │                       │                               │
     │                │                       │ 14. analyzeWeatherForecast()  │
     │                │                       │     - Filter next 24 hours    │
     │                │                       │     - Calculate max/min temp  │
     │                │                       │     - Calculate rain prob     │
     │                │                       │     - Analyze conditions      │
     │                │                       │                               │
     │                │                       │ 15. formatWeatherMessage()    │
     │                │                       │     - Add farming advice      │
     │                │                       │     - Format in user language │
     │                │                       │                               │
     │                │ 16. textResponse      │                               │
     │                │     {content: "Weather for Bangalore...              │
     │                │      Temp: 22°C to 32°C                              │
     │                │      Rain: 20%                                       │
     │                │      ☀️ Low rain - Plan irrigation..."}              │
     │                │<──────────────────────┤                               │
     │                │                       │                               │
     │ 17. Display    │                       │                               │
     │     Weather    │                       │                               │
     │     Forecast   │                       │                               │
     │<───────────────┤                       │                               │
     │                │                       │                               │
```


### 2.3 Session Management & Cleanup

```
┌─────────┐     ┌─────────┐     ┌──────────────┐
│ Browser │     │ Express │     │ AWS Bedrock  │
│(Frontend)│    │ Server  │     │   Nova2      │
└────┬────┘     └────┬────┘     └──────┬───────┘
     │                │                  │
     │ 1. connect     │                  │
     ├───────────────>│                  │
     │                │                  │
     │                │ 2. Create Maps   │
     │                │    - socketSessions
     │                │    - sessionLanguages
     │                │    - sessionVoiceGenders
     │                │    - sessionInteractionModes
     │                │    - sessionStates
     │                │                  │
     │ 3. Session     │                  │
     │    Active      │                  │
     │    (5 min)     │                  │
     │                │                  │
     │ 4. disconnect  │                  │
     ├───────────────>│                  │
     │                │                  │
     │                │ 5. Cleanup       │
     │                │    - Delete from all Maps
     │                │    - Close Bedrock session
     │                │    - Release resources
     │                ├─────────────────>│
     │                │                  │
     │                │ 6. Session Closed│
     │                │<─────────────────┤
     │                │                  │
     │ 7. sessionClosed│                 │
     │<───────────────┤                  │
     │                │                  │
     
     
     AUTOMATIC CLEANUP (Every 60 seconds)
     
     │                │                  │
     │                │ 8. Check Inactive│
     │                │    Sessions      │
     │                │    (> 5 min)     │
     │                │                  │
     │                │ 9. Force Close   │
     │                │    Inactive      │
     │                ├─────────────────>│
     │                │                  │
     │                │ 10. Cleanup      │
     │                │     Complete     │
     │                │<─────────────────┤
     │                │                  │
```

---

## 3. Component Flow Diagram

### 3.1 Complete Application Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │   Language   │  │ Voice Gender │  │ Interaction  │  │   Theme     ││
│  │   Selector   │  │   Selector   │  │    Mode      │  │  Selector   ││
│  │  (6 langs)   │  │  (Male/Fem)  │  │  Selector    │  │ (6 themes)  ││
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘│
│         │                  │                  │                  │       │
│         └──────────────────┴──────────────────┴──────────────────┘       │
│                                    │                                      │
└────────────────────────────────────┼──────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER (Browser)                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      public/index.html                            │  │
│  │  - Indian branding (कृषि सहायक / Krishi Sahayak)                 │  │
│  │  - Jai Kisan badge with flag                                     │  │
│  │  - Live IST date/time                                            │  │
│  │  - Chat container                                                │  │
│  │  - Export buttons (PDF, Email, WhatsApp, QR)                     │  │
│  │  - Help modal                                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      public/src/main.js                           │  │
│  │  - Socket.IO client connection                                   │  │
│  │  - Audio processing (Web Audio API + AudioWorklet)               │  │
│  │  - Chat history management                                       │  │
│  │  - Event handlers (textOutput, audioOutput, etc.)                │  │
│  │  - System prompt generation                                      │  │
│  │  - Export functions (PDF, QR, Email, WhatsApp)                   │  │
│  │  - Theme application                                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              public/src/lib/play/AudioPlayer.js                   │  │
│  │  - AudioWorklet processor (requires HTTPS)                       │  │
│  │  - 24kHz audio playback                                          │  │
│  │  - Barge-in support                                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │         public/src/lib/util/ChatHistoryManager.js                 │  │
│  │  - Conversation tracking                                         │  │
│  │  - Message storage for export                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     │ Socket.IO over HTTPS + WebSocket
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (Express Server)                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         src/server.js                             │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │              Socket.IO Server                            │    │  │
│  │  │  - Connection management                                 │    │  │
│  │  │  - Event handlers (audioInput, textMessage, etc.)        │    │  │
│  │  │  - Session tracking                                      │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │           Session Management                             │    │  │
│  │  │  - socketSessions Map                                    │    │  │
│  │  │  - sessionLanguages Map                                  │    │  │
│  │  │  - sessionVoiceGenders Map                               │    │  │
│  │  │  - sessionInteractionModes Map                           │    │  │
│  │  │  - sessionStates Map                                     │    │  │
│  │  │  - Automatic cleanup (5 min timeout)                     │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │         Weather API Integration                          │    │  │
│  │  │  - getCoordinates(locationName)                          │    │  │
│  │  │  - getWeatherForecast(lat, lon)                          │    │  │
│  │  │  - analyzeWeatherForecast(data)                          │    │  │
│  │  │  - formatWeatherMessage(analysis, lang)                  │    │  │
│  │  │  - extractLocation(message)                              │    │  │
│  │  │  - isWeatherQuery(message)                               │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────┐    │  │
│  │  │         Health Check Endpoints                           │    │  │
│  │  │  - GET /health                                           │    │  │
│  │  │  - GET /test-weather?location=<city>                     │    │  │
│  │  └─────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         src/client.js                             │  │
│  │  - NovaSonicBidirectionalStreamClient                            │  │
│  │  - AWS Bedrock connection wrapper                                │  │
│  │  - Event emission (textOutput, audioOutput, etc.)                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     │ HTTPS API Calls
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│    AWS BEDROCK NOVA2 LAYER       │  │    OPENWEATHER API LAYER         │
│                                  │  │                                  │
│  ┌────────────────────────────┐ │  │  ┌────────────────────────────┐ │
│  │      Nova Sonic             │ │  │  │   Geocoding API            │ │
│  │  us.amazon.nova-sonic-v1:0 │ │  │  │  /geo/1.0/direct           │ │
│  │                            │ │  │  │  - Location → Coordinates  │ │
│  │  - Speech-to-text          │ │  │  │  - Prioritize Indian cities│ │
│  │  - Text generation         │ │  │  └────────────────────────────┘ │
│  │  - Text-to-speech          │ │  │                                  │
│  │  - Multi-language          │ │  │  ┌────────────────────────────┐ │
│  │  - Voice: Matthew/Kiara    │ │  │  │   5-Day Forecast API       │ │
│  │  - 16kHz input             │ │  │  │  /data/2.5/forecast        │ │
│  │  - 24kHz output            │ │  │  │  - 3-hour intervals        │ │
│  └────────────────────────────┘ │  │  │  - Temperature, rain, etc. │ │
│                                  │  │  └────────────────────────────┘ │
│  ┌────────────────────────────┐ │  │                                  │
│  │      Nova Pro               │ │  └──────────────────────────────────┘
│  │  us.amazon.nova-pro-v1:0   │ │
│  │                            │ │
│  │  - Text-only chat          │ │
│  │  - Farming expertise       │ │
│  │  - Multi-language          │ │
│  │  - System prompt support   │ │
│  └────────────────────────────┘ │
│                                  │
└──────────────────────────────────┘


---

## 4. Infrastructure Architecture

### 4.1 AWS App Runner Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS APP RUNNER                                   │
│  Service: krishi-sahayak                                                 │
│  Region: us-east-1                                                       │
│  URL: https://xxxxxx.us-east-1.awsapprunner.com                     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    AUTOMATIC FEATURES                           │    │
│  │  ✓ HTTPS with SSL certificates                                 │    │
│  │  ✓ Auto-scaling (1-10 instances)                               │    │
│  │  ✓ Load balancing                                              │    │
│  │  ✓ Health monitoring                                           │    │
│  │  ✓ Logging (CloudWatch)                                        │    │
│  │  ✓ Pause/Resume capability                                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    DOCKER CONTAINER                             │    │
│  │  Image: 772770127418.dkr.ecr.us-east-1.amazonaws.com/          │    │
│  │         krishi-sahayak:latest                                   │    │
│  │                                                                 │    │
│  │  ┌──────────────────────────────────────────────────────────┐ │    │
│  │  │           Node.js 20 Alpine                               │ │    │
│  │  │  - Express Server (Port 3000)                            │ │    │
│  │  │  - Socket.IO Server                                      │ │    │
│  │  │  - Static file serving                                   │ │    │
│  │  │  - Session management                                    │ │    │
│  │  │  - Weather API integration                               │ │    │
│  │  └──────────────────────────────────────────────────────────┘ │    │
│  │                                                                 │    │
│  │  Resources:                                                     │    │
│  │  - CPU: 1 vCPU                                                  │    │
│  │  - Memory: 2 GB                                                 │    │
│  │  - Storage: Ephemeral                                           │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │              ENVIRONMENT VARIABLES                              │    │
│  │  - AWS_ACCESS_KEY_ID                                           │    │
│  │  - AWS_SECRET_ACCESS_KEY                                       │    │
│  │  - AWS_REGION=us-east-1                                        │    │
│  │  - OPEN_WEATHER_APIKEY                                         │    │
│  │  - PORT=3000                                                   │    │
│  │  - NODE_ENV=production                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    COST STRUCTURE                               │    │
│  │  Running:  ~$5/month                                           │    │
│  │  Paused:   ~$0.50/month (storage only)                         │    │
│  │  Deleted:  $0/month                                            │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│      AWS ECR                 │    │    AWS BEDROCK               │
│  Container Registry          │    │    Nova2 Models              │
│                              │    │                              │
│  Repository:                 │    │  - Nova Sonic (voice)        │
│  krishi-sahayak              │    │  - Nova Pro (text)           │
│                              │    │                              │
│  Images:                     │    │  Region: us-east-1           │
│  - latest                    │    │  Credentials: IAM            │
│  - v1.0.0                    │    │                              │
│  - v1.0.1                    │    │                              │
└──────────────────────────────┘    └──────────────────────────────┘
```


### 4.2 Deployment Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │     │              │
│  Developer   │────>│   GitHub     │────>│   AWS ECR    │────>│  AWS App     │
│  Local Dev   │     │  Repository  │     │  Container   │     │   Runner     │
│              │     │              │     │  Registry    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
      │                                           │                     │
      │ 1. Code Changes                          │                     │
      │    - src/server.js                       │                     │
      │    - public/src/main.js                  │                     │
      │    - Dockerfile                          │                     │
      │                                           │                     │
      │ 2. Build Docker Image                    │                     │
      │    docker build -t krishi-sahayak .      │                     │
      │                                           │                     │
      │ 3. Tag Image                              │                     │
      │    docker tag krishi-sahayak:latest \    │                     │
      │    772770127418.dkr.ecr.us-east-1...     │                     │
      │                                           │                     │
      │ 4. Authenticate with ECR                  │                     │
      │    aws ecr get-login-password...         │                     │
      │                                           │                     │
      │ 5. Push to ECR ──────────────────────────>│                     │
      │    docker push 772770127418...            │                     │
      │                                           │                     │
      │                                           │ 6. Trigger Deploy   │
      │                                           │    (Manual or Auto) │
      │                                           │────────────────────>│
      │                                           │                     │
      │                                           │ 7. Pull Image       │
      │                                           │<────────────────────│
      │                                           │                     │
      │                                           │ 8. Deploy Container │
      │                                           │    - Stop old       │
      │                                           │    - Start new      │
      │                                           │    - Health check   │
      │                                           │                     │
      │                                           │ 9. Service Running  │
      │                                           │    ✓ HTTPS enabled  │
      │                                           │    ✓ Auto-scaling   │
      │<──────────────────────────────────────────────────────────────────
      │ 10. Access Application

### 4.3 Pause/Resume Operations

```
┌──────────────────────────────────────────────────────────────────┐
│                    COST OPTIMIZATION                              │
│                                                                   │
│  RUNNING STATE                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ✓ Container running                                       │ │
│  │  ✓ Accepting requests                                      │ │
│  │  ✓ Auto-scaling active                                     │ │
│  │  Cost: ~$5/month                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                       │
│                           │ aws apprunner pause-service           │
│                           ▼                                       │
│  PAUSED STATE                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ✗ Container stopped                                       │ │
│  │  ✗ Not accepting requests                                  │ │
│  │  ✓ Image stored in ECR                                     │ │
│  │  ✓ Configuration preserved                                 │ │
│  │  Cost: ~$0.50/month (storage only)                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                       │
│                           │ aws apprunner resume-service          │
│                           ▼                                       │
│  RUNNING STATE (restored in ~2 minutes)                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. System Prompt

### 5.1 Concise Mode (Default)

```
You are a female AI assistant and an expert farming assistant for Indian farmers. 
Provide EXTREMELY BRIEF, direct answers (1-2 sentences maximum). Focus only on 
the most critical information. Be practical and action-oriented. When greeting, 
keep it very short. Ask only one simple question at a time. 

IMPORTANT: You do NOT have access to weather tools. When users ask about weather, 
forecasts, or rain predictions, respond with: "I can check the weather forecast 
for you. Which city would you like the forecast for?" Do NOT provide weather 
data yourself.
```

### 5.2 Detailed Mode

```
You are a female AI assistant and an expert farming assistant specializing in 
Indian agriculture. Your role is to provide practical, concise advice to Indian 
farmers on various agricultural topics including crop management, pest control, 
soil health, government schemes, modern farming technologies, organic farming, 
water management, and market strategies. 

When starting a conversation, greet the farmer warmly and ask about their 
location, primary crops, and specific concerns. Keep responses concise (2-3 
sentences when possible), specific to Indian farming conditions, easy to 
understand, and action-oriented. Always be respectful, patient, and supportive. 
Ask one question at a time and wait for the farmer's response before proceeding. 

IMPORTANT: You do NOT have access to weather tools. When users ask about weather, 
forecasts, or rain predictions, respond with: "I can check the weather forecast 
for you. Which city would you like the forecast for?" Do NOT provide weather 
data yourself.
```

### 5.3 Voice Gender Variants

**Male Voice:**
- Prefix: "You are a male AI assistant"
- Voice ID: matthew (AWS Bedrock Nova Sonic)

**Female Voice:**
- Prefix: "You are a female AI assistant"
- Voice ID: kiara (AWS Bedrock Nova Sonic)

### 5.4 System Prompt Configuration

The system prompt is dynamically generated based on:
1. **Response Style**: Concise or Detailed
2. **Voice Gender**: Male or Female
3. **Weather Guidance**: Always included to redirect weather queries

Location in code:
- **Frontend**: `public/src/main.js` - `updateSystemPrompt()` function
- **Backend**: `src/consts.js` - Prompt templates

---

## 6. Deployment Architecture

### 6.1 Complete Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TECHNOLOGY STACK                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  FRONTEND                                                                │
│  ├─ HTML5 (public/index.html)                                           │
│  ├─ CSS3 (public/src/style-enhanced.css, voice-agent.css)               │
│  ├─ Vanilla JavaScript ES6+ (public/src/main.js)                        │
│  ├─ Web Audio API + AudioWorklet (requires HTTPS)                       │
│  ├─ Socket.IO Client (v4.x)                                             │
│  ├─ jsPDF (PDF generation)                                              │
│  ├─ html2canvas (Screenshot for PDF)                                    │
│  └─ QRCode.js (QR code generation)                                      │
│                                                                          │
│  BACKEND                                                                 │
│  ├─ Node.js 20 Alpine                                                   │
│  ├─ Express.js (HTTP server)                                            │
│  ├─ Socket.IO Server (v4.x)                                             │
│  ├─ AWS SDK for JavaScript v3                                           │
│  │  ├─ @aws-sdk/client-bedrock-runtime                                  │
│  │  └─ @aws-sdk/credential-providers                                    │
│  ├─ Axios (HTTP client for OpenWeather API)                             │
│  └─ dotenv (Environment variables)                                      │
│                                                                          │
│  INFRASTRUCTURE                                                          │
│  ├─ AWS App Runner (Container orchestration)                            │
│  ├─ AWS ECR (Container registry)                                        │
│  ├─ Docker (Containerization)                                           │
│  └─ HTTPS/SSL (Automatic via App Runner)                                │
│                                                                          │
│  AI SERVICES                                                             │
│  ├─ AWS Bedrock Nova Sonic (us.amazon.nova-sonic-v1:0)                  │
│  │  ├─ Speech-to-text                                                   │
│  │  ├─ Text generation                                                  │
│  │  └─ Text-to-speech                                                   │
│  └─ AWS Bedrock Nova Pro (us.amazon.nova-pro-v1:0)                      │
│     └─ Text-only chat                                                   │
│                                                                          │
│  EXTERNAL APIS                                                           │
│  ├─ OpenWeather Geocoding API                                           │
│  └─ OpenWeather 5-Day Forecast API                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 File Structure

```
krishi-sahayak/
│
├── .dockerignore                    # Docker ignore patterns
├── .env                             # Environment variables (NOT in git)
├── .env.example                     # Example environment variables
├── .gitignore                       # Git ignore patterns
├── Dockerfile                       # Docker container definition
├── docker-compose.yml               # Docker Compose configuration
├── package.json                     # Node.js dependencies
├── package-lock.json                # Locked dependencies
│
├── DEPLOYMENT.md                    # Deployment guide
├── EC2-DEPLOYMENT-QUICK.md          # EC2 deployment guide
├── DEMO-QUESTIONS.md                # Demo script
├── ARCHITECTURE-DIAGRAMS.md         # This file
│
├── src/                             # Backend source code
│   ├── server.js                    # Express + Socket.IO server
│   ├── client.js                    # AWS Bedrock client wrapper
│   ├── consts.js                    # Constants and prompts
│   └── types.js                     # Type definitions
│
├── public/                          # Frontend static files
│   ├── index.html                   # Main HTML page
│   ├── help-content.html            # Help modal content
│   │
│   └── src/                         # Frontend JavaScript
│       ├── main.js                  # Main application logic
│       ├── style-enhanced.css       # Enhanced styles
│       ├── style.css                # Base styles
│       ├── voice-agent.css          # Voice UI styles
│       │
│       └── lib/                     # Libraries
│           ├── play/
│           │   ├── AudioPlayer.js   # Audio playback
│           │   └── AudioPlayerProcessor.worklet.js
│           │
│           └── util/
│               ├── ChatHistoryManager.js
│               └── ObjectsExt.js
│
└── .kiro/                           # Kiro spec files
    └── specs/
        └── indian-farmer-voice-assistant/
            ├── requirements.md      # Requirements document
            ├── design.md            # Design document
            └── tasks.md             # Implementation tasks
```

### 6.3 Data Flow Summary

```
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. USER INPUT                                                        │
│     ├─ Voice: Microphone → Web Audio API → 16kHz PCM                 │
│     └─ Text: Text input field → String                               │
│                                                                       │
│  2. FRONTEND PROCESSING                                               │
│     ├─ Audio: AudioWorklet processor (requires HTTPS)                │
│     ├─ Base64 encoding                                               │
│     └─ Socket.IO emit                                                │
│                                                                       │
│  3. BACKEND ROUTING                                                   │
│     ├─ Voice modes → AWS Bedrock Nova Sonic                          │
│     ├─ Text chat → AWS Bedrock Nova Pro                              │
│     └─ Weather queries → OpenWeather API                             │
│                                                                       │
│  4. AI PROCESSING                                                     │
│     ├─ Nova Sonic:                                                   │
│     │  ├─ Speech → Text (transcription)                              │
│     │  ├─ Text → Text (generation with system prompt)                │
│     │  └─ Text → Speech (synthesis with voice gender)                │
│     │                                                                 │
│     └─ Nova Pro:                                                     │
│        └─ Text → Text (generation with system prompt)                │
│                                                                       │
│  5. WEATHER PROCESSING (Text Chat Only)                              │
│     ├─ Detect weather query                                          │
│     ├─ Extract location                                              │
│     ├─ Geocoding API → Coordinates                                   │
│     ├─ Forecast API → 5-day data                                     │
│     ├─ Analyze next 24 hours                                         │
│     └─ Format with farming advice                                    │
│                                                                       │
│  6. BACKEND RESPONSE                                                  │
│     ├─ Text: Socket.IO emit (textOutput)                             │
│     └─ Audio: Socket.IO emit (audioOutput) - 24kHz PCM               │
│                                                                       │
│  7. FRONTEND DISPLAY                                                  │
│     ├─ Text: Append to chat container                                │
│     ├─ Audio: AudioPlayer playback (voice-audio mode only)           │
│     ├─ Update sidebars with contextual content                       │
│     └─ Track for PDF export                                          │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```


### 6.4 Security & Authentication

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TRANSPORT SECURITY                                                      │
│  ├─ HTTPS (TLS 1.2+) - Automatic via AWS App Runner                     │
│  ├─ WebSocket Secure (WSS) - Automatic upgrade from HTTPS               │
│  └─ SSL Certificates - Managed by AWS App Runner                        │
│                                                                          │
│  AUTHENTICATION                                                          │
│  ├─ AWS Credentials (IAM)                                               │
│  │  ├─ AWS_ACCESS_KEY_ID                                                │
│  │  ├─ AWS_SECRET_ACCESS_KEY                                            │
│  │  └─ Stored in App Runner environment variables                       │
│  │                                                                       │
│  └─ OpenWeather API Key                                                 │
│     ├─ OPEN_WEATHER_APIKEY                                              │
│     └─ Stored in App Runner environment variables                       │
│                                                                          │
│  BROWSER SECURITY                                                        │
│  ├─ AudioWorklet requires HTTPS (browser security policy)               │
│  ├─ Microphone access requires user permission                          │
│  ├─ Same-origin policy for Socket.IO                                    │
│  └─ Content Security Policy headers                                     │
│                                                                          │
│  SESSION SECURITY                                                        │
│  ├─ Socket.IO session IDs (unique per connection)                       │
│  ├─ Automatic cleanup after 5 minutes of inactivity                     │
│  ├─ No persistent storage of user data                                  │
│  └─ Ephemeral container storage                                         │
│                                                                          │
│  API SECURITY                                                            │
│  ├─ AWS Bedrock: IAM-based authentication                               │
│  ├─ OpenWeather: API key authentication                                 │
│  └─ Rate limiting (handled by AWS App Runner)                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.5 Monitoring & Health Checks

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MONITORING & HEALTH CHECKS                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HEALTH CHECK ENDPOINTS                                                  │
│  ├─ GET /health                                                          │
│  │  └─ Returns:                                                          │
│  │     ├─ status: 'ok'                                                   │
│  │     ├─ timestamp: ISO 8601                                            │
│  │     ├─ activeSessions: number                                         │
│  │     └─ socketConnections: number                                      │
│  │                                                                        │
│  └─ GET /test-weather?location=<city>                                    │
│     └─ Returns:                                                          │
│        ├─ coordinates: {lat, lon, name, state, country}                 │
│        ├─ forecastData: 5-day forecast                                  │
│        ├─ weatherAnalysis: 24-hour analysis                             │
│        └─ formattedMessage: Farming advice                              │
│                                                                          │
│  AWS APP RUNNER MONITORING                                               │
│  ├─ CloudWatch Logs                                                      │
│  │  ├─ Application logs                                                  │
│  │  ├─ Error logs                                                        │
│  │  └─ Access logs                                                       │
│  │                                                                        │
│  ├─ CloudWatch Metrics                                                   │
│  │  ├─ Request count                                                     │
│  │  ├─ Response time                                                     │
│  │  ├─ Error rate                                                        │
│  │  ├─ CPU utilization                                                   │
│  │  └─ Memory utilization                                               │
│  │                                                                        │
│  └─ Auto-scaling Triggers                                                │
│     ├─ CPU > 70% → Scale up                                              │
│     ├─ CPU < 30% → Scale down                                            │
│     ├─ Min instances: 1                                                  │
│     └─ Max instances: 10                                                 │
│                                                                          │
│  APPLICATION LOGGING                                                     │
│  ├─ Session lifecycle events                                             │
│  ├─ AWS Bedrock API calls                                                │
│  ├─ OpenWeather API calls                                                │
│  ├─ Error tracking                                                       │
│  └─ Performance metrics                                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.6 Scalability & Performance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SCALABILITY & PERFORMANCE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  AUTO-SCALING                                                            │
│  ├─ Horizontal scaling (1-10 instances)                                 │
│  ├─ Automatic based on CPU/memory                                       │
│  ├─ Load balancing across instances                                     │
│  └─ Zero-downtime deployments                                           │
│                                                                          │
│  PERFORMANCE OPTIMIZATIONS                                               │
│  ├─ AudioWorklet for low-latency audio processing                       │
│  ├─ Base64 encoding for efficient data transfer                         │
│  ├─ Socket.IO for real-time bidirectional communication                 │
│  ├─ Session-based state management (in-memory)                          │
│  └─ Automatic cleanup of inactive sessions                              │
│                                                                          │
│  AUDIO PROCESSING                                                        │
│  ├─ Input: 16kHz PCM (512 samples per buffer)                           │
│  ├─ Output: 24kHz PCM                                                   │
│  ├─ Barge-in support (interrupt assistant)                              │
│  └─ Browser-native audio processing                                     │
│                                                                          │
│  CACHING                                                                 │
│  ├─ Static files served by Express                                      │
│  ├─ Browser caching for CSS/JS                                          │
│  └─ Session storage for user preferences                                │
│                                                                          │
│  CONCURRENT USERS                                                        │
│  ├─ Each user gets independent Socket.IO session                        │
│  ├─ Each session has independent AWS Bedrock connection                 │
│  ├─ No shared state between users                                       │
│  └─ Automatic scaling handles load                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Features Summary

### 7.1 Multi-Language Support
- 6 languages: English, Hindi, Italian, French, German, Spanish
- Language selector in UI
- Backend tracks language per session
- AI models process in selected language

### 7.2 Three Interaction Modes
1. **Voice-Audio (Speak + Listen)**: Full voice conversation with audio playback
2. **Voice-Text (Speak, Read Text)**: Voice input, text output (hearing-impaired)
3. **Text Chat**: Type and read with weather forecast capability

### 7.3 Voice Gender Selection
- Male voice: Matthew (AWS Bedrock Nova Sonic)
- Female voice: Kiara (AWS Bedrock Nova Sonic)
- Applied to all audio responses

### 7.4 Weather Forecasts (Text Chat Only)
- OpenWeather API integration
- Geocoding for Indian cities
- 5-day forecast with 24-hour analysis
- Farming-specific advice based on conditions

### 7.5 Export Features
- PDF download with full transcript
- Email sharing via Gmail
- WhatsApp sharing
- QR code generation

### 7.6 Indian Branding
- कृषि सहायक (Hindi) in saffron
- Krishi Sahayak (English) in green
- Jai Kisan badge with Indian flag
- Ashoka Chakra icon
- Live IST date/time

### 7.7 Visual Themes
- 6 themes: Emerald Garden, Golden Harvest, Ocean Breeze, Lavender Fields, Autumn Glow, Midnight Sky
- Session persistence
- Dynamic color application

### 7.8 Contextual Sidebars
- Left sidebar: Helpful resources (government schemes, articles)
- Right sidebar: Visual guides (images, farming guides)
- Dynamic updates based on conversation

### 7.9 Response Style
- Concise: 1-2 sentences, brief and practical
- Detailed: Comprehensive with explanations

---

## 8. Deployment Commands Reference

### Build and Deploy
```bash
# Build Docker image
docker build -t krishi-sahayak .

# Tag for ECR
docker tag krishi-sahayak:latest \
  .dkr.ecr.us-east-1.amazonaws.com/krishi-sahayak:latest

# Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  .dkr.ecr.us-east-1.amazonaws.com

# Push to ECR
docker push xxxxx.amazonaws.com/krishi-sahayak:latest
```

### Manage App Runner Service
```bash
# Pause service (reduce costs)
aws apprunner pause-service \
  --service-arn <service-arn> \
  --region us-east-1

# Resume service
aws apprunner resume-service \
  --service-arn <service-arn> \
  --region us-east-1

# Check service status
aws apprunner describe-service \
  --service-arn <service-arn> \
  --region us-east-1
```

### Health Checks
```bash
# Check application health
curl https://XXXXXXXX.us-east-1.awsapprunner.com/health

# Test weather API
curl "https://XXXXXX.awsapprunner.com/test-weather?location=Bangalore"
```

---

**Document Version**: 1.0  
**Last Updated**: 2025  
**Application URL**: https://XXXXXXX.awsapprunner.com  
**Repository**: krishi-sahayak
