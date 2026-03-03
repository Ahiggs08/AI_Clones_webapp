import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SceneGallery from '../SceneGallery';
import SceneGenerator from '../SceneGenerator';
import useAppStore from '../../stores/useAppStore';

function Step2_SceneSelection() {
  const navigate = useNavigate();
  const {
    script,
    selectedScenes,
    addSelectedScene,
    removeSelectedScene,
    setCurrentStep,
    canProceedToStep2,
    canProceedToStep3
  } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('gallery');

  useEffect(() => {
    setCurrentStep(2);
    
    // Redirect if no script
    if (!canProceedToStep2()) {
      navigate('/step/1');
    }
  }, [setCurrentStep, canProceedToStep2, navigate]);

  const handleSceneSelect = async (scene) => {
    // Toggle: if already selected, remove it
    const existing = selectedScenes.find(s => s.id === scene.id);
    if (existing) {
      removeSelectedScene(scene.id);
      return;
    }

    // If scene doesn't have base64 data, fetch and store it
    if (!scene.imageData && scene.imageUrl) {
      console.log('[SceneSelection] Fetching image for permanent storage...');
      try {
        const imageResponse = await fetch(scene.imageUrl);
        if (imageResponse.ok) {
          const blob = await imageResponse.blob();
          const imageContentType = blob.type || 'image/png';
          const imageData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });
          scene = { ...scene, imageData, imageContentType };
          console.log('[SceneSelection] Image stored as base64');
        }
      } catch (err) {
        console.warn('[SceneSelection] Could not fetch image:', err);
      }
    }
    addSelectedScene(scene);
  };

  const handleSceneGenerated = (scene) => {
    addSelectedScene(scene);
    setActiveTab('gallery');
  };

  const handleNext = () => {
    if (canProceedToStep3()) {
      navigate('/step/3');
    }
  };

  const handleBack = () => {
    navigate('/step/1');
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Choose Your Scenes
        </h1>
        <p className="text-text-secondary">
          Select one or more scenes. Multiple scenes let you create dynamic videos with different backgrounds.
        </p>
      </div>

      {/* Script Preview */}
      <div className="glass-card p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-electric/10">
            <svg className="w-5 h-5 text-electric" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-text-secondary mb-1">Your Script</h3>
            <p className="text-text-primary text-sm line-clamp-2">{script}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('gallery')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'gallery'
              ? 'bg-electric text-void'
              : 'bg-slate-medium text-text-secondary hover:text-text-primary'
          }`}
        >
          My Scenes
        </button>
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'generate'
              ? 'bg-electric text-void'
              : 'bg-slate-medium text-text-secondary hover:text-text-primary'
          }`}
        >
          Generate New
        </button>
      </div>

      {/* Tab Content */}
      <div className="glass-card p-6 mb-6">
        {activeTab === 'gallery' ? (
          <SceneGallery onSelect={handleSceneSelect} />
        ) : (
          <SceneGenerator onSceneGenerated={handleSceneGenerated} />
        )}
      </div>

      {/* Selected Scenes Bar */}
      {selectedScenes.length > 0 && (
        <div className="glass-card p-4 mb-6 border-electric/30 bg-electric/5 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-electric">
              {selectedScenes.length} {selectedScenes.length === 1 ? 'Scene' : 'Scenes'} Selected
            </h3>
            {selectedScenes.length > 1 && (
              <span className="text-xs text-text-muted">
                Multi-scene mode — segments will be assigned in Step 4
              </span>
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            {selectedScenes.map((scene, index) => (
              <div key={scene.id} className="relative group">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-electric/50">
                  <img
                    src={scene.imageUrl}
                    alt={scene.prompt || `Scene ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-electric text-void text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </div>
                </div>
                <button
                  onClick={() => removeSelectedScene(scene.id)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-coral text-void flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={handleBack} className="btn-secondary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to Script
        </button>
        
        <button
          onClick={handleNext}
          disabled={!canProceedToStep3()}
          className="btn-primary flex items-center gap-2"
        >
          Generate Voiceover
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Step2_SceneSelection;





