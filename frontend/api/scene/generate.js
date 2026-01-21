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
    const { prompt, orientation = 'vertical', useDefaultReference } = req.body;
    
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
      
      let referenceImageUrl = null;
      if (useDefaultReference === 'true' || useDefaultReference === true) {
        referenceImageUrl = DEFAULT_REFERENCE_URL;
      }
      
      try {
        let requestBody;
        
        if (referenceImageUrl) {
          requestBody = {
            model: 'google/nano-banana-edit',
            input: { prompt, image_urls: [referenceImageUrl], image_size: imageSize }
          };
        } else {
          requestBody = {
            model: 'google/nano-banana',
            input: { prompt, size: imageSize }
          };
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
