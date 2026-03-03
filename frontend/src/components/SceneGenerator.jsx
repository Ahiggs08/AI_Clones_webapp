import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { generateScene } from '../utils/api';
import { saveScene, saveReferenceImages, getReferenceImages, deleteReferenceImages } from '../utils/db';
import useAppStore from '../stores/useAppStore';
import PROMPT_CATEGORIES, { getPromptById } from '../data/scenePrompts';
import { DEFAULT_REFERENCE_IMAGE } from '../data/defaultScenes';

function SceneGenerator({ onSceneGenerated }) {
  const { apiKeys, isGeneratingScene, setIsGeneratingScene } = useAppStore();

  // Multiple reference images
  const [referenceImages, setReferenceImages] = useState([]); // [{ file, preview, fileName }]
  const [isLoadingReference, setIsLoadingReference] = useState(true);
  const [useDefaultReference, setUseDefaultReference] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [orientation, setOrientation] = useState('vertical');
  const [generatedScene, setGeneratedScene] = useState(null);

  // Handle preset prompt selection
  const handlePromptSelect = (promptId) => {
    setSelectedPromptId(promptId);
    if (promptId) {
      const selectedPrompt = getPromptById(promptId);
      if (selectedPrompt) {
        setPrompt(selectedPrompt.prompt);
      }
    }
  };

  // Load saved reference images on mount
  useEffect(() => {
    const loadSavedReferences = async () => {
      try {
        const saved = await getReferenceImages();
        if (saved && saved.length > 0) {
          const loaded = saved.map(img => ({
            file: new File([img.blob], img.fileName, { type: img.blob.type }),
            preview: URL.createObjectURL(img.blob),
            fileName: img.fileName
          }));
          setReferenceImages(loaded);
          setUseDefaultReference(false);
        } else {
          setUseDefaultReference(true);
        }
      } catch (error) {
        console.error('Failed to load saved reference images:', error);
        setUseDefaultReference(true);
      } finally {
        setIsLoadingReference(false);
      }
    };
    loadSavedReferences();
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const newImages = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      fileName: file.name
    }));

    const updated = [...referenceImages, ...newImages].slice(0, 5); // Max 5 images
    setReferenceImages(updated);
    setUseDefaultReference(false);

    // Save to IndexedDB for persistence
    try {
      const blobs = updated.map(img => ({ blob: img.file, fileName: img.fileName }));
      await saveReferenceImages(blobs);
    } catch (error) {
      console.error('Failed to save reference images:', error);
    }
  }, [referenceImages]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 5,
    maxSize: 10 * 1024 * 1024 // 10MB each
  });

  const removeImage = async (index) => {
    const updated = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(updated);

    if (updated.length === 0) {
      setUseDefaultReference(true);
      await deleteReferenceImages();
    } else {
      const blobs = updated.map(img => ({ blob: img.file, fileName: img.fileName }));
      await saveReferenceImages(blobs);
    }
  };

  // Resize image to max dimension and convert to base64 (keeps payload under Vercel limits)
  const resizeAndConvertToBase64 = (file, maxDim = 1024) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    console.log('[SceneGenerator] Starting generation...');
    setIsGeneratingScene(true);
    setGeneratedScene(null);

    try {
      // Convert reference images to base64 for the API
      let refImagesData = [];
      if (!useDefaultReference && referenceImages.length > 0) {
        console.log(`[SceneGenerator] Resizing & converting ${referenceImages.length} reference image(s)...`);
        for (const img of referenceImages) {
          const data = await resizeAndConvertToBase64(img.file);
          refImagesData.push({
            data,
            contentType: 'image/jpeg' // Always JPEG after resize
          });
        }
      }

      console.log('[SceneGenerator] Calling API with prompt:', prompt.trim().substring(0, 50) + '...');
      console.log('[SceneGenerator] Reference images:', refImagesData.length, 'useDefault:', useDefaultReference);

      const result = await generateScene({
        referenceImages: refImagesData,
        useDefaultReference,
        prompt: prompt.trim(),
        orientation
      });
      console.log('[SceneGenerator] API response received:', result);

      if (!result || !result.imageUrl) {
        throw new Error('Invalid response from server - no image URL received');
      }

      // Fetch the image and convert to base64 for permanent storage
      console.log('[SceneGenerator] Fetching image for permanent storage...');
      let imageData = null;
      let imageContentType = 'image/png';
      try {
        const imageResponse = await fetch(result.imageUrl);
        if (imageResponse.ok) {
          const blob = await imageResponse.blob();
          imageContentType = blob.type || 'image/png';
          imageData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });
          console.log('[SceneGenerator] Image stored as base64, size:', imageData.length);
        }
      } catch (fetchError) {
        console.warn('[SceneGenerator] Could not fetch image for storage:', fetchError);
      }

      const scene = {
        id: result.id || uuidv4(),
        imageUrl: result.imageUrl,
        imageData,
        imageContentType,
        prompt: prompt.trim(),
        orientation,
        timestamp: Date.now(),
        referenceImageNames: referenceImages.map(img => img.fileName)
      };

      // Save to IndexedDB
      await saveScene(scene);
      console.log('[SceneGenerator] Scene saved to IndexedDB with base64 data');
      setGeneratedScene(scene);
      toast.success('Scene generated successfully!');
    } catch (error) {
      console.error('[SceneGenerator] Generation error:', error);
      toast.error(error.message || 'Failed to generate scene');
    } finally {
      console.log('[SceneGenerator] Generation complete');
      setIsGeneratingScene(false);
    }
  };

  const handleUseScene = () => {
    if (generatedScene) {
      onSceneGenerated(generatedScene);
    }
  };

  const handleRegenerate = () => {
    handleGenerate();
  };

  const handleDownload = async () => {
    if (!generatedScene?.imageUrl) return;

    try {
      const response = await fetch(generatedScene.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scene-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download image');
    }
  };

  const clearAllReferences = async () => {
    setReferenceImages([]);
    setUseDefaultReference(true);
    try {
      await deleteReferenceImages();
      toast.success('Switched to default reference image');
    } catch (error) {
      console.error('Failed to delete reference images:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Orientation Toggle */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Video Orientation
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => setOrientation('vertical')}
            className={`flex-1 p-4 rounded-lg border transition-all ${
              orientation === 'vertical'
                ? 'border-electric bg-electric/10 text-electric'
                : 'border-white/10 hover:border-white/20 text-text-secondary'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={`w-8 h-12 rounded border-2 ${
                orientation === 'vertical' ? 'border-electric' : 'border-current'
              }`} />
              <span className="text-sm font-medium">Vertical (9:16)</span>
              <span className="text-xs opacity-60">Stories, Reels, TikTok</span>
            </div>
          </button>
          <button
            onClick={() => setOrientation('horizontal')}
            className={`flex-1 p-4 rounded-lg border transition-all ${
              orientation === 'horizontal'
                ? 'border-electric bg-electric/10 text-electric'
                : 'border-white/10 hover:border-white/20 text-text-secondary'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-8 rounded border-2 ${
                orientation === 'horizontal' ? 'border-electric' : 'border-current'
              }`} />
              <span className="text-sm font-medium">Horizontal (16:9)</span>
              <span className="text-xs opacity-60">YouTube, Presentations</span>
            </div>
          </button>
        </div>
      </div>

      {/* Reference Image Upload — Multi-image */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Reference Images
          {useDefaultReference && <span className="text-mint ml-2">(Using Default)</span>}
          {!useDefaultReference && referenceImages.length > 0 && (
            <span className="text-electric ml-2">({referenceImages.length} Custom)</span>
          )}
        </label>
        <p className="text-xs text-text-muted mb-3">
          Upload photos of the person and/or location to combine them into one scene. Up to 5 images.
        </p>

        {isLoadingReference ? (
          <div className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center">
            <div className="spinner mx-auto mb-3"></div>
            <p className="text-text-muted text-sm">Loading saved references...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Uploaded images grid */}
            {referenceImages.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                {referenceImages.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img.preview}
                      alt={img.fileName}
                      className="w-24 h-24 rounded-lg object-cover border-2 border-electric/30"
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-electric/90 text-void text-[10px] font-medium rounded">
                      {index + 1}
                    </div>
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-coral text-void flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <p className="text-[10px] text-text-muted mt-1 truncate w-24">{img.fileName}</p>
                  </div>
                ))}

                {/* Add more dropzone (inline) */}
                {referenceImages.length < 5 && (
                  <div
                    {...getRootProps()}
                    className={`w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                      isDragActive
                        ? 'border-electric bg-electric/5'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <svg className="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-[10px] text-text-muted mt-1">Add</span>
                  </div>
                )}
              </div>
            )}

            {/* Default reference or empty dropzone */}
            {referenceImages.length === 0 && (
              <div className="flex items-start gap-4">
                {useDefaultReference && (
                  <div className="relative flex-shrink-0">
                    <img
                      src={DEFAULT_REFERENCE_IMAGE}
                      alt="Default Reference"
                      className="max-h-36 rounded-lg border-2 border-mint/30"
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-mint/90 text-void text-xs font-medium rounded">
                      Default
                    </div>
                  </div>
                )}
                <div className="flex-1">
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                      isDragActive
                        ? 'border-electric bg-electric/5'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <svg className="w-8 h-8 mx-auto mb-2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-text-secondary text-sm mb-1">
                      {isDragActive ? 'Drop images here' : 'Upload reference photos'}
                    </p>
                    <p className="text-text-muted text-xs">
                      Person photo + location photo to combine (JPEG, PNG, WebP)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Clear all button */}
            {referenceImages.length > 0 && (
              <button
                onClick={clearAllReferences}
                className="text-xs text-text-muted hover:text-coral transition-colors"
              >
                Remove all &amp; use default
              </button>
            )}
          </div>
        )}
      </div>

      {/* Prompt Selection */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Scene Style Preset
        </label>
        <select
          value={selectedPromptId}
          onChange={(e) => handlePromptSelect(e.target.value)}
          className="input-field mb-4"
        >
          <option value="">-- Select a preset or write custom --</option>
          {PROMPT_CATEGORIES.map((category) => (
            <optgroup key={category.id} label={category.name}>
              {category.prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label className="block text-sm font-medium text-text-secondary mb-3">
          Scene Description {selectedPromptId && <span className="text-electric">(from preset)</span>}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (selectedPromptId) {
              setSelectedPromptId('');
            }
          }}
          placeholder="Professional person in a modern office setting, wearing a blue blazer, neutral background, high quality, 4K, natural lighting..."
          className="textarea-field"
          rows={6}
        />
        <p className="text-xs text-text-muted mt-2">
          {selectedPromptId
            ? 'Preset loaded. You can customize it or select a different preset above.'
            : 'Select a preset above or write your own description. Include setting, clothing, lighting, and style.'}
        </p>
      </div>

      {/* Generate Button */}
      {!generatedScene && (
        <button
          onClick={handleGenerate}
          disabled={isGeneratingScene || !prompt.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isGeneratingScene ? (
            <>
              <div className="w-5 h-5 border-2 border-void/30 border-t-void rounded-full animate-spin" />
              Generating Scene...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Scene
            </>
          )}
        </button>
      )}

      {/* Generated Scene Preview */}
      {generatedScene && (
        <div className="glass-card overflow-hidden animate-slide-up">
          <div className="aspect-video relative bg-slate-dark">
            <img
              src={generatedScene.imageUrl}
              alt="Generated scene"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-text-secondary line-clamp-2">
              {generatedScene.prompt}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleUseScene}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Use This Scene
              </button>

              <button
                onClick={handleRegenerate}
                disabled={isGeneratingScene}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                {isGeneratingScene ? (
                  <div className="w-4 h-4 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Regenerate
              </button>

              <button
                onClick={handleDownload}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SceneGenerator;
