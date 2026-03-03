// Video Generation API — Kling Avatar v2 Pro via kie.ai

// Upload buffer to catbox.moe (public URL hosting for kie.ai)
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  let step = 'init';
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const { sceneImageUrl, sceneImageData, sceneImageContentType, audioData, audioContentType } = body || {};

    console.log('[Kling] Request received - hasImageUrl:', !!sceneImageUrl, 'hasImageData:', !!sceneImageData, 'hasAudioData:', !!audioData);

    if (!sceneImageUrl && !sceneImageData) {
      return res.status(400).json({ error: { message: 'Scene image URL or data is required' } });
    }
    if (!audioData) {
      return res.status(400).json({ error: { message: 'Audio data is required' } });
    }

    const kieApiKey = process.env.KIE_API_KEY;
    if (!kieApiKey) {
      console.log('[Kling] No KIE_API_KEY configured, using mock mode');
      return res.json({
        success: true,
        data: { jobId: `mock-job-${Date.now()}` }
      });
    }

    // Prepare buffers
    const audioBuffer = Buffer.from(audioData, 'base64');
    const audioMime = audioContentType || 'audio/mpeg';

    let imageBuffer;
    let imageMime = sceneImageContentType || 'image/png';
    if (sceneImageData) {
      imageBuffer = Buffer.from(sceneImageData, 'base64');
    } else if (sceneImageUrl) {
      step = 'image-fetch';
      const imgResp = await fetch(sceneImageUrl);
      if (!imgResp.ok) throw new Error(`Failed to fetch image: HTTP ${imgResp.status}`);
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
      imageMime = imgResp.headers.get('content-type') || imageMime;
    }

    // Upload image to Catbox (kie.ai needs public URLs)
    step = 'image-upload';
    console.log('[Kling] Uploading image to Catbox...');
    const imageExt = imageMime.includes('png') ? 'scene.png' : 'scene.jpg';
    const imageUrl = await uploadToCatbox(imageBuffer, imageMime, imageExt);
    console.log('[Kling] Image uploaded:', imageUrl);

    // Upload audio to Catbox
    step = 'audio-upload';
    console.log('[Kling] Uploading audio to Catbox...');
    const audioExt = audioMime.includes('wav') ? 'audio.wav' : 'audio.mp3';
    const audioUrl = await uploadToCatbox(audioBuffer, audioMime, audioExt);
    console.log('[Kling] Audio uploaded:', audioUrl);

    // Call kie.ai with Kling Avatar v2 Pro
    step = 'kling-generate';
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
          audio_url: audioUrl,
          prompt: 'A person speaking naturally'
        }
      })
    });

    const result = await response.json();
    console.log('[Kling] createTask response:', JSON.stringify(result));

    if (result.code !== 200 && result.code !== 0) {
      throw new Error(result.msg || 'Kling task creation failed (code: ' + result.code + ')');
    }

    const taskId = result.data?.taskId;
    if (!taskId) {
      throw new Error('No taskId returned from kie.ai: ' + JSON.stringify(result));
    }

    console.log('[Kling] Task created successfully, jobId:', taskId);
    return res.json({
      success: true,
      data: { jobId: taskId }
    });

  } catch (error) {
    console.error(`[Kling] Error at step "${step}":`, error.message, error.stack);
    res.status(500).json({ error: { message: error.message || 'Failed to start video generation', step } });
  }
}
