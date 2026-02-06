import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useAppStore from '../stores/useAppStore';
import { clearAllData, getStorageEstimate } from '../utils/db';

function Settings({ onClose }) {
  const { apiKeys, saveSettings } = useAppStore();
  
  const [heygenApiKey, setHeygenApiKey] = useState(apiKeys.heygenApiKey);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(apiKeys.elevenLabsApiKey);
  const [showHeygenKey, setShowHeygenKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [storageInfo, setStorageInfo] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Get storage estimate
    getStorageEstimate().then(setStorageInfo);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings({
        heygenApiKey,
        elevenLabsApiKey
      });
      toast.success('Settings saved successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAllData = async () => {
    try {
      await clearAllData();
      toast.success('All data cleared');
      setShowClearConfirm(false);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to clear data');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-void/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative glass-card max-w-lg w-full p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold text-text-primary">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-medium transition-colors text-text-secondary hover:text-text-primary"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API Keys Section */}
        <div className="space-y-4 mb-6">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
            API Keys
          </h3>
          
          {/* HeyGen API Key */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              HeyGen API Key
            </label>
            <div className="relative">
              <input
                type={showHeygenKey ? 'text' : 'password'}
                value={heygenApiKey}
                onChange={(e) => setHeygenApiKey(e.target.value)}
                placeholder="Enter your HeyGen API key"
                className="input-field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowHeygenKey(!showHeygenKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showHeygenKey ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Required for video generation
            </p>
          </div>

          {/* ElevenLabs API Key */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              ElevenLabs API Key
            </label>
            <div className="relative">
              <input
                type={showElevenLabsKey ? 'text' : 'password'}
                value={elevenLabsApiKey}
                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                placeholder="Enter your ElevenLabs API key"
                className="input-field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
              >
                {showElevenLabsKey ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Required for voiceover generation
            </p>
          </div>
        </div>

        {/* Storage Info */}
        {storageInfo && (
          <div className="mb-6 p-4 bg-slate-dark/50 rounded-lg">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-2">
              Storage Usage
            </h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-primary">
                {formatBytes(storageInfo.usage)} used
              </span>
              <span className="text-text-muted">
                of {formatBytes(storageInfo.quota)} ({storageInfo.usagePercent}%)
              </span>
            </div>
            <div className="mt-2 h-2 bg-obsidian rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-electric to-violet rounded-full transition-all"
                style={{ width: `${Math.min(parseFloat(storageInfo.usagePercent), 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="mb-6 p-4 border border-coral/20 rounded-lg">
          <h3 className="text-sm font-medium text-coral uppercase tracking-wider mb-2">
            Danger Zone
          </h3>
          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="btn-danger text-sm"
            >
              Clear All Data
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                This will permanently delete all your scenes, projects, and settings. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClearAllData}
                  className="btn-danger text-sm"
                >
                  Yes, Delete Everything
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="btn-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Security Notice */}
        <p className="text-xs text-text-muted text-center mt-4">
          API keys are stored locally in your browser. They are not sent to any server except the respective APIs.
        </p>
      </div>
    </div>
  );
}

export default Settings;





