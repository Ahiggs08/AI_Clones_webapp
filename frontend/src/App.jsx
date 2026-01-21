import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import PasscodeGate from './components/PasscodeGate';
import Step1_ScriptInput from './components/steps/Step1_ScriptInput';
import Step2_SceneSelection from './components/steps/Step2_SceneSelection';
import Step3_VoiceoverGenerator from './components/steps/Step3_VoiceoverGenerator';
import Step4_VideoGenerator from './components/steps/Step4_VideoGenerator';
import Projects from './components/Projects';
import { initDB } from './utils/db';
import useAppStore from './stores/useAppStore';

function App() {
  const loadSettings = useAppStore((state) => state.loadSettings);

  useEffect(() => {
    // Initialize IndexedDB and load settings on app start
    const init = async () => {
      await initDB();
      await loadSettings();
    };
    init();
  }, [loadSettings]);

  return (
    <PasscodeGate>
      <div className="min-h-screen bg-gradient-mesh">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/step/1" replace />} />
            <Route path="step/1" element={<Step1_ScriptInput />} />
            <Route path="step/2" element={<Step2_SceneSelection />} />
            <Route path="step/3" element={<Step3_VoiceoverGenerator />} />
            <Route path="step/4" element={<Step4_VideoGenerator />} />
            <Route path="projects" element={<Projects />} />
          </Route>
        </Routes>
      </div>
    </PasscodeGate>
  );
}

export default App;
