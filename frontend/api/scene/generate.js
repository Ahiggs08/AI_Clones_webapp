// Scene Generation API — Kie.ai (nano-banana / nano-banana-edit)

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

  const url = await response.text();
  if (!url || !url.startsWith('http')) {
    throw new Error(`Catbox upload failed: ${url}`);
  }
  return url.trim();
};

// Mock scene generation
const generateMockScene = async (prompt, orientation) => {
  const width = orientation === 'vertical' ? 512 : 768;
  const height = orientation === 'vertical' ? 768 : 512;
  const seed = Date.now();

  return {
    imageUrl: `https://picsum.photos/seed/${seed}/${width}/${height}`,
    prompt,
    orientation,
    generatedAt: new Date().toISOString()
  };
};

// Check task status
const checkKieTaskStatus = async (apiKey, taskId) => {
  const response = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    // Parse body if it's a string
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: { message: 'Invalid JSON body' } });
      }
    }
    if (!body) {
      return res.status(400).json({ error: { message: 'Request body is required' } });
    }

    const { prompt, orientation = 'vertical', useDefaultReference, referenceImages = [] } = body;

    // Use environment variable for API key
    const kieApiKey = process.env.KIE_API_KEY;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        error: { message: 'Prompt is required', code: 'VALIDATION_ERROR' }
      });
    }

    if (!['vertical', 'horizontal'].includes(orientation)) {
      return res.status(400).json({
        error: { message: 'Orientation must be "vertical" or "horizontal"', code: 'VALIDATION_ERROR' }
      });
    }

    let result;

    if (!kieApiKey) {
      console.log('[Scene] No API key configured, using mock mode');
      result = await generateMockScene(prompt, orientation);
    } else {
      console.log('[Scene] Using Kie.ai API');

      const imageSize = orientation === 'vertical' ? '9:16' : '16:9';
      const DEFAULT_REFERENCE_URL = 'https://files.catbox.moe/vc80ln.png';

      // Build image URLs array
      let imageUrls = [];

      // If custom reference images were uploaded (base64), upload each to Catbox
      if (referenceImages && referenceImages.length > 0) {
        console.log(`[Scene] Uploading ${referenceImages.length} custom reference image(s) to Catbox...`);
        for (let i = 0; i < referenceImages.length; i++) {
          const img = referenceImages[i];
          if (img.data && img.contentType) {
            try {
              const buffer = Buffer.from(img.data, 'base64');
              const ext = img.contentType.includes('png') ? 'ref.png' : 'ref.jpg';
              const url = await uploadToCatbox(buffer, img.contentType, `reference-${i}.${ext}`);
              imageUrls.push(url);
              console.log(`[Scene] Reference image ${i + 1} uploaded:`, url);
            } catch (uploadErr) {
              console.error(`[Scene] Failed to upload reference image ${i + 1}:`, uploadErr.message);
            }
          }
        }
      }

      // If no custom images uploaded, use default if requested
      if (imageUrls.length === 0 && (useDefaultReference === 'true' || useDefaultReference === true)) {
        imageUrls = [DEFAULT_REFERENCE_URL];
        console.log('[Scene] Using default reference image');
      }

      try {
        let requestBody;

        if (imageUrls.length > 0) {
          // Use image-to-image model with reference images
          requestBody = {
            model: 'google/nano-banana-edit',
            input: { prompt, image_urls: imageUrls, image_size: imageSize }
          };
          console.log(`[Scene] Using nano-banana-edit with ${imageUrls.length} reference image(s)`);
        } else {
          // Text-to-image (no reference)
          requestBody = {
            model: 'google/nano-banana',
            input: { prompt, size: imageSize }
          };
          console.log('[Scene] Using nano-banana (text-to-image, no reference)');
        }

        const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${kieApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const kieResult = await response.json();

        if ((kieResult.code === 0 || kieResult.code === 200) && kieResult.data?.taskId) {
          let attempts = 0;
          const maxAttempts = 60;

          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
              const statusResult = await checkKieTaskStatus(kieApiKey, kieResult.data.taskId);

              if ((statusResult.code === 0 || statusResult.code === 200) && statusResult.data) {
                const state = statusResult.data.state || statusResult.data.status;

                if (state === 'completed' || state === 'success' || state === 'done') {
                  let imageUrl = null;

                  if (statusResult.data.resultJson) {
                    try {
                      const resultData = JSON.parse(statusResult.data.resultJson);
                      imageUrl = resultData.resultUrls?.[0] || resultData.url || resultData.image_url;
                    } catch (e) {}
                  }

                  if (!imageUrl) {
                    const output = statusResult.data.output || statusResult.data.result || statusResult.data.fileUrl || statusResult.data.imageUrl;
                    if (typeof output === 'string') imageUrl = output;
                    else if (output?.image_url) imageUrl = output.image_url;
                    else if (output?.url) imageUrl = output.url;
                  }

                  if (imageUrl) {
                    result = { imageUrl, prompt, orientation, generatedAt: new Date().toISOString() };
                    break;
                  }
                } else if (state === 'failed' || state === 'error') {
                  throw new Error('Image generation failed');
                }
              }
            } catch (pollError) {
              console.error('[Scene] Poll error:', pollError.message);
            }
            attempts++;
          }

          if (!result) throw new Error('Image generation timed out');
        } else {
          throw new Error('Unexpected API response');
        }
      } catch (apiError) {
        console.error('[Scene] Kie.ai API error:', apiError.message);
        result = await generateMockScene(prompt, orientation);
      }
    }

    res.json({
      success: true,
      data: { id: `scene-${Date.now()}`, ...result }
    });

  } catch (error) {
    console.error('[Scene] Generation error:', error.message);
    res.status(500).json({
      error: { message: error.message || 'Failed to generate scene', code: 'INTERNAL_ERROR' }
    });
  }
}
