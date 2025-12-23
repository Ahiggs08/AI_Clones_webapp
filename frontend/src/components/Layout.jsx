import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import StepperNavigation from './StepperNavigation';
import Settings from './Settings';
import ApiKeysModal from './ApiKeysModal';
import useAppStore from '../stores/useAppStore';

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showSettings, setShowSettings, settingsLoaded, hasRequiredApiKeys } = useAppStore();
  
  // Determine current step from URL
  const getCurrentStep = () => {
    const match = location.pathname.match(/\/step\/(\d+)/);
    return match ? parseInt(match[1]) : 1;
  };

  if (!settingsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-obsidian/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => navigate('/step/1')}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-electric to-violet flex items-center justify-center">
                <svg className="w-6 h-6 text-void" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="font-display font-bold text-lg text-text-primary group-hover:text-electric transition-colors">
                  AI Clone Video
                </h1>
                <p className="text-xs text-text-muted -mt-0.5">Generator</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <button
                onClick={() => navigate('/projects')}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === '/projects' 
                    ? 'text-electric' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                My Projects
              </button>
            </nav>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-slate-medium transition-colors text-text-secondary hover:text-text-primary"
              aria-label="Settings"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Stepper Navigation */}
      {location.pathname.startsWith('/step') && (
        <div className="border-b border-white/5 bg-void/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <StepperNavigation currentStep={getCurrentStep()} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>

      {/* API Keys Required Modal - Cannot be dismissed */}
      {settingsLoaded && !hasRequiredApiKeys() && <ApiKeysModal />}

      {/* Settings Modal */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default Layout;

