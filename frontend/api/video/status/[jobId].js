// Mock job statuses (note: won't persist across serverless invocations, but that's ok for mock)
const checkMockVideoStatus = (jobId) => {
  // For mock, simulate completion after ~10 seconds based on job ID timestamp
  const timestamp = parseInt(jobId.replace('mock-job-', ''));
  const elapsed = Date.now() - timestamp;
  const progress = Math.min(100, Math.floor((elapsed / 10000) * 100));
  
  if (progress >= 100) {
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

export default async function handler(req, res) {
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

    console.log('[Video Status] Checking job:', jobId);

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
      console.log('[Video Status] Using mock status');
      const status = checkMockVideoStatus(jobId);
      return res.json({
        success: true,
        data: status
      });
    }

    // Real API
    console.log('[Video Status] Calling Kie.ai API');
    
    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const statusResult = await response.json();
    console.log('[Video Status] Kie.ai response:', JSON.stringify(statusResult));
    
    // Handle various response formats
    if (statusResult.code === 0 || statusResult.code === 200) {
      const data = statusResult.data || {};
      
      // Kie.ai uses 'state' for status
      const state = (data.state || data.status || '').toLowerCase();
      const progress = data.progress || data.percent || 0;
      
      console.log('[Video Status] State:', state, 'Progress:', progress);
      
      // Check for completion
      if (state === 'completed' || state === 'success' || state === 'done' || state === 'finished') {
        let videoUrl = null;
        
        // Try to extract video URL from various possible locations
        if (data.resultJson) {
          try {
            const resultData = typeof data.resultJson === 'string' 
              ? JSON.parse(data.resultJson) 
              : data.resultJson;
            
            videoUrl = resultData.resultUrls?.[0] 
              || resultData.video_url 
              || resultData.url 
              || resultData.output;
              
            console.log('[Video Status] Parsed resultJson, videoUrl:', videoUrl);
          } catch (e) {
            console.log('[Video Status] Failed to parse resultJson:', e.message);
          }
        }
        
        // Fallback to other fields
        if (!videoUrl) {
          videoUrl = data.fileUrl 
            || data.videoUrl 
            || data.video_url 
            || data.output 
            || data.result;
            
          if (typeof videoUrl === 'object') {
            videoUrl = videoUrl.url || videoUrl.video_url || null;
          }
        }
        
        console.log('[Video Status] Final videoUrl:', videoUrl);
        
        return res.json({
          success: true,
          data: {
            status: 'completed',
            progress: 100,
            videoUrl
          }
        });
      }
      
      // Check for failure
      if (state === 'failed' || state === 'error' || state === 'cancelled') {
        return res.json({
          success: true,
          data: {
            status: 'failed',
            progress: 0,
            error: data.failMsg || data.error || data.message || 'Video generation failed'
          }
        });
      }
      
      // Still processing
      return res.json({
        success: true,
        data: {
          status: 'processing',
          progress: Math.max(progress, 10) // Show at least 10% to indicate progress
        }
      });
    }
    
    // Unexpected response
    console.log('[Video Status] Unexpected response format');
    return res.json({
      success: true,
      data: {
        status: 'processing',
        progress: 50
      }
    });
    
  } catch (error) {
    console.error('[Video Status] Error:', error.message);
    
    // Don't fail the whole request - return processing status
    // This allows the frontend to keep polling
    res.json({
      success: true,
      data: {
        status: 'processing',
        progress: 25
      }
    });
  }
}
