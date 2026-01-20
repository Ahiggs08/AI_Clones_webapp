const axios = require('axios');

// Kie.ai API client
const createKieClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.kie.ai',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });
};

// Mock video generation
const mockJobStatuses = {};

const startMockVideoGeneration = async () => {
  const jobId = `mock-job-${Date.now()}`;
  
  mockJobStatuses[jobId] = {
    status: 'processing',
    progress: 0,
    startedAt: Date.now()
  };
  
  return { jobId };
};

module.exports = async (req, res) => {
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

    // For real API, we need to upload audio to a public URL first
    // Upload audio to catbox.moe
    const FormData = require('form-data');
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    let audioUrl;
    try {
      const formData = new FormData();
      formData.append('reqtype', 'fileupload');
      formData.append('fileToUpload', audioBuffer, {
        filename: 'audio.mp3',
        contentType: audioContentType || 'audio/mpeg'
      });
      
      const uploadResponse = await axios.post('https://catbox.moe/user/api.php', formData, {
        headers: formData.getHeaders(),
        timeout: 60000
      });
      
      if (uploadResponse.data && typeof uploadResponse.data === 'string' && uploadResponse.data.startsWith('http')) {
        audioUrl = uploadResponse.data.trim();
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
    const client = createKieClient(kieApiKey);
    
    const response = await client.post('/api/v1/jobs/createTask', {
      model: 'infinitalk/from-audio',
      input: {
        image_url: sceneImageUrl,
        audio_url: audioUrl,
        prompt: 'A person speaking naturally'
      }
    });
    
    if ((response.data.code === 0 || response.data.code === 200) && response.data.data?.taskId) {
      res.json({
        success: true,
        data: {
          jobId: response.data.data.taskId
        }
      });
    } else {
      throw new Error(response.data.msg || 'Video generation failed');
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
};
