import { useState, useEffect } from 'react';
import { ServerCrash, RefreshCw, Save, CheckCircle2, Loader2, Info } from 'lucide-react';
// @ts-expect-error db.js is a plain JavaScript module
import db from './db.js';
import { invoke } from '@tauri-apps/api/core';

interface WelcomeScreenProps {}

export default function WelcomeScreen({}: WelcomeScreenProps) {
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
  const [apiUrl, setApiUrl] = useState<string>('http://localhost:3001');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [fadeOut, setFadeOut] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(true);

  // Initialize DB and fetch API URL on mount
  useEffect(() => {
    const initWelcome = async () => {
      try {
        await db.init();
        const savedUrl = db.get('vega_api_url', 'http://localhost:3001');
        setApiUrl(savedUrl);
        
        // Clear webview localStorage and sessionStorage cache on startup
        try {
          await invoke('clear_cache');
        } catch (e) {
          console.warn('Failed to clear cache via Tauri, doing direct clear:', e);
          localStorage.clear();
          sessionStorage.clear();
        }

        // Initial server check
        let isUp = await checkServer(savedUrl);
        if (isUp) {
          handleSuccess();
        } else {
          // Automatic fallback check between default servers
          let fallbackUrl = '';
          if (savedUrl === 'http://localhost:3001') {
            fallbackUrl = 'https://ottpatna.vercel.app';
          } else if (savedUrl === 'https://ottpatna.vercel.app') {
            fallbackUrl = 'http://localhost:3001';
          }
          
          if (fallbackUrl) {
            console.log(`Primary server offline. Trying fallback server: ${fallbackUrl}...`);
            const fallbackUp = await checkServer(fallbackUrl);
            if (fallbackUp) {
              setApiUrl(fallbackUrl);
              await db.set('vega_api_url', fallbackUrl);
              handleSuccess();
              return;
            }
          }
          setStatus('failed');
        }
      } catch (err) {
        console.error('Error during welcome init:', err);
        setStatus('failed');
      }
    };
    initWelcome();
  }, []);

  const checkServer = async (url: string): Promise<boolean> => {
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`${cleanUrl}/manifest.json`, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch (err) {
      clearTimeout(id);
      return false;
    }
  };

  const handleSuccess = () => {
    setStatus('success');
    // Wait for the success animation, then fade out and launch main app
    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        // Launch main app
        const mainApp = document.getElementById('orbix-main-app');
        if (mainApp) {
          mainApp.style.display = 'block';
          // Force layout reflow
          mainApp.offsetHeight;
          mainApp.style.opacity = '1';
        }
        
        // Execute the Vanilla app init
        if (window.startOrbixApp) {
          window.startOrbixApp();
        }
        
        // Unmount React welcome screen
        setIsMounted(false);
      }, 500); // Wait for fadeOut transition to complete
    }, 1000); // Delay to show success screen
  };

  const handleRetry = async (urlToCheck = apiUrl) => {
    setIsRetrying(true);
    setStatus('checking');
    const isUp = await checkServer(urlToCheck);
    setIsRetrying(false);
    
    if (isUp) {
      handleSuccess();
    } else {
      setStatus('failed');
    }
  };

  const handleSaveAndConnect = async () => {
    setIsRetrying(true);
    try {
      // Save new API URL to the JSON DB
      await db.set('vega_api_url', apiUrl);
      await handleRetry(apiUrl);
    } catch (err) {
      console.error('Failed to save API URL:', err);
      setIsRetrying(false);
      setStatus('failed');
    }
  };

  if (!isMounted) return null;

  return (
    <div className={`welcome-wrapper ${fadeOut ? 'fade-out' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .welcome-wrapper {
          position: fixed;
          inset: 0;
          background: #070709;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #f8fafc;
          transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.5s;
          overflow: hidden;
        }
        .welcome-wrapper.fade-out {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        .welcome-bg-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(147, 51, 234, 0.15) 0%, rgba(236, 72, 153, 0.05) 50%, transparent 100%);
          filter: blur(60px);
          animation: floatGlow 10s ease-in-out infinite alternate;
          z-index: 1;
        }
        @keyframes floatGlow {
          0% { transform: translate(-10%, -10%) scale(1); }
          100% { transform: translate(10%, 10%) scale(1.2); }
        }
        .welcome-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 480px;
          padding: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .welcome-logo-container {
          position: relative;
          width: 110px;
          height: 110px;
          margin-bottom: 24px;
        }
        .welcome-logo-ring {
          position: absolute;
          inset: -4px;
          border-radius: 28px;
          background: linear-gradient(135deg, #a855f7, #ec4899);
          opacity: 0.8;
          z-index: 1;
        }
        .welcome-logo-ring-pulse {
          position: absolute;
          inset: -8px;
          border-radius: 32px;
          background: linear-gradient(135deg, #a855f7, #ec4899);
          opacity: 0.3;
          filter: blur(8px);
          animation: ringPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          z-index: 0;
        }
        @keyframes ringPulse {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.08); opacity: 0.45; }
        }
        .welcome-logo-img {
          position: absolute;
          inset: 4px;
          background: #0e0e13;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .welcome-logo-img img {
          width: 64px;
          height: 64px;
          border-radius: 12px;
        }
        .welcome-title {
          font-family: 'Outfit', sans-serif;
          font-size: 36px;
          font-weight: 800;
          margin: 0 0 6px 0;
          background: linear-gradient(135deg, #a855f7, #ec4899);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.03em;
        }
        .welcome-subtitle {
          font-size: 14px;
          color: #94a3b8;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-bottom: 40px;
        }
        .welcome-status-box {
          width: 100%;
          min-height: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .welcome-spinner-ring {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(147, 51, 234, 0.1);
          border-top: 3px solid #9333ea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .welcome-status-text {
          font-size: 15px;
          font-weight: 500;
          color: #cbd5e1;
        }
        .welcome-success-icon {
          color: #22c55e;
          animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          margin-bottom: 16px;
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .welcome-error-panel {
          width: 100%;
          background: rgba(239, 68, 68, 0.04);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 16px;
          padding: 24px;
          backdrop-filter: blur(10px);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .welcome-error-title {
          font-family: 'Outfit', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #f87171;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .welcome-error-desc {
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.6;
          margin-bottom: 20px;
        }
        .welcome-input-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .welcome-input-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .welcome-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 14px;
          font-family: monospace;
          font-size: 13px;
          color: #f8fafc;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .welcome-input:focus {
          border-color: #9333ea;
          box-shadow: 0 0 0 3px rgba(147, 51, 234, 0.2);
        }
        .welcome-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .welcome-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .welcome-btn-primary {
          background: #9333ea;
          color: #ffffff;
        }
        .welcome-btn-primary:hover:not(:disabled) {
          background: #a855f7;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(147, 51, 234, 0.3);
        }
        .welcome-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .welcome-btn-secondary:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          transform: translateY(-1px);
        }
        .welcome-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .welcome-tips {
          margin-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 12px;
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-size: 11px;
          color: #94a3b8;
          text-align: left;
          line-height: 1.4;
        }
      `}} />

      <div className="welcome-bg-glow" />

      <div className="welcome-content">
        <div className="welcome-logo-container">
          <div className="welcome-logo-ring-pulse" />
          <div className="welcome-logo-ring" />
          <div className="welcome-logo-img">
            <img src="icon.png" alt="OrbixPlay" />
          </div>
        </div>

        <h1 className="welcome-title">OrbixPlay</h1>
        <div className="welcome-subtitle">Entertainment World</div>

        <div className="welcome-status-box">
          {status === 'checking' && (
            <>
              <div className="welcome-spinner-ring" />
              <div className="welcome-status-text">
                {isRetrying ? 'Retrying connection...' : 'Scanning backend service...'}
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="welcome-success-icon" size={36} />
              <div className="welcome-status-text">Server connected. Loading...</div>
            </>
          )}

          {status === 'failed' && (
            <div className="welcome-error-panel">
              <div className="welcome-error-title">
                <ServerCrash size={20} />
                Error: Server Offline
              </div>
              <div className="welcome-error-desc">
                Cannot connect to the backend server. Make sure your local API server is running.
              </div>

              <div className="welcome-input-group">
                <label className="welcome-input-label">API Base URL</label>
                <input
                  type="text"
                  className="welcome-input"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={isRetrying}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button 
                    type="button"
                    className="welcome-btn welcome-btn-secondary"
                    style={{ flex: 1, fontSize: '11px', padding: '6px 12px' }}
                    onClick={async () => {
                      setApiUrl('http://localhost:3001');
                      await handleRetry('http://localhost:3001');
                    }}
                    disabled={isRetrying}
                  >
                    Local (3001)
                  </button>
                  <button 
                    type="button"
                    className="welcome-btn welcome-btn-secondary"
                    style={{ flex: 1, fontSize: '11px', padding: '6px 12px' }}
                    onClick={async () => {
                      setApiUrl('https://ottpatna.vercel.app');
                      await handleRetry('https://ottpatna.vercel.app');
                    }}
                    disabled={isRetrying}
                  >
                    Cloud (Vercel)
                  </button>
                </div>
              </div>

              <div className="welcome-actions">
                <button
                  className="welcome-btn welcome-btn-secondary"
                  onClick={() => handleRetry()}
                  disabled={isRetrying}
                >
                  {isRetrying ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                  Retry
                </button>
                <button
                  className="welcome-btn welcome-btn-primary"
                  onClick={handleSaveAndConnect}
                  disabled={isRetrying}
                >
                  {isRetrying ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Save & Retry
                </button>
              </div>

              <div className="welcome-tips">
                <Info size={16} className="text-purple-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> The default backend is usually <code>http://localhost:3001</code>.
                  Ensure you launched the server manager and that port 3001 is active.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
