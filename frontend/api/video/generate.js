// Mock video generation
const startMockVideoGeneration = async () => {
  const jobId = `mock-job-${Date.now()}`;
  return { jobId };
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kie-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  try {
    const { sceneImageUrl, audioData, audioContentType } = req.body;
    const kieApiKey = req.headers['x-kie-api-key'] || req.body.kieApiKey;

    // Validation
    if (!sceneImageUrl) {
      return res.status(400).json({
        error: {
          message: 'Scene image URL is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!audioData) {
      return res.status(400).json({
        error: {
          message: 'Audio data is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!kieApiKey) {
      console.log('[Video] No API key provided, using mock mode');
      const result = await startMockVideoGeneration();
      return res.json({
        success: true,
        data: result
      });
    }

    // Upload audio to catbox.moe for public URL
    console.log('[Video] Uploading audio to catbox.moe...');
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: audioContentType || 'audio/mpeg' });
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', blob, 'audio.mp3');
    
    let audioUrl;
    try {
      const uploadResponse = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData
      });
      
      const uploadResult = await uploadResponse.text();
      
      if (uploadResult && uploadResult.startsWith('http')) {
        audioUrl = uploadResult.trim();
        console.log('[Video] Audio uploaded to:', audioUrl);
      } else {
        throw new Error('Failed to upload audio');
      }
    } catch (uploadError) {
      console.error('[Video] Audio upload failed:', uploadError.message);
      return res.status(500).json({
        error: {
          message: 'Failed to upload audio file',
          code: 'UPLOAD_ERROR'
        }
      });
    }

    // Generate video with Kie.ai
    console.log('[Video] Starting video generation with Kie.ai');
    
    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'infinitalk/from-audio',
        input: {
          image_url: sceneImageUrl,
          audio_url: audioUrl,
          prompt: 'A person speaking naturally'
        }
      })
    });
    
    const kieResult = await response.json();
    
    if ((kieResult.code === 0 || kieResult.code === 200) && kieResult.data?.taskId) {
      res.json({
        success: true,
        data: {
          jobId: kieResult.data.taskId
        }
      });
    } else {
      throw new Error(kieResult.msg || 'Video generation failed');
    }
    
  } catch (error) {
    console.error('[Video] Generation error:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: {
          message: 'Invalid Kie.ai API key',
          code: 'AUTH_ERROR'
        }
      });
    }
    
    res.status(500).json({
      error: {
        message: error.message || 'Failed to start video generation',
        code: 'INTERNAL_ERROR'
      }
    });
  }
}
