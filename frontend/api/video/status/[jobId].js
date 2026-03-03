// Video Status Polling API — Kling Avatar v2 Pro via kie.ai

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
    const kieApiKey = process.env.KIE_API_KEY;

    if (!jobId) {
      return res.status(400).json({ error: { message: 'Job ID is required' } });
    }

    // Mock mode
    if (jobId.startsWith('mock-') || !kieApiKey) {
      return res.json({ success: true, data: checkMockVideoStatus(jobId) });
    }

    // Poll kie.ai for Kling task status
    console.log('[Kling Status] Checking task:', jobId);

    const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    console.log('[Kling Status] Response:', JSON.stringify(result).substring(0, 500));

    // Extract data (handle nested responses)
    const data = result.data?.data || result.data || result;
    const state = (data.state || data.status || '').toLowerCase();

    // Extract video URL from multiple possible locations
    let videoUrl = null;
    if (data.resultJson) {
      try {
        const parsed = JSON.parse(data.resultJson);
        videoUrl = parsed.resultUrls?.[0] || parsed.video_url || parsed.url;
      } catch (e) {
        console.warn('[Kling Status] Failed to parse resultJson:', e.message);
      }
    }
    if (!videoUrl) {
      videoUrl = data.output?.video_url || data.output?.url
              || data.video_url || data.output_url || data.fileUrl || null;
    }

    // Completed
    if (['completed', 'success', 'done'].includes(state)) {
      if (!videoUrl) {
        console.warn('[Kling Status] Completed but no video URL found in:', JSON.stringify(data).substring(0, 300));
      }
      return res.json({
        success: true,
        data: { status: 'completed', progress: 100, videoUrl }
      });
    }

    // Failed
    if (['failed', 'error'].includes(state)) {
      const errorMsg = data.failMsg || data.error?.message || data.error || 'Video generation failed';
      console.log('[Kling Status] FAILED:', errorMsg);
      return res.json({
        success: true,
        data: { status: 'failed', progress: 0, error: errorMsg }
      });
    }

    // Still processing
    return res.json({
      success: true,
      data: { status: 'processing', progress: data.progress || 0 }
    });

  } catch (error) {
    console.error('[Kling Status] Error:', error.message);
    res.json({ success: true, data: { status: 'processing', progress: 25 } });
  }
}
