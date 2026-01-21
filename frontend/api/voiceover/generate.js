export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { script, voiceId } = req.body;
    
    // Use environment variable for API key
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    
    // Validation
    if (!script || script.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Script is required', code: 'VALIDATION_ERROR' }
      });
    }
    
    if (!voiceId) {
      return res.status(400).json({
        error: { message: 'Voice ID is required', code: 'VALIDATION_ERROR' }
      });
    }
    
    if (script.length > 5000) {
      return res.status(400).json({
        error: { message: 'Script exceeds 5000 character limit', code: 'VALIDATION_ERROR' }
      });
    }
    
    if (!elevenLabsApiKey) {
      console.log('[Voiceover] No API key configured, using mock');
      return res.json({
        success: true,
        data: {
          audioUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand3.wav',
          duration: 3.5,
          voiceId,
          characterCount: script.length,
          generatedAt: new Date().toISOString()
        }
      });
    }
    
    console.log('[Voiceover] Generating with ElevenLabs');
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({
          error: { message: 'Invalid ElevenLabs API key', code: 'AUTH_ERROR' }
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          error: { message: 'Rate limit exceeded. Please try again later.', code: 'RATE_LIMIT' }
        });
      }
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    
    res.json({
      success: true,
      data: {
        audioData: base64Audio,
        contentType: response.headers.get('content-type'),
        voiceId,
        characterCount: script.length,
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Voiceover] Generation error:', error.message);
    res.status(500).json({
      error: { message: error.message || 'Failed to generate voiceover', code: 'INTERNAL_ERROR' }
    });
  }
}
