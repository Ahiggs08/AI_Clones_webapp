// Video Generation API — supports HeyGen and Kling Avatar v2 Pro (via kie.ai)
// Provider is selected via body.provider ('heygen' default, 'kling' for Kling)

// Upload audio to HeyGen's asset storage (returns a public URL)
const uploadAudioToHeyGen = async (audioBuffer, contentType, apiKey) => {
  console.log('[HeyGen] Uploading audio asset, size:', audioBuffer.length, 'bytes, type:', contentType);

  const response = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': contentType
    },
    body: audioBuffer
  });

  const result = await response.json();
  console.log('[HeyGen] Audio asset upload response:', JSON.stringify(result));

  if (result.data?.url) {
    return result.data.url;
  }
  if (result.data?.asset_id) {
    // Construct URL from asset_id if direct URL not provided
    return `https://resource2.heygen.ai/audio/${result.data.asset_id}/original`;
  }
  if (result.error) {
    throw new Error(result.error.message || result.error.code || 'Audio upload failed');
  }
  throw new Error('Failed to upload audio to HeyGen: ' + JSON.stringify(result));
};

// Upload buffer to catbox.moe (fallback for audio hosting)
const uploadToCatbox = async (buffer, contentType, filename) => {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="reqtype"\r\n\r\n`),
    Buffer.from(`fileupload\r\n`),
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: body
  });

  const result = await response.text();
  if (result && result.startsWith('http')) return result.trim();
  throw new Error('Catbox upload failed: ' + result);
};

// Upload image to HeyGen as Talking Photo (raw binary upload)
const uploadTalkingPhoto = async (imageBuffer, contentType, apiKey) => {
  console.log('[HeyGen] Uploading talking photo, size:', imageBuffer.length, 'bytes');

  const uploadResponse = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': contentType
    },
    body: imageBuffer
  });

  const uploadResult = await uploadResponse.json();
  console.log('[HeyGen] Talking photo upload response:', JSON.stringify(uploadResult));

  if (uploadResult.data?.talking_photo_id) {
    return uploadResult.data.talking_photo_id;
  }
  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || uploadResult.error.code || 'Upload failed');
  }

  throw new Error('Failed to upload talking photo: ' + JSON.stringify(uploadResult));
};

// ============ KLING (via kie.ai) ============

const generateWithKling = async (imageBuffer, imageContentType, audioBuffer, audioContentType) => {
  const kieApiKey = process.env.KIE_API_KEY;
  if (!kieApiKey) {
    throw new Error('KIE_API_KEY not configured on server. Add it in Vercel environment variables.');
  }

  // Kie.ai needs publicly accessible URLs for both image and audio
  // Upload both to Catbox (universal public URLs)
  console.log('[Kling] Uploading image to Catbox...');
  const imageExt = imageContentType.includes('png') ? 'scene.png' : 'scene.jpg';
  const imageUrl = await uploadToCatbox(imageBuffer, imageContentType, imageExt);
  console.log('[Kling] Image uploaded:', imageUrl);

  console.log('[Kling] Uploading audio to Catbox...');
  const audioExt = audioContentType.includes('wav') ? 'audio.wav' : 'audio.mp3';
  const audioUrl = await uploadToCatbox(audioBuffer, audioContentType, audioExt);
  console.log('[Kling] Audio uploaded:', audioUrl);

  // Call kie.ai Jobs API with Kling Avatar v2 Pro model
  console.log('[Kling] Creating task with kling/ai-avatar-pro...');
  const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${kieApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'kling/ai-avatar-pro',
      input: {
        image_url: imageUrl,
        audio_url: audioUrl
      }
    })
  });

  const result = await response.json();
  console.log('[Kling] createTask response:', JSON.stringify(result));

  // Validate response
  if (result.code !== 200 && result.code !== 0) {
    throw new Error(result.msg || 'Kling task creation failed (code: ' + result.code + ')');
  }

  const taskId = result.data?.taskId;
  if (!taskId) {
    throw new Error('No taskId returned from kie.ai: ' + JSON.stringify(result));
  }

  return { jobId: taskId, provider: 'kling' };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  let step = 'init';
  try {
    // Parse body if it's a string
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    let { sceneImageUrl, sceneImageData, sceneImageContentType, audioData, audioContentType, provider } = body || {};
    provider = provider || 'heygen';

    console.log(`[Video] Request received - provider: ${provider}, hasImageUrl:`, !!sceneImageUrl, 'hasImageData:', !!sceneImageData, 'hasAudioData:', !!audioData);

    if (!sceneImageUrl && !sceneImageData) {
      return res.status(400).json({ error: { message: 'Scene image URL or data is required' } });
    }
    if (!audioData) {
      return res.status(400).json({ error: { message: 'Audio data is required' } });
    }

    // Prepare buffers (needed by both providers)
    const audioBuffer = Buffer.from(audioData, 'base64');
    const audioMime = audioContentType || 'audio/mpeg';

    // ========== KLING PROVIDER ==========
    if (provider === 'kling') {
      step = 'kling-prepare';
      console.log('[Kling] Using Kling Avatar v2 Pro via kie.ai');

      // Get image buffer
      let imageBuffer;
      let imageMime = sceneImageContentType || 'image/png';
      if (sceneImageData) {
        imageBuffer = Buffer.from(sceneImageData, 'base64');
      } else if (sceneImageUrl) {
        const imgResp = await fetch(sceneImageUrl);
        if (!imgResp.ok) throw new Error(`Failed to fetch image: HTTP ${imgResp.status}`);
        imageBuffer = Buffer.from(await imgResp.arrayBuffer());
        imageMime = imgResp.headers.get('content-type') || imageMime;
      }

      step = 'kling-generate';
      const klingResult = await generateWithKling(imageBuffer, imageMime, audioBuffer, audioMime);
      console.log('[Kling] Task created successfully, jobId:', klingResult.jobId);

      return res.json({
        success: true,
        data: klingResult
      });
    }

    // ========== HEYGEN PROVIDER (default) ==========
    const heygenApiKey = process.env.HEYGEN_API_KEY;

    if (!heygenApiKey) {
      console.log('[Video] No HEYGEN_API_KEY configured, using mock mode');
      return res.json({
        success: true,
        data: { jobId: `mock-job-${Date.now()}`, provider: 'heygen' }
      });
    }

    // Upload audio - try HeyGen asset upload first, fall back to Catbox
    step = 'audio-upload';
    console.log('[HeyGen] Step 1: Uploading audio...');
    let audioUrl;
    console.log('[HeyGen] Audio buffer size:', audioBuffer.length, 'bytes');

    try {
      audioUrl = await uploadAudioToHeyGen(audioBuffer, audioMime, heygenApiKey);
      console.log('[HeyGen] Audio uploaded to HeyGen:', audioUrl);
    } catch (heygenUploadError) {
      console.warn('[HeyGen] HeyGen audio upload failed, trying Catbox fallback:', heygenUploadError.message);
      try {
        audioUrl = await uploadToCatbox(audioBuffer, audioMime, 'audio.mp3');
        console.log('[HeyGen] Audio uploaded to Catbox:', audioUrl);
      } catch (catboxError) {
        console.error('[HeyGen] Both audio upload methods failed');
        console.error('[HeyGen] HeyGen error:', heygenUploadError.message);
        console.error('[HeyGen] Catbox error:', catboxError.message);
        return res.status(500).json({ error: { message: 'Failed to upload audio. Please try again.', step } });
      }
    }

    // Get image buffer - either from base64 data or URL
    step = 'image-prepare';
    let imageBuffer;
    let imageContentType = sceneImageContentType || 'image/png';

    if (sceneImageData) {
      // Prefer base64 data (always available, never expires)
      console.log('[HeyGen] Step 2: Using provided base64 image data');
      imageBuffer = Buffer.from(sceneImageData, 'base64');
      console.log('[HeyGen] Image buffer size:', imageBuffer.length, 'bytes, type:', imageContentType);
    } else if (sceneImageUrl) {
      // Convert relative URLs to absolute URLs
      let absoluteImageUrl = sceneImageUrl;
      if (sceneImageUrl.startsWith('/')) {
        const host = req.headers.host || req.headers['x-forwarded-host'];
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : (host ? `${protocol}://${host}` : 'https://ai-clones-webapp.vercel.app');
        absoluteImageUrl = `${baseUrl}${sceneImageUrl}`;
        console.log('[HeyGen] Converted relative URL to:', absoluteImageUrl);
      }

      // Fetch image server-side (avoids CORS issues)
      console.log('[HeyGen] Step 2: Fetching scene image from URL:', absoluteImageUrl);
      try {
        const imageResponse = await fetch(absoluteImageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/*,*/*'
          }
        });
        if (!imageResponse.ok) {
          console.error('[HeyGen] Image fetch failed with status:', imageResponse.status, 'URL:', absoluteImageUrl);
          throw new Error(`Failed to fetch image: HTTP ${imageResponse.status}`);
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        imageContentType = imageResponse.headers.get('content-type') || 'image/png';
        console.log('[HeyGen] Image fetched, size:', imageBuffer.length, 'bytes, type:', imageContentType);
      } catch (fetchError) {
        console.error('[HeyGen] Image fetch failed:', fetchError.message, 'URL:', absoluteImageUrl);
        const errorMsg = fetchError.message.includes('401')
          ? 'Scene image has expired or is protected. Please select a default scene or generate a new scene.'
          : 'Failed to fetch scene image: ' + fetchError.message;
        return res.status(500).json({ error: { message: errorMsg, step } });
      }
    }

    // Upload image to HeyGen as Talking Photo
    step = 'heygen-upload';
    let talkingPhotoId;
    try {
      console.log('[HeyGen] Step 3: Uploading talking photo...');
      talkingPhotoId = await uploadTalkingPhoto(imageBuffer, imageContentType, heygenApiKey);
      console.log('[HeyGen] Talking photo ID:', talkingPhotoId);
    } catch (uploadError) {
      console.error('[HeyGen] Talking photo upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'HeyGen rejected the image: ' + uploadError.message, step } });
    }

    // Generate video with Talking Photo
    step = 'heygen-generate';
    console.log('[HeyGen] Step 4: Starting video generation...');
    console.log('[HeyGen] Params - talkingPhotoId:', talkingPhotoId, 'audioUrl:', audioUrl);

    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': heygenApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: 'talking_photo',
            talking_photo_id: talkingPhotoId
          },
          voice: {
            type: 'audio',
            audio_url: audioUrl
          }
        }],
        dimension: {
          width: 1080,
          height: 1920
        }
      })
    });

    const heygenResult = await response.json();
    console.log('[HeyGen] Video generation response status:', response.status);
    console.log('[HeyGen] Video generation response:', JSON.stringify(heygenResult));

    if (heygenResult.data?.video_id) {
      return res.json({
        success: true,
        data: {
          jobId: heygenResult.data.video_id,
          provider: 'heygen',
          audioUrl,
          talkingPhotoId
        }
      });
    } else if (heygenResult.error) {
      const errMsg = heygenResult.error.message || heygenResult.error.code || 'HeyGen API error';
      console.error('[HeyGen] API returned error:', errMsg);
      return res.status(500).json({ error: { message: 'HeyGen: ' + errMsg, step } });
    } else {
      console.error('[HeyGen] Unexpected response:', JSON.stringify(heygenResult));
      return res.status(500).json({ error: { message: 'Unexpected HeyGen response: ' + JSON.stringify(heygenResult).substring(0, 200), step } });
    }

  } catch (error) {
    console.error(`[HeyGen] Error at step "${step}":`, error.message, error.stack);
    res.status(500).json({ error: { message: error.message || 'Failed to start video generation', step } });
  }
}
