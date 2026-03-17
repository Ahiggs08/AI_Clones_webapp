import { create } from 'zustand';
import { getSettings, saveSettings as saveSettingsToDB } from '../utils/db';

const useAppStore = create((set, get) => ({
  // ============ API KEYS ============
  apiKeys: {
    elevenLabsApiKey: ''
  },
  
  setApiKeys: (keys) => set({ apiKeys: { ...get().apiKeys, ...keys } }),
  
  // ============ SETTINGS ============
  lastUsedVoiceId: '',
  settingsLoaded: false,
  showSettings: false,

  setShowSettings: (show) => set({ showSettings: show }),
  setLastUsedVoiceId: (voiceId) => set({ lastUsedVoiceId: voiceId }),
  
  loadSettings: async () => {
    try {
      const settings = await getSettings();
      set({
        apiKeys: {
          elevenLabsApiKey: settings.elevenLabsApiKey || ''
        },
        lastUsedVoiceId: settings.lastUsedVoiceId || '',
        settingsLoaded: true
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ settingsLoaded: true });
    }
  },
  
  saveSettings: async (newSettings) => {
    const currentState = get();
    const settings = {
      elevenLabsApiKey: newSettings.elevenLabsApiKey ?? currentState.apiKeys.elevenLabsApiKey,
      lastUsedVoiceId: newSettings.lastUsedVoiceId ?? currentState.lastUsedVoiceId
    };
    
    await saveSettingsToDB(settings);
    set({
      apiKeys: {
        elevenLabsApiKey: settings.elevenLabsApiKey
      },
      lastUsedVoiceId: settings.lastUsedVoiceId
    });
  },
  
  // ============ CURRENT STEP ============
  currentStep: 1,
  setCurrentStep: (step) => set({ currentStep: step }),
  
  // ============ SCRIPT ============
  script: '',
  setScript: (script) => set({ script }),
  
  // ============ SELECTED SCENES ============
  selectedScenes: [],
  addSelectedScene: (scene) => set(state => ({
    selectedScenes: [...state.selectedScenes, scene]
  })),
  removeSelectedScene: (id) => set(state => ({
    selectedScenes: state.selectedScenes.filter(s => s.id !== id)
  })),
  clearSelectedScenes: () => set({ selectedScenes: [] }),

  // ============ SEGMENTS (multi-scene mode) ============
  segments: [],  // [{ id, text, sceneId }]
  setSegments: (segments) => set({ segments }),
  
  // ============ VOICEOVER ============
  // voiceover can have: { audioUrl, audioData, voiceId, chunks: [...] }
  // chunks is an array of { text, audioData, audioUrl } for long scripts
  voiceover: null,
  setVoiceover: (voiceover) => set({ voiceover }),
  
  // ============ GENERATED VIDEO ============
  generatedVideo: null, // { videoUrl, jobId, ... }
  setGeneratedVideo: (video) => set({ generatedVideo: video }),
  
  // ============ LOADING STATES ============
  isGeneratingScene: false,
  isGeneratingVoiceover: false,
  isGeneratingVideo: false,
  videoProgress: 0,
  videoStatusMessage: '',
  
  setIsGeneratingScene: (loading) => set({ isGeneratingScene: loading }),
  setIsGeneratingVoiceover: (loading) => set({ isGeneratingVoiceover: loading }),
  setIsGeneratingVideo: (loading) => set({ isGeneratingVideo: loading }),
  setVideoProgress: (progress) => set({ videoProgress: progress }),
  setVideoStatusMessage: (message) => set({ videoStatusMessage: message }),
  
  // ============ RESET ============
  reset: () => set({
    currentStep: 1,
    script: '',
    selectedScenes: [],
    segments: [],
    voiceover: null,
    generatedVideo: null,
    isGeneratingScene: false,
    isGeneratingVoiceover: false,
    isGeneratingVideo: false,
    videoProgress: 0,
    videoStatusMessage: ''
  }),
  
  // ============ CAN PROCEED CHECKS ============
  canProceedToStep2: () => {
    const { script } = get();
    return script.trim().length >= 10;
  },
  
  canProceedToStep3: () => {
    const { selectedScenes } = get();
    return selectedScenes.length > 0;
  },
  
  canProceedToStep4: () => {
    const { voiceover } = get();
    return voiceover !== null;
  },
  
  // ============ API KEYS CHECK ============
  // API keys are now stored as environment variables on the server
  // No local API keys required from the user
  hasRequiredApiKeys: () => {
    return true; // Always return true - keys are on the server
  }
}));

export default useAppStore;

