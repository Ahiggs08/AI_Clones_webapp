// HeyGen Avatar IV Video Generation API
// Replaces Kie.ai with HeyGen for higher quality avatar videos

// Upload buffer to catbox.moe (for audio hosting)
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

// Upload image to HeyGen to get image_key
const uploadImageToHeyGen = async (imageUrl, apiKey) => {
  // First fetch the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  
  const imageBuffer = await imageResponse.arrayBuffer();
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  
  // Upload to HeyGen
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: contentType });
  formData.append('file', blob, 'avatar.png');
  
  const uploadResponse = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey
    },
    body: formData
  });
  
  const uploadResult = await uploadResponse.json();
  console.log('[HeyGen] Upload response:', JSON.stringify(uploadResult));
  
  if (uploadResult.data?.url || uploadResult.data?.asset_id) {
    // Return the asset_id or URL as image_key
    return uploadResult.data.asset_id || uploadResult.data.url;
  }
  
  throw new Error('Failed to upload image to HeyGen: ' + JSON.stringify(uploadResult));
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
    const heygenApiKey = process.env.HEYGEN_API_KEY;

    if (!sceneImageUrl) {
      return res.status(400).json({ error: { message: 'Scene image URL is required' } });
    }
    if (!audioData) {
      return res.status(400).json({ error: { message: 'Audio data is required' } });
    }

    if (!heygenApiKey) {
      console.log('[Video] No API key configured, using mock mode');
      return res.json({
        success: true,
        data: { jobId: `mock-job-${Date.now()}` }
      });
    }

    // Convert relative image URL to full URL
    if (sceneImageUrl.startsWith('/')) {
      const host = req.headers.host || req.headers['x-forwarded-host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      sceneImageUrl = `${protocol}://${host}${sceneImageUrl}`;
    }

    // Upload audio to catbox (HeyGen needs a public URL)
    console.log('[HeyGen] Uploading audio to catbox...');
    let audioUrl;
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      audioUrl = await uploadToCatbox(audioBuffer, audioContentType || 'audio/mpeg', 'audio.mp3');
      console.log('[HeyGen] Audio uploaded to:', audioUrl);
    } catch (uploadError) {
      console.error('[HeyGen] Audio upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'Failed to upload audio file' } });
    }

    // Upload image to HeyGen to get image_key
    console.log('[HeyGen] Uploading image to HeyGen...');
    let imageKey;
    try {
      imageKey = await uploadImageToHeyGen(sceneImageUrl, heygenApiKey);
      console.log('[HeyGen] Image key:', imageKey);
    } catch (uploadError) {
      console.error('[HeyGen] Image upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'Failed to upload image to HeyGen: ' + uploadError.message } });
    }

    // Generate Avatar IV video
    console.log('[HeyGen] Starting Avatar IV video generation...');
    
    const response = await fetch('https://api.heygen.com/v2/video/av4/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': heygenApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_key: imageKey,
        audio_url: audioUrl,
        video_title: `AI Clone Video - ${Date.now()}`,
        dimension: {
          width: 1080,
          height: 1920
        }
      })
    });
    
    const heygenResult = await response.json();
    console.log('[HeyGen] Response:', JSON.stringify(heygenResult));
    
    if (heygenResult.data?.video_id) {
      return res.json({
        success: true,
        data: { 
          jobId: heygenResult.data.video_id, 
          audioUrl, 
          imageKey 
        }
      });
    } else if (heygenResult.error) {
      throw new Error(heygenResult.error.message || heygenResult.error.code || 'HeyGen API error');
    } else {
      throw new Error('Failed to start video generation: ' + JSON.stringify(heygenResult));
    }
    
  } catch (error) {
    console.error('[HeyGen] Generation error:', error.message);
    res.status(500).json({ error: { message: error.message || 'Failed to start video generation' } });
  }
}
