import { createRoot } from 'react-dom/client';
import WelcomeScreen from './WelcomeScreen';
import './app.js';

// Declare custom window variables for typescript compiling
declare global {
  interface Window {
    startOrbixApp?: () => Promise<void>;
  }
}

const welcomeEl = document.getElementById('welcome-root');
if (welcomeEl) {
  const root = createRoot(welcomeEl);
  root.render(<WelcomeScreen />);
}
