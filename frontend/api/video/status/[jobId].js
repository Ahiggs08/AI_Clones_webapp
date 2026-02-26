// Video Status Polling API — supports HeyGen and Kling (via kie.ai)
// Provider is selected via query param: ?provider=kling or ?provider=heygen (default)

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

// ============ KLING STATUS (via kie.ai) ============

const checkKlingStatus = async (jobId) => {
  const kieApiKey = process.env.KIE_API_KEY;
  if (!kieApiKey) {
    throw new Error('KIE_API_KEY not configured');
  }

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

  // Map status
  if (['completed', 'success', 'done'].includes(state)) {
    if (!videoUrl) {
      console.warn('[Kling Status] Completed but no video URL found in:', JSON.stringify(data).substring(0, 300));
    }
    return {
      status: 'completed',
      progress: 100,
      videoUrl
    };
  }

  if (['failed', 'error'].includes(state)) {
    const errorMsg = data.failMsg || data.error?.message || data.error || 'Kling video generation failed';
    console.log('[Kling Status] FAILED:', errorMsg);
    return {
      status: 'failed',
      progress: 0,
      error: errorMsg
    };
  }

  // Still processing
  return {
    status: 'processing',
    progress: data.progress || 0
  };
};

// ============ HEYGEN STATUS ============

const checkHeyGenStatus = async (jobId) => {
  const heygenApiKey = process.env.HEYGEN_API_KEY;

  // Mock mode
  if (jobId.startsWith('mock-') || !heygenApiKey) {
    return checkMockVideoStatus(jobId);
  }

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

    if (status === 'completed') {
      return {
        status: 'completed',
        progress: 100,
        videoUrl: data.video_url || data.video_url_caption
      };
    }

    if (status === 'failed') {
      const errorMsg = data.error?.message || data.error || 'Video generation failed on HeyGen';
      console.log('[HeyGen Status] FAILED:', errorMsg);
      return {
        status: 'failed',
        progress: 0,
        error: errorMsg
      };
    }

    // Still processing (pending, waiting, processing)
    let progress = 10;
    if (status === 'waiting') progress = 20;
    if (status === 'processing') progress = 50;

    return { status: 'processing', progress };
  }

  // Handle error response
  if (statusResult.error) {
    console.error('[HeyGen Status] API Error:', statusResult.error);
    return {
      status: 'failed',
      progress: 0,
      error: statusResult.error.message || 'Unknown error'
    };
  }

  // Default: still processing
  return { status: 'processing', progress: 25 };
};

// ============ HANDLER ============

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const { jobId, provider } = req.query;
    const selectedProvider = provider || 'heygen';

    if (!jobId) {
      return res.status(400).json({ error: { message: 'Job ID is required' } });
    }

    let statusData;
    if (selectedProvider === 'kling') {
      statusData = await checkKlingStatus(jobId);
    } else {
      statusData = await checkHeyGenStatus(jobId);
    }

    return res.json({ success: true, data: statusData });

  } catch (error) {
    console.error('[Video Status] Error:', error.message);
    res.json({ success: true, data: { status: 'processing', progress: 25 } });
  }
}
