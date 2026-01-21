// Mock video generation
const startMockVideoGeneration = async () => {
  const jobId = `mock-job-${Date.now()}`;
  return { jobId };
};

// Upload audio buffer to catbox.moe using raw fetch
const uploadToCatbox = async (base64Audio, contentType) => {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const audioBuffer = Buffer.from(base64Audio, 'base64');
  
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="reqtype"\r\n\r\n`),
    Buffer.from(`fileupload\r\n`),
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="fileToUpload"; filename="audio.mp3"\r\n`),
    Buffer.from(`Content-Type: ${contentType || 'audio/mpeg'}\r\n\r\n`),
    audioBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  
  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: body
  });
  
  const result = await response.text();
  
  if (result && result.startsWith('http')) {
    return result.trim();
  }
  
  throw new Error('Catbox upload failed: ' + result);
};

// Upload image from URL to catbox.moe (for images that need public URLs)
const uploadImageToCatbox = async (imageUrl) => {
  // Fetch the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get('content-type') || 'image/png';
  
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="reqtype"\r\n\r\n`),
    Buffer.from(`fileupload\r\n`),
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="fileToUpload"; filename="image.${ext}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  
  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: body
  });
  
  const result = await response.text();
  
  if (result && result.startsWith('http')) {
    return result.trim();
  }
  
  throw new Error('Catbox image upload failed: ' + result);
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-kie-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' } });
  }

  try {
    let { sceneImageUrl, audioData, audioContentType } = req.body;
    const kieApiKey = req.headers['x-kie-api-key'] || req.body.kieApiKey;

    // Validation
    if (!sceneImageUrl) {
      return res.status(400).json({
        error: {
          message: 'Scene image URL is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!audioData) {
      return res.status(400).json({
        error: {
          message: 'Audio data is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!kieApiKey) {
      console.log('[Video] No API key provided, using mock mode');
      const result = await startMockVideoGeneration();
      return res.json({
        success: true,
        data: result
      });
    }

    // Convert relative image URL to full URL if needed
    if (sceneImageUrl.startsWith('/')) {
      // Get the host from request headers
      const host = req.headers.host || req.headers['x-forwarded-host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${protocol}://${host}`;
      const fullImageUrl = `${baseUrl}${sceneImageUrl}`;
      
      console.log('[Video] Converting relative URL to full URL:', fullImageUrl);
      
      // Upload the image to catbox to get a public URL that Kie.ai can access
      console.log('[Video] Uploading image to catbox.moe for public access...');
      try {
        sceneImageUrl = await uploadImageToCatbox(fullImageUrl);
        console.log('[Video] Image uploaded to:', sceneImageUrl);
      } catch (uploadError) {
        console.error('[Video] Image upload failed:', uploadError.message);
        return res.status(500).json({
          error: {
            message: 'Failed to upload scene image: ' + uploadError.message,
            code: 'UPLOAD_ERROR'
          }
        });
      }
    }

    // Upload audio to catbox.moe for public URL
    console.log('[Video] Uploading audio to catbox.moe...');
    
    let audioUrl;
    try {
      audioUrl = await uploadToCatbox(audioData, audioContentType);
      console.log('[Video] Audio uploaded to:', audioUrl);
    } catch (uploadError) {
      console.error('[Video] Audio upload failed:', uploadError.message);
      return res.status(500).json({
        error: {
          message: 'Failed to upload audio file: ' + uploadError.message,
          code: 'UPLOAD_ERROR'
        }
      });
    }

    // Start video generation with Kie.ai
    console.log('[Video] Starting video generation with Kie.ai');
    console.log('[Video] Image URL:', sceneImageUrl);
    console.log('[Video] Audio URL:', audioUrl);
    
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
        data: {
          jobId: kieResult.data.taskId,
          audioUrl: audioUrl,
          imageUrl: sceneImageUrl
        }
      });
    } else {
      throw new Error(kieResult.msg || 'Failed to start video generation');
    }
    
  } catch (error) {
    console.error('[Video] Generation error:', error.message);
    
    res.status(500).json({
      error: {
        message: error.message || 'Failed to start video generation',
        code: 'INTERNAL_ERROR'
      }
    });
  }
}
