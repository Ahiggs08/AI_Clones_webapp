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
    
    // Use environment variable for API key
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
    console.log('[Video Status] Kie.ai response:', JSON.stringify(statusResult));
    
    if (statusResult.code === 0 || statusResult.code === 200) {
      const data = statusResult.data || {};
      const state = (data.state || data.status || '').toLowerCase();
      const progress = data.progress || data.percent || 0;
      
      // Completed
      if (['completed', 'success', 'done', 'finished'].includes(state)) {
        let videoUrl = null;
        
        if (data.resultJson) {
          try {
            const resultData = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
            videoUrl = resultData.resultUrls?.[0] || resultData.video_url || resultData.url;
          } catch (e) {}
        }
        
        if (!videoUrl) {
          videoUrl = data.fileUrl || data.videoUrl || data.video_url || data.output || data.result;
          if (typeof videoUrl === 'object') videoUrl = videoUrl.url || videoUrl.video_url;
        }
        
        return res.json({
          success: true,
          data: { status: 'completed', progress: 100, videoUrl }
        });
      }
      
      // Failed
      if (['failed', 'error', 'cancelled'].includes(state)) {
        return res.json({
          success: true,
          data: { status: 'failed', progress: 0, error: data.failMsg || 'Video generation failed' }
        });
      }
      
      // Still processing
      return res.json({
        success: true,
        data: { status: 'processing', progress: Math.max(progress, 10) }
      });
    }
    
    return res.json({ success: true, data: { status: 'processing', progress: 50 } });
    
  } catch (error) {
    console.error('[Video Status] Error:', error.message);
    res.json({ success: true, data: { status: 'processing', progress: 25 } });
  }
}
