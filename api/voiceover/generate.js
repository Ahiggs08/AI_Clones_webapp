const axios = require('axios');

// ElevenLabs API client
const createElevenLabsClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.elevenlabs.io/v1',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 60000
  });
};

// Mock voiceover generation
const generateMockVoiceover = async (script, voiceId) => {
  return {
    audioUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand3.wav',
    duration: 3.5,
    voiceId,
    characterCount: script.length,
    generatedAt: new Date().toISOString()
  };
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-elevenlabs-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  try {
    const { script, voiceId } = req.body;
    const elevenLabsApiKey = req.headers['x-elevenlabs-api-key'] || req.body.elevenLabsApiKey;
    
    // Validation
    if (!script || script.trim().length === 0) {
      return res.status(400).json({
        error: {
          message: 'Script is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    if (!voiceId) {
      return res.status(400).json({
        error: {
          message: 'Voice ID is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    if (script.length > 5000) {
      return res.status(400).json({
        error: {
          message: 'Script exceeds 5000 character limit',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    if (!elevenLabsApiKey) {
      console.log('[Voiceover] No API key provided, using mock generation');
      const result = await generateMockVoiceover(script, voiceId);
      return res.json({
        success: true,
        data: result
      });
    }
    
    // Use real ElevenLabs API
    console.log('[Voiceover] Generating with ElevenLabs');
    const client = createElevenLabsClient(elevenLabsApiKey);
    
    const response = await client.post(
      `/text-to-speech/${voiceId}`,
      {
        text: script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        responseType: 'arraybuffer'
      }
    );
    
    // Return audio as base64
    const base64Audio = Buffer.from(response.data).toString('base64');
    
    res.json({
      success: true,
      data: {
        audioData: base64Audio,
        contentType: response.headers['content-type'],
        voiceId,
        characterCount: script.length,
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Voiceover] Generation error:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: {
          message: 'Invalid ElevenLabs API key',
          code: 'AUTH_ERROR'
        }
      });
    }
    
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT'
        }
      });
    }
    
    res.status(500).json({
      error: {
        message: error.message || 'Failed to generate voiceover',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};
