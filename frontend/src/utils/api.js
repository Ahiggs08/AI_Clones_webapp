import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: '/api',
  timeout: 180000, // 180 seconds for long operations (image/video generation can take time)
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for adding API keys
api.interceptors.request.use((config) => {
  // API keys are passed per-request, not stored globally
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorResponse = {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR'
    };
    
    if (error.response) {
      // Server responded with error
      errorResponse.message = error.response.data?.error?.message || error.response.statusText;
      errorResponse.code = error.response.data?.error?.code || `HTTP_${error.response.status}`;
      errorResponse.status = error.response.status;
    } else if (error.request) {
      // Request made but no response
      errorResponse.message = 'Unable to connect to server. Please check your connection.';
      errorResponse.code = 'NETWORK_ERROR';
    } else {
      errorResponse.message = error.message;
    }
    
    return Promise.reject(errorResponse);
  }
);

// ============ HEALTH CHECK ============

export const checkHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

// ============ SCENE GENERATION ============

/**
 * Generate a new scene image
 * @param {Object} params
 * @param {File} params.referenceImage - Reference image file
 * @param {string} params.prompt - Generation prompt
 * @param {string} params.orientation - 'vertical' or 'horizontal'
 * @param {string} params.kieApiKey - Kie.ai API key (optional in mock mode)
 */
export const generateScene = async ({ referenceImage, prompt, orientation, kieApiKey }) => {
  const formData = new FormData();
  
  if (referenceImage) {
    formData.append('referenceImage', referenceImage);
  }
  formData.append('prompt', prompt);
  formData.append('orientation', orientation);
  
  const response = await api.post('/scene/generate', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(kieApiKey && { 'x-kie-api-key': kieApiKey })
    }
  });
  
  return response.data.data;
};

// ============ VOICEOVER ============

/**
 * Fetch available voices
 * @param {string} elevenLabsApiKey - ElevenLabs API key (optional in mock mode)
 */
export const fetchVoices = async (elevenLabsApiKey) => {
  const response = await api.get('/voiceover/voices', {
    headers: {
      ...(elevenLabsApiKey && { 'x-elevenlabs-api-key': elevenLabsApiKey })
    }
  });
  
  return response.data.data.voices;
};

/**
 * Generate voiceover from script
 * @param {Object} params
 * @param {string} params.script - The script text
 * @param {string} params.voiceId - Voice ID to use
 * @param {string} params.elevenLabsApiKey - ElevenLabs API key (optional in mock mode)
 */
export const generateVoiceover = async ({ script, voiceId, elevenLabsApiKey }) => {
  const response = await api.post('/voiceover/generate', 
    { script, voiceId },
    {
      headers: {
        ...(elevenLabsApiKey && { 'x-elevenlabs-api-key': elevenLabsApiKey })
      }
    }
  );
  
  return response.data.data;
};

// ============ VIDEO GENERATION ============

/**
 * Start video generation
 * @param {Object} params
 * @param {string} params.sceneImageUrl - URL of the scene image
 * @param {string} params.audioData - Base64 encoded audio data
 * @param {string} params.audioContentType - MIME type of the audio
 * @param {string} params.kieApiKey - Kie.ai API key (optional in mock mode)
 */
export const generateVideo = async ({ sceneImageUrl, audioData, audioContentType, kieApiKey }) => {
  const response = await api.post('/video/generate',
    { sceneImageUrl, audioData, audioContentType },
    {
      headers: {
        ...(kieApiKey && { 'x-kie-api-key': kieApiKey })
      }
    }
  );
  
  return response.data.data;
};

/**
 * Check video generation status
 * @param {string} jobId - The job ID to check
 * @param {string} kieApiKey - Kie.ai API key (optional)
 */
export const checkVideoStatus = async (jobId, kieApiKey) => {
  const response = await api.get(`/video/status/${jobId}`, {
    headers: {
      ...(kieApiKey && { 'x-kie-api-key': kieApiKey })
    }
  });
  
  return response.data.data;
};

/**
 * Poll for video completion
 * @param {string} jobId - The job ID to poll
 * @param {string} kieApiKey - Kie.ai API key
 * @param {Function} onProgress - Progress callback (progress: number)
 * @param {number} interval - Polling interval in ms (default: 2000)
 * @param {number} timeout - Max time to wait in ms (default: 300000 = 5 min)
 */
export const pollVideoStatus = async (jobId, kieApiKey, onProgress, interval = 2000, timeout = 300000) => {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await checkVideoStatus(jobId, kieApiKey);
        
        if (onProgress && status.progress !== undefined) {
          onProgress(status.progress);
        }
        
        if (status.status === 'completed') {
          resolve(status);
          return;
        }
        
        if (status.status === 'failed') {
          reject(new Error('Video generation failed'));
          return;
        }
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          reject(new Error('Video generation timed out'));
          return;
        }
        
        // Continue polling
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
};

export default api;

