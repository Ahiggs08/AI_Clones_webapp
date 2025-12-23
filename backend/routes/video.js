const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const { startMockVideoGeneration, checkMockVideoStatus } = require('../utils/mockData');
const { generateVideoWithKie, checkKieVideoStatus } = require('../utils/apiClients');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for audio
  }
});

// Store job info for mapping mock jobs to real jobs
const jobRegistry = new Map();

// Function to upload audio to Catbox.moe (same as image upload)
const uploadAudioToCatbox = async (audioBuffer, filename, contentType = 'audio/mpeg') => {
  try {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', audioBuffer, {
      filename: filename,
      contentType: contentType,
    });

    console.log('[Catbox] Uploading audio to Catbox.moe...');
    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'AI-Clones-WebApp/1.0'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (response.status === 200 && response.data.startsWith('https://')) {
      console.log('[Catbox] Audio upload successful:', response.data);
      return response.data;
    } else {
      console.error('[Catbox] Audio upload failed:', response.data);
      throw new Error('Catbox.moe audio upload failed: ' + response.data);
    }
  } catch (error) {
    console.error('[Catbox] Error uploading audio:', error.message);
    throw error;
  }
};

/**
 * POST /api/video/generate
 * Start video generation with scene image and audio
 * Accepts audioFile (multipart) OR audioData (base64)
 */
router.post('/generate', upload.single('audioFile'), async (req, res, next) => {
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
    
    // Check for audio - either as file upload or base64 data
    const hasAudioFile = !!req.file;
    const hasAudioData = !!audioData;
    
    if (!hasAudioFile && !hasAudioData) {
      return res.status(400).json({
        error: {
          message: 'Audio is required (either as file upload or base64 data)',
          code: 'VALIDATION_ERROR'
        }
      });
    }
    
    let result;
    
    // Use real API if key is provided, otherwise fall back to mock
    if (!kieApiKey) {
      // Use mock video generation when no API key
      console.log('[Video] No API key provided, using mock generation');
      result = await startMockVideoGeneration(sceneImageUrl, 'mock-audio-url');
      
      jobRegistry.set(result.jobId, {
        type: 'mock',
        startedAt: new Date().toISOString()
      });
    } else {
      // Use real Kie.ai API - need to upload audio to public URL first
      console.log('[Video] Starting generation with Kie.ai InfiniteTalk');
      
      let audioUrl;
      
      // Get audio buffer from either file upload or base64
      let audioBuffer;
      let audioFilename = `audio-${uuidv4()}.mp3`;
      let contentType = 'audio/mpeg';
      
      if (hasAudioFile) {
        audioBuffer = req.file.buffer;
        contentType = req.file.mimetype || 'audio/mpeg';
        audioFilename = `audio-${uuidv4()}.${req.file.originalname?.split('.').pop() || 'mp3'}`;
      } else {
        // Convert base64 to buffer
        audioBuffer = Buffer.from(audioData, 'base64');
        contentType = audioContentType || 'audio/mpeg';
      }
      
      // Upload audio to Catbox.moe to get public URL
      try {
        audioUrl = await uploadAudioToCatbox(audioBuffer, audioFilename, contentType);
        console.log('[Video] Audio uploaded to:', audioUrl);
      } catch (uploadError) {
        console.error('[Video] Failed to upload audio:', uploadError.message);
        return res.status(500).json({
          error: {
            message: 'Failed to upload audio for processing',
            code: 'UPLOAD_ERROR'
          }
        });
      }
      
      const kieResult = await generateVideoWithKie(kieApiKey, sceneImageUrl, audioUrl);
      
      // Jobs API returns: { code: 200, data: { taskId: "..." } }
      const taskId = kieResult.data?.taskId || kieResult.job_id || kieResult.id;
      
      if (!taskId) {
        throw new Error('Failed to start video generation: No task ID returned');
      }
      
      result = {
        jobId: taskId
      };
      
      jobRegistry.set(result.jobId, {
        type: 'kie',
        apiKey: kieApiKey,
        startedAt: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: {
        jobId: result.jobId,
        status: 'processing',
        message: 'Video generation started'
      }
    });
    
  } catch (error) {
    console.error('[Video] Generation error:', error.message);
    
    // Check for file type error from Kie.ai
    if (error.response?.data?.msg?.includes('file type not supported')) {
      return res.status(400).json({
        error: {
          message: 'Audio file type not supported. Please use MP3 or WAV format.',
          code: 'UNSUPPORTED_FORMAT'
        }
      });
    }
    
    // Check for permission/access errors
    if (error.message?.includes('access permission') || error.message?.includes('does not have access')) {
      return res.status(403).json({
        error: {
          message: error.message,
          code: 'ACCESS_DENIED',
          hint: 'Your Kie.ai API key needs access to lip sync/video models. Check your Kie.ai account settings.'
        }
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: {
          message: 'Invalid Kie.ai API key',
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
    
    next(error);
  }
});

/**
 * GET /api/video/status/:jobId
 * Check video generation status
 */
router.get('/status/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const kieApiKey = req.headers['x-kie-api-key'];
    
    const jobInfo = jobRegistry.get(jobId);
    
    if (!jobInfo) {
      return res.status(404).json({
        error: {
          message: 'Job not found',
          code: 'NOT_FOUND'
        }
      });
    }
    
    let result;
    
    if (jobInfo.type === 'mock') {
      // Check mock job status
      result = checkMockVideoStatus(jobId);
    } else {
      // Check real Kie.ai job status
      const apiKey = kieApiKey || jobInfo.apiKey;
      
      if (!apiKey) {
        return res.status(401).json({
          error: {
            message: 'API key required to check job status',
            code: 'AUTH_ERROR'
          }
        });
      }
      
      const kieResult = await checkKieVideoStatus(apiKey, jobId);
      console.log('[Video] Status check response:', JSON.stringify(kieResult).substring(0, 500));
      
      // Handle Jobs API response
      const data = kieResult.data || kieResult;
      const state = data.state || data.status;
      
      // Parse resultJson if present (InfiniteTalk returns video URL in resultJson)
      let videoUrl = null;
      if (data.resultJson) {
        try {
          const resultData = JSON.parse(data.resultJson);
          videoUrl = resultData.resultUrls?.[0] || resultData.video_url || resultData.url;
        } catch (e) {
          console.log('[Video] Failed to parse resultJson:', e.message);
        }
      }
      
      // Fallback to other possible locations for video URL
      if (!videoUrl) {
        videoUrl = data.output?.video_url || data.output?.url || data.video_url || data.output_url || data.fileUrl || null;
      }
      
      // Map state to status
      let status = 'processing';
      if (state === 'completed' || state === 'success' || state === 'done') {
        status = 'completed';
      } else if (state === 'failed' || state === 'error') {
        status = 'failed';
      }
      
      result = {
        status,
        progress: data.progress || 0,
        videoUrl,
        error: data.failMsg || data.error || null
      };
    }
    
    // Clean up completed jobs after returning result
    if (result.status === 'completed' || result.status === 'failed') {
      setTimeout(() => {
        jobRegistry.delete(jobId);
      }, 5 * 60 * 1000); // Keep for 5 minutes after completion
    }
    
    res.json({
      success: true,
      data: {
        jobId,
        ...result
      }
    });
    
  } catch (error) {
    console.error('[Video] Status check error:', error.message);
    next(error);
  }
});

module.exports = router;
