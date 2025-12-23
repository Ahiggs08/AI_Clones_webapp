const axios = require('axios');
const FormData = require('form-data');

// Kie.ai API client configuration
// NOTE: Kie.ai uses a unified Jobs API for all models
// - POST /api/v1/jobs/createTask - to create tasks
// - GET /api/v1/jobs/recordInfo?taskId={taskId} - to check status
const createKieClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.kie.ai',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000 // 120 seconds for long operations like video generation
  });
};

// ElevenLabs API client configuration
const createElevenLabsClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.elevenlabs.io/v1',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
};

// Kie.ai NanoBanana - Image Generation (Text-to-Image)
// Uses the unified Jobs API: POST /api/v1/jobs/createTask
const generateSceneWithKie = async (apiKey, referenceImageUrl, prompt, orientation) => {
  const client = createKieClient(apiKey);
  
  // Determine image size based on orientation
  const imageSize = orientation === 'vertical' ? '9:16' : '16:9';
  
  // If reference image URL is provided, use nano-banana-edit (image-to-image)
  if (referenceImageUrl) {
    console.log('[Kie.ai] Using NanoBanana Edit (image-to-image) with reference:', referenceImageUrl);
    try {
      const response = await client.post('/api/v1/jobs/createTask', {
        model: 'google/nano-banana-edit',
        input: {
          prompt,
          image_urls: [referenceImageUrl],
          image_size: imageSize
        }
      });
      console.log('[Kie.ai] NanoBanana Edit response status:', response.status);
      return response.data;
    } catch (editError) {
      console.log('[Kie.ai] NanoBanana Edit error:', editError.response?.data?.msg || editError.message);
      // Fall back to text-to-image if edit fails
      console.log('[Kie.ai] Falling back to text-to-image...');
    }
  }
  
  // Use nano-banana for text-to-image (no reference or fallback)
  console.log('[Kie.ai] Using NanoBanana (text-to-image)...');
  try {
    const response = await client.post('/api/v1/jobs/createTask', {
      model: 'google/nano-banana',
      input: {
        prompt,
        size: imageSize
      }
    });
    console.log('[Kie.ai] NanoBanana response status:', response.status);
    return response.data;
  } catch (jobsError) {
    console.log('[Kie.ai] NanoBanana error:', jobsError.response?.data?.msg || jobsError.message);
    throw jobsError;
  }
};

// Kie.ai InfiniteTalk - Video Generation (Lip Sync)
// Uses the unified Jobs API: POST /api/v1/jobs/createTask
// Model: infinitalk/from-audio
const generateVideoWithKie = async (apiKey, sceneImageUrl, audioUrl, prompt = 'A person speaking naturally') => {
  const client = createKieClient(apiKey);
  
  // Ensure prompt is never empty (API requires it)
  const videoPrompt = prompt && prompt.trim() ? prompt : 'A person speaking naturally';
  
  console.log('[Kie.ai] Starting video generation with infinitalk/from-audio');
  console.log('[Kie.ai] Image URL:', sceneImageUrl);
  console.log('[Kie.ai] Audio URL:', audioUrl);
  console.log('[Kie.ai] Prompt:', videoPrompt);
  
  try {
    const response = await client.post('/api/v1/jobs/createTask', {
      model: 'infinitalk/from-audio',
      input: {
        image_url: sceneImageUrl,
        audio_url: audioUrl,
        prompt: videoPrompt
      }
    });
    
    console.log('[Kie.ai] InfiniteTalk response:', JSON.stringify(response.data));
    
    // Check for errors in response
    if (response.data.code !== 200 && response.data.code !== 0) {
      throw new Error(response.data.msg || 'Video generation failed');
    }
    
    return response.data;
  } catch (error) {
    console.error('[Kie.ai] InfiniteTalk error:', error.response?.data || error.message);
    throw error;
  }
};

// Kie.ai - Check task status (works for both image and video generation)
// Uses: GET /api/v1/jobs/recordInfo?taskId={taskId}
const checkKieVideoStatus = async (apiKey, taskId) => {
  const client = createKieClient(apiKey);
  
  const response = await client.get(`/api/v1/jobs/recordInfo`, {
    params: { taskId }
  });
  
  return response.data;
};

// ElevenLabs - List voices
const listElevenLabsVoices = async (apiKey) => {
  const client = createElevenLabsClient(apiKey);
  
  const response = await client.get('/voices');
  
  return response.data.voices.map(voice => ({
    voice_id: voice.voice_id,
    name: voice.name,
    preview_url: voice.preview_url,
    labels: voice.labels || {}
  }));
};

// ElevenLabs - Generate speech
const generateSpeechWithElevenLabs = async (apiKey, voiceId, text, options = {}) => {
  const client = createElevenLabsClient(apiKey);
  
  const response = await client.post(
    `/text-to-speech/${voiceId}`,
    {
      text,
      model_id: options.modelId || 'eleven_monolingual_v1',
      voice_settings: {
        stability: options.stability || 0.5,
        similarity_boost: options.similarityBoost || 0.75
      }
    },
    {
      responseType: 'arraybuffer'
    }
  );
  
  return {
    audioBuffer: response.data,
    contentType: response.headers['content-type']
  };
};

module.exports = {
  createKieClient,
  createElevenLabsClient,
  generateSceneWithKie,
  generateVideoWithKie,
  checkKieVideoStatus,
  listElevenLabsVoices,
  generateSpeechWithElevenLabs
};
