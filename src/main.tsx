import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiSessionGate } from './components/auth/ApiSessionGate';
import './index.css';

function Root() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    // App/storage are imported only after API data has been written to local storage,
    // allowing the legacy synchronous store to start with the authenticated snapshot.
    import('./components/auth/ApiSessionGate').then(() => {
      import('./App').then((module) => setApp(() => module.default));
    });
  }, []);
  return <ApiSessionGate>{App ? <App /> : <div className="min-h-screen bg-[#EAF0EC]" />}</ApiSessionGate>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
