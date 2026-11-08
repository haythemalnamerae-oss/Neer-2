import React, { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApiSessionGate } from './components/auth/ApiSessionGate';
import './index.css';

function Root() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    let active = true;
    import('./App').then((module) => { if (active) setApp(() => module.default); });
    return () => { active = false; };
  }, []);
  return <ApiSessionGate>{App ? <App /> : <div className="min-h-screen bg-[#F5F7F5]" />}</ApiSessionGate>;
}

const rootElement = document.getElementById('root');
const appRoot = (globalThis as typeof globalThis & { __neerRoot?: Root }).__neerRoot ?? createRoot(rootElement!);
(globalThis as typeof globalThis & { __neerRoot?: Root }).__neerRoot = appRoot;
appRoot.render(<StrictMode><Root /></StrictMode>);
