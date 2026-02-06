// HeyGen Talking Photo Video Generation API
// Uses HeyGen's Talking Photo feature for high-quality avatar videos

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    let { sceneImageData, sceneImageContentType, audioData, audioContentType } = req.body;
    
    // Use environment variable for API key
    const heygenApiKey = process.env.HEYGEN_API_KEY;

    if (!sceneImageData) {
      return res.status(400).json({ error: { message: 'Scene image data is required' } });
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

    // Upload audio to catbox (HeyGen needs a public URL)
    console.log('[HeyGen] Uploading audio to catbox...');
    let audioUrl;
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      audioUrl = await uploadToCatbox(audioBuffer, audioContentType || 'audio/mpeg', 'audio.mp3');
      console.log('[HeyGen] Audio uploaded to:', audioUrl);
    } catch (uploadError) {
      console.error('[HeyGen] Audio upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'Failed to upload audio file: ' + uploadError.message } });
    }

    // Convert base64 image to buffer and upload as Talking Photo
    console.log('[HeyGen] Preparing image for upload...');
    const imageBuffer = Buffer.from(sceneImageData, 'base64');
    const imageContentType = sceneImageContentType || 'image/png';

    // Upload image to HeyGen as Talking Photo
    let talkingPhotoId;
    try {
      console.log('[HeyGen] Uploading talking photo...');
      talkingPhotoId = await uploadTalkingPhoto(imageBuffer, imageContentType, heygenApiKey);
      console.log('[HeyGen] Talking photo ID:', talkingPhotoId);
    } catch (uploadError) {
      console.error('[HeyGen] Talking photo upload failed:', uploadError.message);
      return res.status(500).json({ error: { message: 'Failed to upload image to HeyGen: ' + uploadError.message } });
    }

    // Generate video with Talking Photo
    console.log('[HeyGen] Starting video generation...');
    
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
    console.log('[HeyGen] Video generation response:', JSON.stringify(heygenResult));
    
    if (heygenResult.data?.video_id) {
      return res.json({
        success: true,
        data: { 
          jobId: heygenResult.data.video_id, 
          audioUrl, 
          talkingPhotoId 
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
