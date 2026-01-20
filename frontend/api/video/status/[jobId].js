const axios = require('axios');

// Kie.ai API client
const createKieClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.kie.ai',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
};

// Mock job statuses (shared state won't work in serverless, but good for structure)
const mockJobStatuses = {};

const checkMockVideoStatus = (jobId) => {
  // Simulate progress
  if (!mockJobStatuses[jobId]) {
    mockJobStatuses[jobId] = {
      status: 'processing',
      progress: 0,
      startedAt: Date.now()
    };
  }
  
  const elapsed = Date.now() - mockJobStatuses[jobId].startedAt;
  const progress = Math.min(95, Math.floor((elapsed / 10000) * 100));
  
  if (progress >= 95) {
    return {
      status: 'completed',
      progress: 100,
      videoUrl: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    };
  }
  
  return {
    status: 'processing',
    progress
  };
};

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kie-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  try {
    const { jobId } = req.query;
    const kieApiKey = req.headers['x-kie-api-key'];

    if (!jobId) {
      return res.status(400).json({
        error: {
          message: 'Job ID is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Mock mode
    if (jobId.startsWith('mock-') || !kieApiKey) {
      console.log('[Video] Using mock status for job:', jobId);
      const status = checkMockVideoStatus(jobId);
      return res.json({
        success: true,
        data: status
      });
    }

    // Real API
    console.log('[Video] Checking status for job:', jobId);
    const client = createKieClient(kieApiKey);
    
    const response = await client.get('/api/v1/jobs/recordInfo', {
      params: { taskId: jobId }
    });
    
    const statusResult = response.data;
    
    if ((statusResult.code === 0 || statusResult.code === 200) && statusResult.data) {
      const state = statusResult.data.state || statusResult.data.status;
      
      let result = {
        status: 'processing',
        progress: statusResult.data.progress || 50
      };
      
      if (state === 'completed' || state === 'success' || state === 'done') {
        let videoUrl = null;
        
        if (statusResult.data.resultJson) {
          try {
            const resultData = JSON.parse(statusResult.data.resultJson);
            if (resultData.resultUrls && resultData.resultUrls.length > 0) {
              videoUrl = resultData.resultUrls[0];
            } else if (resultData.url) {
              videoUrl = resultData.url;
            } else if (resultData.video_url) {
              videoUrl = resultData.video_url;
            }
          } catch (parseError) {
            console.log('[Video] Failed to parse resultJson');
          }
        }
        
        if (!videoUrl) {
          const output = statusResult.data.output || statusResult.data.result || statusResult.data.fileUrl || statusResult.data.videoUrl;
          if (typeof output === 'string') {
            videoUrl = output;
          } else if (output?.video_url) {
            videoUrl = output.video_url;
          } else if (output?.url) {
            videoUrl = output.url;
          }
        }
        
        result = {
          status: 'completed',
          progress: 100,
          videoUrl
        };
      } else if (state === 'failed' || state === 'error') {
        result = {
          status: 'failed',
          progress: 0,
          error: statusResult.data.failMsg || 'Video generation failed'
        };
      }
      
      return res.json({
        success: true,
        data: result
      });
    }
    
    res.json({
      success: true,
      data: {
        status: 'processing',
        progress: 50
      }
    });
    
  } catch (error) {
    console.error('[Video] Status check error:', error.message);
    
    res.status(500).json({
      error: {
        message: error.message || 'Failed to check video status',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};
