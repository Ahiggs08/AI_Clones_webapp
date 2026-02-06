// HeyGen Video Status Polling API

// Mock status for development
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
    const heygenApiKey = process.env.HEYGEN_API_KEY;

    if (!jobId) {
      return res.status(400).json({ error: { message: 'Job ID is required' } });
    }

    // Mock mode
    if (jobId.startsWith('mock-') || !heygenApiKey) {
      return res.json({ success: true, data: checkMockVideoStatus(jobId) });
    }

    // Real HeyGen API
    console.log('[HeyGen Status] Checking video:', jobId);
    
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${jobId}`, {
      method: 'GET',
      headers: {
        'X-Api-Key': heygenApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    const statusResult = await response.json();
    console.log('[HeyGen Status] Response:', JSON.stringify(statusResult));
    
    if (statusResult.data) {
      const data = statusResult.data;
      const status = (data.status || '').toLowerCase();
      
      // Map HeyGen statuses to our format
      // HeyGen statuses: pending, waiting, processing, completed, failed
      
      if (status === 'completed') {
        return res.json({
          success: true,
          data: {
            status: 'completed',
            progress: 100,
            videoUrl: data.video_url || data.video_url_caption
          }
        });
      }
      
      if (status === 'failed') {
        const errorMsg = data.error?.message || data.error || 'Video generation failed on HeyGen';
        console.log('[HeyGen Status] FAILED:', errorMsg);
        return res.json({
          success: true,
          data: {
            status: 'failed',
            progress: 0,
            error: errorMsg
          }
        });
      }
      
      // Still processing (pending, waiting, processing)
      // Estimate progress based on status
      let progress = 10;
      if (status === 'waiting') progress = 20;
      if (status === 'processing') progress = 50;
      
      return res.json({
        success: true,
        data: {
          status: 'processing',
          progress: progress
        }
      });
    }
    
    // Handle error response
    if (statusResult.error) {
      console.error('[HeyGen Status] API Error:', statusResult.error);
      return res.json({
        success: true,
        data: {
          status: 'failed',
          progress: 0,
          error: statusResult.error.message || 'Unknown error'
        }
      });
    }
    
    // Default: still processing
    return res.json({ success: true, data: { status: 'processing', progress: 25 } });
    
  } catch (error) {
    console.error('[HeyGen Status] Error:', error.message);
    res.json({ success: true, data: { status: 'processing', progress: 25 } });
  }
}
