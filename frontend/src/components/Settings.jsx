import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { clearAllData, getStorageEstimate } from '../utils/db';

function Settings({ onClose }) {
  const [storageInfo, setStorageInfo] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    // Get storage estimate
    getStorageEstimate().then(setStorageInfo);
  }, []);

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

        {/* API Status Section */}
        <div className="mb-6 p-4 bg-mint/10 border border-mint/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-mint/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-mint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                API Keys Configured
              </h3>
              <p className="text-xs text-text-muted">
                All API integrations are set up and ready to use.
              </p>
            </div>
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
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;





