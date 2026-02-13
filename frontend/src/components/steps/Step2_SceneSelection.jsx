import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SceneGallery from '../SceneGallery';
import SceneGenerator from '../SceneGenerator';
import useAppStore from '../../stores/useAppStore';

function Step2_SceneSelection() {
  const navigate = useNavigate();
  const { 
    script, 
    selectedScene, 
    setSelectedScene, 
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
          // Update scene with base64 data
          scene = { ...scene, imageData, imageContentType };
          console.log('[SceneSelection] Image stored as base64');
        }
      } catch (err) {
        console.warn('[SceneSelection] Could not fetch image:', err);
      }
    }
    setSelectedScene(scene);
  };

  const handleSceneGenerated = (scene) => {
    setSelectedScene(scene);
    // Switch to gallery tab to show it's saved
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
          Choose Your Scene
        </h1>
        <p className="text-text-secondary">
          Select an existing scene or generate a new AI avatar for your video.
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

      {/* Selected Scene Indicator */}
      {selectedScene && (
        <div className="glass-card p-4 mb-6 border-electric/30 bg-electric/5 animate-fade-in">
          <div className="flex items-center gap-4">
            <img
              src={selectedScene.imageUrl}
              alt="Selected scene"
              className="w-16 h-16 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-electric mb-1">Scene Selected</h3>
              <p className="text-text-secondary text-sm line-clamp-1">
                {selectedScene.prompt}
              </p>
            </div>
            <button
              onClick={() => setSelectedScene(null)}
              className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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





