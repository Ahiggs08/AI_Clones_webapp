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

// Kie.ai InfiniteTalk / Lip Sync - Video Generation
// Uses the unified Jobs API: POST /api/v1/jobs/createTask
// Tries multiple model names as Kie.ai may use different naming conventions
const generateVideoWithKie = async (apiKey, sceneImageUrl, audioUrl, prompt = 'A person speaking naturally') => {
  const client = createKieClient(apiKey);
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/57a953ad-f297-4299-aa9e-edc4fad06b28',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'apiClients.js:generateVideoWithKie',message:'Starting video generation',data:{apiKeyPrefix:apiKey?.substring(0,12),sceneImageUrl,audioUrl},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // List of lip sync models to try (in order of preference)
  // Correct model name from docs: infinitalk/from-audio
  const modelsToTry = [
    { model: 'infinitalk/from-audio', name: 'InfiniteTalk From Audio' },
    { model: 'infinitalk', name: 'InfiniteTalk' },
    { model: 'klingai/avatar', name: 'Kling AI Avatar' },
  ];
  
  let lastError = null;
  
  for (const { model, name } of modelsToTry) {
    try {
      console.log(`[Kie.ai] Trying video generation with model: ${model}`);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/57a953ad-f297-4299-aa9e-edc4fad06b28',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'apiClients.js:tryModel',message:'Trying model',data:{model,name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const response = await client.post('/api/v1/jobs/createTask', {
        model: model,
        input: {
          image_url: sceneImageUrl,
          audio_url: audioUrl,
          prompt,
          resolution: '480p'
        }
      });
      
      console.log(`[Kie.ai] ${name} response:`, JSON.stringify(response.data).substring(0, 200));
      
      // Check for permission error
      if (response.data.code === 401 || response.data.msg?.includes('access permissions')) {
        console.log(`[Kie.ai] No permission for ${name}, trying next model...`);
        lastError = new Error(`No access permission for ${name}`);
        continue;
      }
  
  return response.data;
    } catch (error) {
      console.log(`[Kie.ai] ${name} error:`, error.response?.data?.msg || error.message);
      
      // Check for permission error in catch block
      if (error.response?.data?.code === 401 || error.response?.data?.msg?.includes('access permissions')) {
        lastError = new Error(`No access permission for ${name}`);
        continue;
      }
      
      lastError = error;
    }
  }
  
  // If all models failed, throw a descriptive error
  throw new Error(
    'Video generation failed: Your Kie.ai API key does not have access to any lip sync/video generation models. ' +
    'Please check your Kie.ai account to enable access to InfiniteTalk or other video models.'
  );
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

