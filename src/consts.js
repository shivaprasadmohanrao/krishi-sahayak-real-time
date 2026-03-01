const DefaultInferenceConfiguration = {
  maxTokens: 1024,
  topP: 0.9,
  temperature: 0.1,
};

const DefaultAudioInputConfiguration = {
  audioType: "SPEECH",
  encoding: "base64",
  mediaType: "audio/lpcm",
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
};

const DefaultToolSchema = JSON.stringify({
  "type": "object",
  "properties": {},
  "required": []
});

const WeatherToolSchema = JSON.stringify({
  "type": "object",
  "properties": {
    "latitude": {
      "type": "string",
      "description": "Geographical WGS84 latitude of the location."
    },
    "longitude": {
      "type": "string",
      "description": "Geographical WGS84 longitude of the location."
    }
  },
  "required": ["latitude", "longitude"]
});

const DefaultTextConfiguration = { mediaType: "text/plain" };

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
- Concise and practical (2-3 sentences when possible)
- Specific to Indian farming conditions
- Easy to understand for farmers with varying education levels
- Action-oriented with clear next steps

Always be respectful, patient, and supportive. Ask one question at a time and wait for the farmer's response before proceeding.`;

const ConciseFarmingPrompt = `You are an expert farming assistant for Indian farmers. Provide EXTREMELY BRIEF, direct answers (1-2 sentences maximum). Focus only on the most critical information. Be practical and action-oriented. When greeting, keep it very short. Ask only one simple question at a time.`;

const DetailedFarmingPrompt = FarmingAssistantSystemPrompt;

// Keep the old prompt for backward compatibility if needed
const DefaultSystemPrompt = FarmingAssistantSystemPrompt;

const DefaultAudioOutputConfiguration = {
  ...DefaultAudioInputConfiguration,
  sampleRateHertz: 24000,
//   voiceId: "tiffany",
voiceId: "kiara",
};

module.exports = {
  DefaultInferenceConfiguration,
  DefaultAudioInputConfiguration,
  DefaultToolSchema,
  WeatherToolSchema,
  DefaultTextConfiguration,
  DefaultSystemPrompt,
  FarmingAssistantSystemPrompt,
  ConciseFarmingPrompt,
  DetailedFarmingPrompt,
  DefaultAudioOutputConfiguration
};
