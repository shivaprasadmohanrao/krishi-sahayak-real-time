# Requirements Document

## Introduction

This document specifies the requirements for Krishi Sahayak (कृषि सहायक), a production-ready AI-powered farming assistant designed specifically for Indian farmers. The application is deployed on AWS App Runner and provides real-time voice and text interaction using AWS Bedrock Nova2 models, Socket.IO for bidirectional communication, and OpenWeather API for weather forecasts.

The system enables Indian farmers to interact with an AI assistant through multiple modes (voice-audio, voice-text, text chat) in their preferred language, receiving practical advice on farming practices, crop management, pest control, soil health, weather-based recommendations, and information about government schemes. The application includes export features (PDF, Email, WhatsApp, QR codes), contextual sidebars with resources and visual guides, and a professional UI with multiple themes.

## Glossary

- **System**: The complete voice assistant application including frontend, backend, AWS Bedrock integration, and AWS App Runner deployment
- **Frontend**: The browser-based user interface built with vanilla JavaScript, Web Audio API, and Socket.IO client
- **Backend**: The Node.js Express server with Socket.IO server running on AWS App Runner
- **Nova_Sonic**: AWS Bedrock Nova Sonic model (us.amazon.nova-sonic-v1:0) for voice-to-voice processing
- **Nova_Pro**: AWS Bedrock Nova Pro model (us.amazon.nova-pro-v1:0) for text-only chat
- **User**: An Indian farmer interacting with the voice assistant
- **Language_Selector**: UI component allowing users to choose their preferred language
- **Voice_Gender_Selector**: UI component allowing users to choose male or female voice
- **Interaction_Mode_Selector**: UI component allowing users to choose between voice-audio, voice-text, or text chat modes
- **Theme_Selector**: UI component allowing users to choose visual themes
- **System_Prompt**: The instruction text that defines the AI assistant's role and behavior
- **Transcription_Display**: UI component showing real-time text of spoken conversations
- **Audio_Stream**: Real-time audio data transmitted between client and server
- **Session**: A single conversation instance between user and assistant
- **Left_Sidebar**: Contextual information panel showing helpful resources based on conversation topics
- **Right_Sidebar**: Visual guide panel showing contextual images and farming guides
- **Export_Features**: PDF download, email sharing, WhatsApp sharing, and QR code generation
- **Weather_API**: OpenWeather API integration for real-time weather forecasts
- **AWS_App_Runner**: AWS service providing automatic HTTPS, SSL certificates, and auto-scaling for the application
- **AudioWorklet**: Web Audio API feature for low-latency audio processing (requires HTTPS)

## Requirements

### Requirement 1: Multi-Language Voice and Text Interaction

**User Story:** As an Indian farmer, I want to interact with the assistant in my preferred language through voice or text, so that I can communicate naturally and understand the advice clearly.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a language selector with options for English, Hindi, Italian, French, German, and Spanish
2. WHEN a user selects a language, THE System SHALL configure the Nova_Sonic model to process speech in that language
3. WHEN a user speaks in the selected language, THE System SHALL transcribe the speech to text in that language
4. WHEN the assistant responds in voice mode, THE Nova_Sonic SHALL generate speech output in the selected language
5. WHEN the language is changed, THE Transcription_Display SHALL show text in the newly selected language for all subsequent interactions
6. WHEN a user types in text chat mode, THE Nova_Pro SHALL process and respond in the selected language

### Requirement 2: Farming Domain Expertise

**User Story:** As an Indian farmer, I want to receive expert advice on farming topics, so that I can improve my agricultural practices and productivity.

#### Acceptance Criteria

1. WHEN the session starts, THE System SHALL initialize the Nova models with a farming expert system prompt
2. WHEN a user asks about crop management, THE System SHALL provide advice specific to Indian farming practices
3. WHEN a user describes pest or disease symptoms, THE System SHALL suggest identification and treatment options
4. WHEN a user inquires about soil health, THE System SHALL provide recommendations for fertilizers and soil management
5. WHEN a user asks about weather-related farming decisions, THE System SHALL provide weather-based agricultural advice
6. WHEN a user asks about government schemes, THE System SHALL provide information about subsidies and programs for farmers
7. WHEN a user asks about farming equipment, THE System SHALL provide guidance on modern farming technologies
8. WHEN a user asks about organic farming, THE System SHALL provide information on organic farming methods
9. WHEN a user asks about water management, THE System SHALL provide irrigation and water conservation advice
10. WHEN a user asks about market prices, THE System SHALL provide guidance on selling strategies
11. WHEN providing advice, THE System SHALL keep responses concise and practical for farmers
12. WHEN starting a conversation, THE System SHALL ask farmers about their location, crop type, and specific issues

### Requirement 3: Multiple Interaction Modes

**User Story:** As an Indian farmer, I want to choose how I interact with the assistant (speak and listen, speak and read, or type and read), so that I can use the mode that best suits my needs and environment.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display an interaction mode selector with three options: "Speak + Listen", "Speak, Read Text", and "Text Chat"
2. WHEN "Speak + Listen" mode is selected, THE System SHALL enable voice input and audio output (full voice conversation)
3. WHEN "Speak, Read Text" mode is selected, THE System SHALL enable voice input and text output (for hearing-impaired users)
4. WHEN "Text Chat" mode is selected, THE System SHALL enable text input and text output with weather forecast capability
5. WHEN in voice modes, THE System SHALL use Nova_Sonic for speech-to-speech processing
6. WHEN in text chat mode, THE System SHALL use Nova_Pro for text-only processing
7. WHEN switching modes, THE System SHALL maintain the conversation context and language preference

### Requirement 4: Voice Gender Selection

**User Story:** As an Indian farmer, I want to choose between male and female voice for the assistant, so that I can interact with a voice I'm comfortable with.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a voice gender selector with options for "Male" and "Female"
2. WHEN "Female" is selected, THE System SHALL use female voice (Kiara) for audio responses
3. WHEN "Male" is selected, THE System SHALL use male voice (Matthew) for audio responses
4. WHEN the voice gender is changed, THE System SHALL apply the new voice to all subsequent audio responses
5. WHEN in text chat mode, THE voice gender selector SHALL have no effect on responses

### Requirement 5: Real-Time Weather Forecasts

**User Story:** As an Indian farmer, I want to get accurate weather forecasts for my location, so that I can plan my farming activities accordingly.

#### Acceptance Criteria

1. WHEN in text chat mode, THE System SHALL detect weather-related queries in user messages
2. WHEN a weather query is detected, THE System SHALL extract the location from the user message
3. WHEN a location is extracted, THE System SHALL use OpenWeather Geocoding API to get coordinates
4. WHEN coordinates are obtained, THE System SHALL fetch 5-day forecast data from OpenWeather API
5. WHEN forecast data is received, THE System SHALL analyze the next 24 hours of weather data
6. WHEN analysis is complete, THE System SHALL provide temperature range, rain probability, and farming-specific advice
7. WHEN rain probability is high (>60%), THE System SHALL advise minimal irrigation needs
8. WHEN temperature is high (>35°C), THE System SHALL advise adequate watering
9. WHEN temperature is low (<15°C), THE System SHALL advise protecting crops from frost
10. WHEN no location is found in the message, THE System SHALL ask the user to provide a location
11. WHEN weather forecasts are requested in voice modes, THE System SHALL inform the user to switch to text chat mode

### Requirement 6: Export and Sharing Features

**User Story:** As an Indian farmer, I want to save and share my conversation with the assistant, so that I can refer to the advice later or share it with others.

#### Acceptance Criteria

1. WHEN a conversation is active, THE Frontend SHALL display export options: Download PDF, Email, WhatsApp, and QR Code
2. WHEN "Download PDF" is clicked, THE System SHALL generate a PDF with full transcript, timestamps, resources, and images
3. WHEN "Email" is clicked, THE System SHALL open Gmail compose with the transcript in the body
4. WHEN "WhatsApp" is clicked, THE System SHALL open WhatsApp Web with the transcript ready to send
5. WHEN "QR Code" is clicked, THE System SHALL generate a QR code that links to the PDF download
6. WHEN the PDF is generated, THE System SHALL include the conversation history, helpful resources, and visual guides
7. WHEN exporting, THE System SHALL use jsPDF and html2canvas libraries for PDF generation
8. WHEN exporting, THE System SHALL use QRCode.js library for QR code generation

### Requirement 7: Contextual Sidebars

**User Story:** As an Indian farmer, I want to see relevant resources and visual guides based on my conversation, so that I can learn more about the topics discussed.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a left sidebar with helpful resources
2. WHEN the application loads, THE Frontend SHALL display a right sidebar with visual guides
3. WHEN the conversation mentions specific topics, THE Left_Sidebar SHALL update with relevant government schemes, articles, and links
4. WHEN the conversation mentions specific topics, THE Right_Sidebar SHALL update with contextual images and farming guides
5. WHEN no specific topics are mentioned, THE Left_Sidebar SHALL show welcome message with common farming topics
6. WHEN no specific topics are mentioned, THE Right_Sidebar SHALL show placeholder message
7. WHEN resources are displayed, THE System SHALL use professional SVG icons (no emojis)

### Requirement 8: Visual Themes

**User Story:** As an Indian farmer, I want to choose a visual theme for the application, so that I can personalize my experience.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a theme selector with six options
2. WHEN "Emerald Garden" is selected, THE System SHALL apply green-themed colors
3. WHEN "Golden Harvest" is selected, THE System SHALL apply golden/yellow-themed colors
4. WHEN "Ocean Breeze" is selected, THE System SHALL apply blue-themed colors
5. WHEN "Lavender Fields" is selected, THE System SHALL apply purple-themed colors
6. WHEN "Autumn Glow" is selected, THE System SHALL apply orange/brown-themed colors
7. WHEN "Midnight Sky" is selected, THE System SHALL apply dark blue/black-themed colors
8. WHEN a theme is changed, THE System SHALL persist the selection for the duration of the session

### Requirement 9: Professional UI with Indian Branding

**User Story:** As an Indian farmer, I want the interface to reflect Indian culture and farming context, so that I feel the application is designed for me.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display "कृषि सहायक" (Hindi) in saffron color and "Krishi Sahayak" (English) in green color
2. WHEN the application loads, THE Frontend SHALL display "Jai Kisan!" badge with Indian flag icon in the top-left corner
3. WHEN the application loads, THE Frontend SHALL display Ashoka Chakra icon in the center of the title
4. WHEN the application loads, THE Frontend SHALL display live date and time in IST timezone in the top-right corner
5. WHEN the application loads, THE Frontend SHALL display footer message: "Empowering Indian Farmers with AI Technology with LOVE and RESPECT"
6. WHEN displaying UI elements, THE System SHALL use professional SVG icons (no emojis)
7. WHEN displaying the interface, THE System SHALL use farming-themed animated background

### Requirement 10: Help and Search Features

**User Story:** As an Indian farmer, I want to access help documentation and search for farming topics, so that I can learn how to use the application and find information quickly.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a help button in the header
2. WHEN the help button is clicked, THE System SHALL open a help modal with multiple tabs
3. WHEN the help modal is open, THE System SHALL display tabs for: Guide, Interactive Tutorial, FAQs, Features, and Resources
4. WHEN the help modal is open, THE System SHALL display a search box for farming topics
5. WHEN a user types in the search box, THE System SHALL search for crops, pests, schemes, weather, and other farming topics
6. WHEN search results are found, THE System SHALL display relevant information and links
7. WHEN the help modal is closed, THE System SHALL return to the main interface

### Requirement 11: AWS App Runner Deployment

**User Story:** As a system administrator, I want the application deployed on AWS App Runner, so that it has automatic HTTPS, SSL certificates, and auto-scaling.

#### Acceptance Criteria

1. WHEN the application is deployed, THE System SHALL run on AWS App Runner
2. WHEN the application is accessed, THE System SHALL provide automatic HTTPS at the App Runner URL
3. WHEN the application receives traffic, THE System SHALL auto-scale based on demand
4. WHEN the application is paused, THE System SHALL reduce costs to approximately $0.50/month
5. WHEN the application is running, THE System SHALL cost approximately $5/month
6. WHEN the application is deployed, THE System SHALL use Docker containerization with Node.js 20 Alpine
7. WHEN the application is deployed, THE System SHALL load environment variables from AWS App Runner configuration

### Requirement 12: Audio Processing with HTTPS Requirement

**User Story:** As a developer, I want the audio processing to use AudioWorklet for low-latency performance, which requires HTTPS for browser security.

#### Acceptance Criteria

1. WHEN processing audio in voice modes, THE System SHALL use Web Audio API with AudioWorklet
2. WHEN AudioWorklet is used, THE System SHALL require HTTPS connection
3. WHEN the application is accessed via HTTP, THE System SHALL display a warning that voice modes require HTTPS
4. WHEN the application is accessed via HTTPS, THE System SHALL enable all voice modes
5. WHEN processing audio input, THE System SHALL use 16kHz PCM format
6. WHEN processing audio output, THE System SHALL use 24kHz PCM format

### Requirement 13: Session Management and State Tracking

**User Story:** As a developer, I want robust session management to track user preferences and conversation state, so that the application provides a consistent experience.

#### Acceptance Criteria

1. WHEN a user connects, THE Backend SHALL create a unique session with Socket.IO
2. WHEN a user selects preferences, THE Backend SHALL store language, voice gender, and interaction mode per session
3. WHEN a user disconnects, THE Backend SHALL clean up the session and release resources
4. WHEN a session is inactive for 5 minutes, THE Backend SHALL automatically close the session
5. WHEN a session is closed, THE Backend SHALL emit a sessionClosed event to the client
6. WHEN multiple users connect, THE Backend SHALL manage concurrent sessions independently
7. WHEN a session encounters an error, THE Backend SHALL emit an error event to the client

### Requirement 14: Health Monitoring and Testing

**User Story:** As a system administrator, I want health check and testing endpoints, so that I can monitor the application status and test integrations.

#### Acceptance Criteria

1. WHEN the /health endpoint is accessed, THE System SHALL return status, timestamp, active sessions, and socket connections
2. WHEN the /test-weather endpoint is accessed with a location parameter, THE System SHALL test the weather API integration
3. WHEN the weather test is successful, THE System SHALL return coordinates, forecast data, analysis, and formatted message
4. WHEN the weather test fails, THE System SHALL return error details and API key status
5. WHEN the application starts, THE System SHALL log AWS credentials status and region
6. WHEN the application starts, THE System SHALL verify OpenWeather API key is present

### Requirement 15: Response Style Configuration

**User Story:** As an Indian farmer, I want to choose between concise and detailed responses, so that I can get the level of detail I prefer.

#### Acceptance Criteria

1. WHEN the application loads, THE Frontend SHALL display a response style selector with options for "Concise" and "Detailed"
2. WHEN "Concise" is selected, THE System SHALL configure the assistant to provide brief, practical responses
3. WHEN "Detailed" is selected, THE System SHALL configure the assistant to provide comprehensive, explanatory responses
4. WHEN the response style is changed, THE System SHALL apply the new style to all subsequent responses
5. WHEN the response style is set, THE System SHALL include the preference in the system prompt
