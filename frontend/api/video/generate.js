// Upload buffer to catbox.moe
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

// Upload image from URL to catbox
const uploadImageToCatbox = async (imageUrl) => {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  
  return uploadToCatbox(imageBuffer, contentType, `image.${ext}`);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    let { sceneImageUrl, audioData, audioContentType } = req.body;
    
    // Use environment variable for API key
    const kieApiKey = process.env.KIE_API_KEY;

    if (!sceneImageUrl) {
      return res.status(400).json({ error: { message: 'Scene image URL is required' } });
    }
    if (!audioData) {
      return res.status(400).json({ error: { message: 'Audio data is required' } });
    }

    if (!kieApiKey) {
      console.log('[Video] No API key configured, using mock mode');
      return res.json({
        success: true,
        data: { jobId: `mock-job-${Date.now()}` }
      });
    }

    // Convert relative image URL to full URL and upload to catbox
    if (sceneImageUrl.startsWith('/')) {
      const host = req.headers.host || req.headers['x-forwarded-host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const fullImageUrl = `${protocol}://${host}${sceneImageUrl}`;
      
      console.log('[Video] Uploading image to catbox...');
      try {
        sceneImageUrl = await uploadImageToCatbox(fullImageUrl);
        console.log('[Video] Image uploaded to:', sceneImageUrl);
      } catch (uploadError) {
        console.error('[Video] Image upload failed:', uploadError.message);
        return res.status(500).json({ error: { message: 'Failed to upload scene image' } });
      }
    }

    // Upload audio to catbox
    console.log('[Video] Uploading audio to catbox...');
    let audioUrl;
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      audioUrl = await uploadToCatbox(audioBuffer, audioContentType || 'audio/mpeg', 'audio.mp3');
      console.log('[Video] Audio uploaded to:', audioUrl);
    } catch (uploadError) {
      console.error('[Video] Audio upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'Failed to upload audio file' } });
    }

    // Start video generation with Kie.ai
    console.log('[Video] Starting video generation with Kie.ai');
    
    const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'infinitalk/from-audio',
        input: {
          image_url: sceneImageUrl,
          audio_url: audioUrl,
          prompt: 'A person speaking naturally'
        }
      })
    });
    
    const kieResult = await response.json();
    console.log('[Video] Kie.ai response:', JSON.stringify(kieResult));
    
    if ((kieResult.code === 0 || kieResult.code === 200) && kieResult.data?.taskId) {
      return res.json({
        success: true,
        data: { jobId: kieResult.data.taskId, audioUrl, imageUrl: sceneImageUrl }
      });
    } else {
      throw new Error(kieResult.msg || 'Failed to start video generation');
    }
    
  } catch (error) {
    console.error('[Video] Generation error:', error.message);
    res.status(500).json({ error: { message: error.message || 'Failed to start video generation' } });
  }
}
