import { useState } from 'react';
import toast from 'react-hot-toast';
import useAppStore from '../stores/useAppStore';

/**
 * Required API Keys Modal - Cannot be dismissed until valid keys are entered
 * Note: Currently unused since API keys are stored as server env vars
 * (hasRequiredApiKeys always returns true)
 */
function ApiKeysModal() {
  const { saveSettings } = useAppStore();

  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    if (!elevenLabsApiKey.trim()) {
      newErrors.elevenLabsApiKey = 'ElevenLabs API key is required';
    } else if (elevenLabsApiKey.trim().length < 10) {
      newErrors.elevenLabsApiKey = 'API key seems too short';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        elevenLabsApiKey: elevenLabsApiKey.trim()
      });
      toast.success('API keys saved! You can now use the app.');
    } catch (error) {
      toast.error('Failed to save API keys');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - no onClick to close */}
      <div className="absolute inset-0 bg-void/95 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative glass-card max-w-lg w-full p-8 animate-slide-up">
        {/* Logo/Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric to-violet flex items-center justify-center">
            <svg className="w-8 h-8 text-void" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl font-bold text-text-primary mb-2">
            Welcome to AI Clone Video
          </h2>
          <p className="text-text-secondary">
            To get started, please enter your API keys. These are required to generate voiceovers.
          </p>
        </div>

        {/* API Key Inputs */}
        <div className="space-y-5 mb-8">
          {/* ElevenLabs API Key */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              ElevenLabs API Key <span className="text-coral">*</span>
            </label>
            <div className="relative">
              <input
                type={showElevenLabsKey ? 'text' : 'password'}
                value={elevenLabsApiKey}
                onChange={(e) => {
                  setElevenLabsApiKey(e.target.value);
                  if (errors.elevenLabsApiKey) setErrors({ ...errors, elevenLabsApiKey: null });
                }}
                placeholder="Enter your ElevenLabs API key"
                className={`input-field pr-12 ${errors.elevenLabsApiKey ? 'border-coral' : ''}`}
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
            {errors.elevenLabsApiKey && (
              <p className="text-coral text-sm mt-1">{errors.elevenLabsApiKey}</p>
            )}
            <p className="text-xs text-text-muted mt-1">
              Get your key at <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">elevenlabs.io</a>
            </p>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full text-lg py-4"
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-void/30 border-t-void rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            'Get Started'
          )}
        </button>

        {/* Security Notice */}
        <p className="text-xs text-text-muted text-center mt-6">
          <svg className="w-4 h-4 inline-block mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Your API keys are stored locally in your browser and are never sent to our servers.
        </p>
      </div>
    </div>
  );
}

export default ApiKeysModal;
