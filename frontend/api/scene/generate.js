const axios = require('axios');

// Kie.ai API client
const createKieClient = (apiKey) => {
  return axios.create({
    baseURL: 'https://api.kie.ai',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 120000
  });
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
const checkKieTaskStatus = async (client, taskId) => {
  const response = await client.get(`/api/v1/jobs/recordInfo`, {
    params: { taskId }
  });
  return response.data;
};

module.exports = async (req, res) => {
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
    const { prompt, orientation = 'vertical', useDefaultReference } = req.body;
    const kieApiKey = req.headers['x-kie-api-key'] || req.body.kieApiKey;

    // Validation
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        error: {
          message: 'Prompt is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!['vertical', 'horizontal'].includes(orientation)) {
      return res.status(400).json({
        error: {
          message: 'Orientation must be "vertical" or "horizontal"',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    let result;

    if (!kieApiKey) {
      console.log('[Scene] No API key provided, using mock mode');
      result = await generateMockScene(prompt, orientation);
    } else {
      console.log('[Scene] Using Kie.ai API');
      const client = createKieClient(kieApiKey);
      
      const imageSize = orientation === 'vertical' ? '9:16' : '16:9';
      const DEFAULT_REFERENCE_URL = 'https://files.catbox.moe/vc80ln.png';
      
      let referenceImageUrl = null;
      if (useDefaultReference === 'true' || useDefaultReference === true) {
        referenceImageUrl = DEFAULT_REFERENCE_URL;
      }
      
      try {
        let kieResult;
        
        if (referenceImageUrl) {
          // Use image-to-image with reference
          console.log('[Scene] Using NanoBanana Edit with reference');
          const response = await client.post('/api/v1/jobs/createTask', {
            model: 'google/nano-banana-edit',
            input: {
              prompt,
              image_urls: [referenceImageUrl],
              image_size: imageSize
            }
          });
          kieResult = response.data;
        } else {
          // Use text-to-image
          console.log('[Scene] Using NanoBanana text-to-image');
          const response = await client.post('/api/v1/jobs/createTask', {
            model: 'google/nano-banana',
            input: {
              prompt,
              size: imageSize
            }
          });
          kieResult = response.data;
        }
        
        // Poll for result
        if ((kieResult.code === 0 || kieResult.code === 200) && kieResult.data?.taskId) {
          let attempts = 0;
          const maxAttempts = 60;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
              const statusResult = await checkKieTaskStatus(client, kieResult.data.taskId);
              
              if ((statusResult.code === 0 || statusResult.code === 200) && statusResult.data) {
                const state = statusResult.data.state || statusResult.data.status;
                
                if (state === 'completed' || state === 'success' || state === 'done') {
                  let imageUrl = null;
                  
                  if (statusResult.data.resultJson) {
                    try {
                      const resultData = JSON.parse(statusResult.data.resultJson);
                      if (resultData.resultUrls && resultData.resultUrls.length > 0) {
                        imageUrl = resultData.resultUrls[0];
                      } else if (resultData.url) {
                        imageUrl = resultData.url;
                      } else if (resultData.image_url) {
                        imageUrl = resultData.image_url;
                      }
                    } catch (parseError) {
                      console.log('[Scene] Failed to parse resultJson');
                    }
                  }
                  
                  if (!imageUrl) {
                    const output = statusResult.data.output || statusResult.data.result || statusResult.data.fileUrl || statusResult.data.imageUrl;
                    if (typeof output === 'string') {
                      imageUrl = output;
                    } else if (output?.image_url) {
                      imageUrl = output.image_url;
                    } else if (output?.url) {
                      imageUrl = output.url;
                    } else if (Array.isArray(output) && output[0]) {
                      imageUrl = typeof output[0] === 'string' ? output[0] : output[0].url || output[0].image_url;
                    }
                  }
                  
                  if (imageUrl) {
                    result = {
                      imageUrl,
                      prompt,
                      orientation,
                      generatedAt: new Date().toISOString()
                    };
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
          
          if (!result) {
            throw new Error('Image generation timed out');
          }
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
      data: {
        id: `scene-${Date.now()}`,
        ...result
      }
    });
    
  } catch (error) {
    console.error('[Scene] Generation error:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: {
          message: 'Invalid Kie.ai API key',
          code: 'AUTH_ERROR'
        }
      });
    }
    
    res.status(500).json({
      error: {
        message: error.message || 'Failed to generate scene',
        code: 'INTERNAL_ERROR'
      }
    });
  }
};
