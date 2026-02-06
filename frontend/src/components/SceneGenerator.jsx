import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { generateScene } from '../utils/api';
import { saveScene, saveReferenceImage, getReferenceImage, deleteReferenceImage } from '../utils/db';
import useAppStore from '../stores/useAppStore';
import PROMPT_CATEGORIES, { getPromptById } from '../data/scenePrompts';
import { DEFAULT_REFERENCE_IMAGE } from '../data/defaultScenes';

function SceneGenerator({ onSceneGenerated }) {
  const { apiKeys, isGeneratingScene, setIsGeneratingScene } = useAppStore();

  const [referenceImage, setReferenceImage] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [referenceFileName, setReferenceFileName] = useState(null);
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

  // Load saved reference image on mount
  useEffect(() => {
    const loadSavedReference = async () => {
      try {
        const saved = await getReferenceImage();
        if (saved && saved.blob) {
          // User has a custom reference image saved - use it
          const file = new File([saved.blob], saved.fileName, { type: saved.blob.type });
          setReferenceImage(file);
          setReferencePreview(URL.createObjectURL(saved.blob));
          setReferenceFileName(saved.fileName);
          setUseDefaultReference(false);
        } else {
          // No custom image - use default
          setUseDefaultReference(true);
        }
      } catch (error) {
        console.error('Failed to load saved reference image:', error);
        setUseDefaultReference(true);
      } finally {
        setIsLoadingReference(false);
      }
    };
    loadSavedReference();
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setReferenceImage(file);
      setReferencePreview(URL.createObjectURL(file));
      setReferenceFileName(file.name);
      setUseDefaultReference(false);

      // Save to IndexedDB for persistence
      try {
        await saveReferenceImage(file, file.name);
        toast.success('Custom reference image saved');
      } catch (error) {
        console.error('Failed to save reference image:', error);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    console.log('[SceneGenerator] Starting generation...');
    setIsGeneratingScene(true);
    setGeneratedScene(null);

    try {
      console.log('[SceneGenerator] Calling API with prompt:', prompt.trim().substring(0, 50) + '...');
      console.log('[SceneGenerator] Using default reference:', useDefaultReference);
      const result = await generateScene({
        referenceImage: useDefaultReference ? null : referenceImage,
        useDefaultReference,
        prompt: prompt.trim(),
        orientation
      });
      console.log('[SceneGenerator] API response received:', result);

      if (!result || !result.imageUrl) {
        throw new Error('Invalid response from server - no image URL received');
      }

      const scene = {
        id: result.id || uuidv4(),
        imageUrl: result.imageUrl,
        prompt: prompt.trim(),
        orientation,
        timestamp: Date.now(),
        referenceImageName: referenceImage?.name || null
      };

      // Save to IndexedDB
      await saveScene(scene);
      console.log('[SceneGenerator] Scene saved to IndexedDB');
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

  const clearReferenceImage = async () => {
    setReferenceImage(null);
    setReferencePreview(null);
    setReferenceFileName(null);
    setUseDefaultReference(true);

    // Remove from IndexedDB
    try {
      await deleteReferenceImage();
      toast.success('Switched to default reference image');
    } catch (error) {
      console.error('Failed to delete reference image:', error);
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

      {/* Reference Image Upload */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-3">
          Reference Image
          {useDefaultReference && <span className="text-mint ml-2">(Using Default)</span>}
          {!useDefaultReference && referencePreview && <span className="text-electric ml-2">(Custom)</span>}
        </label>
        {isLoadingReference ? (
          <div className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center">
            <div className="spinner mx-auto mb-3"></div>
            <p className="text-text-muted text-sm">Loading saved reference...</p>
          </div>
        ) : useDefaultReference ? (
          /* Default Reference Image */
          <div className="flex items-start gap-4">
            <div className="relative">
              <img
                src={DEFAULT_REFERENCE_IMAGE}
                alt="Default Reference"
                className="max-h-48 rounded-lg border-2 border-mint/30"
              />
              <div className="absolute top-2 left-2 px-2 py-1 bg-mint/90 text-void text-xs font-medium rounded">
                Default
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm text-text-primary font-medium mb-1">
                Default Reference Image
              </p>
              <p className="text-xs text-text-muted mb-3">
                Using the default reference image. Upload your own to customize the avatar.
              </p>
              <div
                {...getRootProps()}
                className="inline-block"
              >
                <input {...getInputProps()} />
                <button className="text-sm text-electric hover:text-electric-dim transition-colors">
                  Upload custom image
                </button>
              </div>
            </div>
          </div>
        ) : !referencePreview ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-electric bg-electric/5'
                : 'border-white/10 hover:border-white/20'
            }`}
          >
            <input {...getInputProps()} />
            <svg className="w-10 h-10 mx-auto mb-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-text-secondary mb-1">
              {isDragActive ? 'Drop image here' : 'Drag & drop a reference image'}
            </p>
            <p className="text-text-muted text-sm">
              or click to browse (JPEG, PNG, WebP - max 10MB)
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="relative">
              <img
                src={referencePreview}
                alt="Reference"
                className="max-h-48 rounded-lg border-2 border-electric/30"
              />
              <div className="absolute top-2 left-2 px-2 py-1 bg-electric/90 text-void text-xs font-medium rounded">
                Custom
              </div>
              <button
                onClick={clearReferenceImage}
                className="absolute -top-2 -right-2 p-1.5 bg-coral rounded-full text-void hover:bg-coral-dim transition-colors"
                title="Remove and use default"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1">
              <p className="text-sm text-text-primary font-medium mb-1">
                {referenceFileName || 'Custom Reference Image'}
              </p>
              <p className="text-xs text-text-muted mb-3">
                Using your custom reference image. Remove it to switch back to default.
              </p>
              <div
                {...getRootProps()}
                className="inline-block"
              >
                <input {...getInputProps()} />
                <button className="text-sm text-electric hover:text-electric-dim transition-colors">
                  Replace image
                </button>
              </div>
            </div>
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
            // Clear preset selection if user modifies text
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

