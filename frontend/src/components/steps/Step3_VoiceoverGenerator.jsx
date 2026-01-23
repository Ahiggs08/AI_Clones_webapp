import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AudioPlayer from '../AudioPlayer';
import { fetchVoices, generateVoiceover } from '../../utils/api';
import { chunkScript, getChunkInfo, needsChunking, estimateAudioDuration } from '../../utils/scriptChunker';
import useAppStore from '../../stores/useAppStore';

function Step3_VoiceoverGenerator() {
  const navigate = useNavigate();
  const {
    script,
    selectedScene,
    voiceover,
    setVoiceover,
    apiKeys,
    lastUsedVoiceId,
    setLastUsedVoiceId,
    saveSettings,
    setCurrentStep,
    canProceedToStep3,
    canProceedToStep4,
    isGeneratingVoiceover,
    setIsGeneratingVoiceover
  } = useAppStore();

  const [voices, setVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(lastUsedVoiceId || '');
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setCurrentStep(3);
    
    // Redirect if prerequisites not met
    if (!canProceedToStep3()) {
      navigate('/step/2');
    }
  }, [setCurrentStep, canProceedToStep3, navigate]);

  useEffect(() => {
    loadVoices();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isDropdownOpen]);

  // Filter voices based on search query
  const filteredVoices = voices.filter(voice => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const nameMatch = voice.name?.toLowerCase().includes(query);
    const labelMatch = voice.labels && Object.values(voice.labels).some(
      label => label?.toLowerCase().includes(query)
    );
    return nameMatch || labelMatch;
  });

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const loadedVoices = await fetchVoices(apiKeys.elevenLabsApiKey);
      setVoices(loadedVoices);
      
      // Select last used voice or first available
      if (lastUsedVoiceId && loadedVoices.find(v => v.voice_id === lastUsedVoiceId)) {
        setSelectedVoiceId(lastUsedVoiceId);
      } else if (loadedVoices.length > 0) {
        setSelectedVoiceId(loadedVoices[0].voice_id);
      }
    } catch (error) {
      console.error('Failed to load voices:', error);
      toast.error('Failed to load voices');
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedVoiceId) {
      toast.error('Please select a voice');
      return;
    }

    setIsGeneratingVoiceover(true);
    setVoiceover(null);

    try {
      // Check if script needs chunking (> 15 seconds of audio)
      const scriptNeedsChunking = needsChunking(script);
      const chunks = chunkScript(script);
      
      console.log(`[Voiceover] Script needs chunking: ${scriptNeedsChunking}, chunks: ${chunks.length}`);
      
      if (chunks.length > 1) {
        // Generate voiceover for each chunk
        toast.loading(`Generating ${chunks.length} audio segments...`, { id: 'chunk-progress' });
        
        const generatedChunks = [];
        
        for (let i = 0; i < chunks.length; i++) {
          toast.loading(`Generating segment ${i + 1} of ${chunks.length}...`, { id: 'chunk-progress' });
          
          const result = await generateVoiceover({
            script: chunks[i],
            voiceId: selectedVoiceId,
            elevenLabsApiKey: apiKeys.elevenLabsApiKey
          });
          
          let audioUrl = result.audioUrl;
          const audioData = result.audioData;
          const contentType = result.contentType || 'audio/mpeg';
          
          if (audioData) {
            const audioBlob = base64ToBlob(audioData, contentType);
            audioUrl = URL.createObjectURL(audioBlob);
          }
          
          generatedChunks.push({
            index: i,
            text: chunks[i],
            audioUrl,
            audioData,
            contentType,
            characterCount: chunks[i].length
          });
        }
        
        toast.dismiss('chunk-progress');
        
        // Store all chunks
        setVoiceover({
          isChunked: true,
          chunks: generatedChunks,
          voiceId: selectedVoiceId,
          totalChunks: generatedChunks.length,
          // For preview, use first chunk's audio
          audioUrl: generatedChunks[0].audioUrl,
          generatedAt: new Date().toISOString()
        });
        
        toast.success(`Generated ${chunks.length} audio segments!`);
      } else {
        // Single chunk - original flow
        const result = await generateVoiceover({
          script,
          voiceId: selectedVoiceId,
          elevenLabsApiKey: apiKeys.elevenLabsApiKey
        });

        let audioUrl = result.audioUrl;
        const audioData = result.audioData;
        const contentType = result.contentType || 'audio/mpeg';
        
        if (audioData) {
          const audioBlob = base64ToBlob(audioData, contentType);
          audioUrl = URL.createObjectURL(audioBlob);
        }

        setVoiceover({
          isChunked: false,
          audioUrl,
          audioData,
          contentType,
          voiceId: selectedVoiceId,
          duration: result.duration,
          characterCount: result.characterCount,
          generatedAt: result.generatedAt || new Date().toISOString()
        });

        toast.success('Voiceover generated successfully!');
      }

      // Remember this voice
      setLastUsedVoiceId(selectedVoiceId);
      await saveSettings({ lastUsedVoiceId: selectedVoiceId });

    } catch (error) {
      console.error('Voiceover generation error:', error);
      toast.dismiss('chunk-progress');
      toast.error(error.message || 'Failed to generate voiceover');
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const base64ToBlob = (base64, contentType) => {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    
    return new Blob(byteArrays, { type: contentType });
  };

  const handleDownload = () => {
    if (!voiceover?.audioUrl) return;
    
    const a = document.createElement('a');
    a.href = voiceover.audioUrl;
    a.download = `voiceover-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleNext = () => {
    if (canProceedToStep4()) {
      navigate('/step/4');
    }
  };

  const handleBack = () => {
    navigate('/step/2');
  };

  const getSelectedVoiceName = () => {
    const voice = voices.find(v => v.voice_id === selectedVoiceId);
    return voice?.name || 'Select a voice';
  };

  const getSelectedVoice = () => {
    return voices.find(v => v.voice_id === selectedVoiceId);
  };

  const handleSelectVoice = (voiceId) => {
    setSelectedVoiceId(voiceId);
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
          Generate Voiceover
        </h1>
        <p className="text-text-secondary">
          Choose a voice and generate the audio for your script.
        </p>
      </div>

      {/* Preview Cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Scene Preview */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Selected Scene</h3>
          <div className="aspect-video rounded-lg overflow-hidden bg-slate-dark">
            <img
              src={selectedScene?.imageUrl}
              alt="Selected scene"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Script Preview */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Your Script</h3>
          <div className="h-[calc(100%-2rem)] overflow-y-auto">
            <p className="text-text-primary text-sm leading-relaxed">
              {script}
            </p>
          </div>
        </div>
      </div>

      {/* Voice Selection */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Select Voice</h3>
        
        {isLoadingVoices ? (
          <div className="flex items-center gap-3 py-4">
            <div className="spinner w-5 h-5"></div>
            <span className="text-text-secondary">Loading voices...</span>
          </div>
        ) : voices.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-text-secondary mb-2">No voices available</p>
            <p className="text-sm text-text-muted">
              Configure your ElevenLabs API key in settings to access voice clones
            </p>
          </div>
        ) : (
          <div className="relative" ref={dropdownRef}>
            {/* Selected Voice Display / Dropdown Trigger */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between ${
                isDropdownOpen
                  ? 'border-electric bg-electric/5'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedVoiceId ? 'bg-electric text-void' : 'bg-slate-medium text-text-secondary'
                }`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${selectedVoiceId ? 'text-text-primary' : 'text-text-muted'}`}>
                    {getSelectedVoiceName()}
                  </p>
                  {getSelectedVoice()?.labels && (
                    <p className="text-xs text-text-muted truncate">
                      {[getSelectedVoice().labels.accent, getSelectedVoice().labels.gender, getSelectedVoice().labels.use_case]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  )}
                </div>
              </div>
              <svg 
                className={`w-5 h-5 text-text-muted transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-2 bg-slate-dark border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-slide-up">
                {/* Search Input */}
                <div className="p-3 border-b border-white/10">
                  <div className="relative">
                    <svg 
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search voices..."
                      className="w-full pl-10 pr-4 py-2 bg-slate-medium border border-white/10 rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-electric"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Voice List */}
                <div className="max-h-64 overflow-y-auto">
                  {filteredVoices.length === 0 ? (
                    <div className="p-4 text-center text-text-muted text-sm">
                      No voices match "{searchQuery}"
                    </div>
                  ) : (
                    filteredVoices.map((voice) => (
                      <button
                        key={voice.voice_id}
                        onClick={() => handleSelectVoice(voice.voice_id)}
                        className={`w-full p-3 text-left transition-all flex items-center gap-3 hover:bg-white/5 ${
                          selectedVoiceId === voice.voice_id ? 'bg-electric/10' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          selectedVoiceId === voice.voice_id ? 'bg-electric text-void' : 'bg-slate-medium text-text-secondary'
                        }`}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${
                            selectedVoiceId === voice.voice_id ? 'text-electric' : 'text-text-primary'
                          }`}>
                            {voice.name}
                          </p>
                          {voice.labels && (
                            <p className="text-xs text-text-muted truncate">
                              {[voice.labels.accent, voice.labels.gender, voice.labels.use_case]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          )}
                        </div>
                        {selectedVoiceId === voice.voice_id && (
                          <svg className="w-5 h-5 text-electric flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Voice Count */}
                <div className="p-2 border-t border-white/10 text-center">
                  <span className="text-xs text-text-muted">
                    {filteredVoices.length} of {voices.length} voices
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generate Button / Audio Player */}
      {!voiceover ? (
        <button
          onClick={handleGenerate}
          disabled={isGeneratingVoiceover || !selectedVoiceId || voices.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 mb-6"
        >
          {isGeneratingVoiceover ? (
            <>
              <div className="w-5 h-5 border-2 border-void/30 border-t-void rounded-full animate-spin" />
              Generating Voiceover...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Generate Voiceover
            </>
          )}
        </button>
      ) : (
        <div className="glass-card p-6 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-medium text-text-primary">Generated Voiceover</h3>
              <p className="text-sm text-text-muted">Voice: {getSelectedVoiceName()}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGeneratingVoiceover}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {isGeneratingVoiceover ? (
                  <div className="w-4 h-4 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Regenerate
              </button>
              <button
                onClick={handleDownload}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
          
          <AudioPlayer src={voiceover.audioUrl} />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={handleBack} className="btn-secondary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to Scene
        </button>
        
        <button
          onClick={handleNext}
          disabled={!canProceedToStep4()}
          className="btn-primary flex items-center gap-2"
        >
          Generate Video
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Step3_VoiceoverGenerator;





