// Mock voices for when no API key is configured
const mockVoices = [
  {
    voice_id: 'mock-voice-1',
    name: 'Alex - Professional Male',
    preview_url: null,
    labels: { accent: 'American', gender: 'male', use_case: 'narration' }
  },
  {
    voice_id: 'mock-voice-2',
    name: 'Sarah - Friendly Female',
    preview_url: null,
    labels: { accent: 'American', gender: 'female', use_case: 'conversational' }
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    // Use environment variable for API key (hardcoded for client)
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!elevenLabsApiKey) {
      console.log('[Voiceover] No API key configured, using mock voices');
      return res.json({
        success: true,
        data: { voices: mockVoices }
      });
    }
    
    console.log('[Voiceover] Fetching voices from ElevenLabs');
    
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          error: { message: 'Invalid ElevenLabs API key', code: 'AUTH_ERROR' }
        });
      }
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const voices = data.voices.map(voice => ({
      voice_id: voice.voice_id,
      name: voice.name,
      preview_url: voice.preview_url,
      labels: voice.labels || {}
    }));
    
    res.json({
      success: true,
      data: { voices }
    });
    
  } catch (error) {
    console.error('[Voiceover] List voices error:', error.message);
    res.status(500).json({
      error: { message: error.message || 'Failed to fetch voices', code: 'INTERNAL_ERROR' }
    });
  }
}
