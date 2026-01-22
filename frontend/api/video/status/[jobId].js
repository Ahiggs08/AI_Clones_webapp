// Mock status based on job timestamp
const checkMockVideoStatus = (jobId) => {
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
  
  return { status: 'processing', progress };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const { jobId } = req.query;
    const kieApiKey = process.env.KIE_API_KEY;

    if (!jobId) {
      return res.status(400).json({ error: { message: 'Job ID is required' } });
    }

    // Mock mode
    if (jobId.startsWith('mock-') || !kieApiKey) {
      return res.json({ success: true, data: checkMockVideoStatus(jobId) });
    }

    // Real API
    console.log('[Video Status] Checking job:', jobId);
    
    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const statusResult = await response.json();
    
    // Log the FULL response to see what we're getting
    console.log('[Video Status] FULL Kie.ai response:', JSON.stringify(statusResult, null, 2));
    
    if (statusResult.code === 0 || statusResult.code === 200) {
      const data = statusResult.data || {};
      
      // Log all the fields we're looking at
      console.log('[Video Status] data.state:', data.state);
      console.log('[Video Status] data.status:', data.status);
      console.log('[Video Status] data.progress:', data.progress);
      console.log('[Video Status] data.resultJson:', data.resultJson);
      console.log('[Video Status] data.fileUrl:', data.fileUrl);
      console.log('[Video Status] data.output:', data.output);
      
      // Try multiple ways to detect state
      const state = (data.state || data.status || data.jobStatus || '').toString().toLowerCase();
      const progress = data.progress || data.percent || data.percentage || 0;
      
      console.log('[Video Status] Detected state:', state, 'progress:', progress);
      
      // Check for video URL in various places - even if state isn't "completed"
      let videoUrl = null;
      
      // Check resultJson first
      if (data.resultJson) {
        try {
          const resultData = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
          console.log('[Video Status] Parsed resultJson:', JSON.stringify(resultData));
          videoUrl = resultData.resultUrls?.[0] || resultData.video_url || resultData.videoUrl || resultData.url || resultData.output;
        } catch (e) {
          console.log('[Video Status] Failed to parse resultJson:', e.message);
        }
      }
      
      // Check other common fields
      if (!videoUrl) {
        videoUrl = data.fileUrl || data.videoUrl || data.video_url || data.outputUrl || data.output_url;
        
        // Check if output is a URL string
        if (!videoUrl && data.output && typeof data.output === 'string' && data.output.startsWith('http')) {
          videoUrl = data.output;
        }
        
        // Check result field
        if (!videoUrl && data.result) {
          if (typeof data.result === 'string' && data.result.startsWith('http')) {
            videoUrl = data.result;
          } else if (data.result.url) {
            videoUrl = data.result.url;
          } else if (data.result.video_url) {
            videoUrl = data.result.video_url;
          }
        }
      }
      
      console.log('[Video Status] Extracted videoUrl:', videoUrl);
      
      // If we have a video URL, it's completed
      if (videoUrl) {
        console.log('[Video Status] Found video URL, returning completed');
        return res.json({
          success: true,
          data: { status: 'completed', progress: 100, videoUrl }
        });
      }
      
      // Check for explicit completion states
      if (['completed', 'success', 'done', 'finished', 'complete'].includes(state)) {
        console.log('[Video Status] State indicates completed but no video URL found');
        // Return completed anyway - the video URL might come from somewhere else
        return res.json({
          success: true,
          data: { status: 'completed', progress: 100, videoUrl: null }
        });
      }
      
      // Check for failure states
      if (['failed', 'error', 'cancelled', 'failure'].includes(state)) {
        return res.json({
          success: true,
          data: { status: 'failed', progress: 0, error: data.failMsg || data.errorMsg || data.message || 'Video generation failed' }
        });
      }
      
      // Still processing
      return res.json({
        success: true,
        data: { status: 'processing', progress: Math.max(progress, 10) }
      });
    }
    
    // Unexpected response format
    console.log('[Video Status] Unexpected response code:', statusResult.code);
    return res.json({ success: true, data: { status: 'processing', progress: 50 } });
    
  } catch (error) {
    console.error('[Video Status] Error:', error.message);
    res.json({ success: true, data: { status: 'processing', progress: 25 } });
  }
}
