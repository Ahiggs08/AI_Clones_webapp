import { useState, useEffect } from 'react';

const PASSCODE_STORAGE_KEY = 'ai-clone-access-verified';

function PasscodeGate({ children }) {
  const [isVerified, setIsVerified] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if already verified
    const verified = localStorage.getItem(PASSCODE_STORAGE_KEY);
    if (verified === 'true') {
      setIsVerified(true);
    }
    setIsChecking(false);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Verify passcode with server
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem(PASSCODE_STORAGE_KEY, 'true');
        setIsVerified(true);
      } else {
        setError('Invalid access code');
        setPasscode('');
      }
    } catch (err) {
      setError('Failed to verify. Please try again.');
    }
  };

  // Still checking localStorage
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show passcode form if not verified
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center p-4">
        <div className="glass-card p-8 w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-electric to-violet flex items-center justify-center">
              <svg className="w-8 h-8 text-void" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              AI Clone Video
            </h1>
            <p className="text-text-secondary mt-2">
              Enter your access code to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter access code"
                className="w-full px-4 py-3 bg-slate-dark border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-electric text-center text-lg tracking-widest"
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mt-2 text-center">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!passcode.trim()}
              className="btn-primary w-full"
            >
              Access App
            </button>
          </form>

          <p className="text-text-muted text-xs text-center mt-6">
            Contact support if you need an access code
          </p>
        </div>
      </div>
    );
  }

  // Verified - show the app
  return children;
}

export default PasscodeGate;
