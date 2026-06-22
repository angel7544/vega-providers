import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Download, 
  CheckCircle2, 
  FolderOpen,
  Power,
  MonitorPlay,
  Database,
  History,
  RefreshCw,
  Terminal,
  Users,
  Heart,
  BadgeCheck,
  Trash2,
  ChevronDown
} from 'lucide-react';
import { LogLine } from './components/LogsPanel';
import './index.css';

interface InstallationInfo {
  exists: boolean;
  path: string;
}

interface DownloadProgressPayload {
  file_type: string;
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  speed: number;
  eta: number;
}

interface LocalManifestInfo {
  version: string;
  providers_count: number;
}



function App() {
  const [installInfo, setInstallInfo] = useState<InstallationInfo>({ exists: false, path: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'extracting' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<DownloadProgressPayload | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [latestVersion, setLatestVersion] = useState<string>('Fetching...');
  const [localVersion, setLocalVersion] = useState<string>('Ready');
  const [lastCommit, setLastCommit] = useState<string | null>(null);

  const addLog = (text: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { timestamp: time, text, type }]);
  };

  const fetchGithubInfo = async () => {
    try {
      addLog('Checking for updates...', 'info');
      const response = await fetch("https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/manifest.json", { cache: "no-cache" });
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        let maxVersionNum = 0;
        let maxVersionStr = "0.0";
        data.forEach(provider => {
          if (provider.version) {
            const v = parseFloat(provider.version);
            if (!isNaN(v) && v > maxVersionNum) {
              maxVersionNum = v;
              maxVersionStr = provider.version;
            }
          }
        });
        setLatestVersion(`v${maxVersionStr} (${data.length} Providers)`);
        addLog(`Latest version: v${maxVersionStr}`, 'info');
      }
    } catch (err) {
      addLog(`Failed to fetch provider manifest: ${err}`, 'warning');
      setLatestVersion("Unknown");
    }

    try {
      addLog('Fetching latest repository commit info...', 'info');
      const commitRes = await fetch("https://api.github.com/repos/Zenda-Cross/vega-providers/commits?per_page=1", { cache: "no-cache" });
      const commits = await commitRes.json();
      if (Array.isArray(commits) && commits.length > 0) {
        const msg = commits[0].commit.message.split('\n')[0];
        setLastCommit(msg);
        addLog(`Latest commit: ${msg}`, 'success');
      } else if (commits.message) {
        addLog(`GitHub API: ${commits.message}`, 'warning');
        setLastCommit("API Rate Limited");
      }
    } catch (err) {
      addLog(`Failed to fetch commit info: ${err}`, 'warning');
      setLastCommit("Error Fetching");
    }
  };

  const checkInstall = async () => {
    try {
      const info: InstallationInfo = await invoke('detect_installation');
      setInstallInfo(info);
      if (info.exists) {
        try {
          const localInfo = await invoke<LocalManifestInfo>('verify_local_manifest');
          setLocalVersion(`v${localInfo.version} (${localInfo.providers_count} Providers)`);
          addLog(`Current version: v${localInfo.version}`, 'info');
        } catch (e) {
          addLog(`Current version: Ready`, 'info');
        }
      }
    } catch (err) {
      addLog(`Error detecting installation: ${err}`, 'error');
    }
  };

  const checkAllUpdates = async () => {
    await checkInstall();
    await fetchGithubInfo();
    addLog(`All systems are up to date.`, 'success');
  }

  useEffect(() => {
    checkAllUpdates();
  }, []);

  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<DownloadProgressPayload>('download-progress', (event) => {
        setProgress(event.payload);
      });
      return unlisten;
    };
    
    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setStatus('downloading');
    setProgress(null);
    addLog('Preparing for update...', 'info');

    try {
      const killed: string[] = await invoke('kill_processes');
      if (killed.length > 0) {
        addLog(`Terminated processes: ${killed.join(', ')}`, 'warning');
      }

      addLog('Starting download from GitHub repository...', 'info');
      const zipPath: string = await invoke('download_repo_zip');
      addLog(`Download complete. Saved to temporary location.`, 'success');
      
      setStatus('extracting');
      addLog('Backing up old files and extracting new update...', 'info');
      await invoke('backup_and_extract_repo_zip', { zipPath });
      
      addLog('Verifying local installation...', 'info');
      const localInfo = await invoke<LocalManifestInfo>('verify_local_manifest');
      addLog(`All systems are up to date.`, 'success');
      setLocalVersion(`v${localInfo.version} (${localInfo.providers_count} Providers)`);

      setStatus('success');
      
    } catch (err) {
      console.error(err);
      setStatus('error');
      addLog(`Update failed: ${err}`, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenFolder = async (type: "install" | "backup") => {
    try {
      await invoke('open_folder', { folderType: type });
    } catch (err) {
      addLog(`Failed to open folder: ${err}`, 'error');
    }
  };

  const handleLaunchApp = async (type: "orbix" | "server") => {
    try {
      addLog(`Launching ${type}...`, 'info');
      await invoke('launch_app', { appType: type });
    } catch (err) {
      addLog(`Failed to launch process: ${err}`, 'error');
    }
  };

  const handleKillProcesses = async () => {
    try {
      const killed: string[] = await invoke('kill_processes');
      if (killed.length > 0) {
        addLog(`Terminated processes: ${killed.join(', ')}`, 'success');
      } else {
        addLog('No blocking processes found.', 'info');
      }
    } catch (err) {
      addLog(`Failed to kill processes: ${err}`, 'error');
    }
  };

  const handleRestore = async () => {
    try {
      addLog('Restoring files from backup directory...', 'warning');
      await invoke('restore_backup');
      addLog('Backup restored successfully!', 'success');
      checkInstall();
    } catch (err) {
      addLog(`Failed to restore backup: ${err}`, 'error');
    }
  };

  const handleClearCache = async () => {
    try {
      addLog('Clearing updater cache and temp files...', 'warning');
      await invoke('clear_cache');
      addLog('Cache cleared successfully!', 'success');
    } catch (err) {
      addLog(`Failed to clear cache: ${err}`, 'error');
    }
  };

  const providersCount = localVersion.includes('Providers') ? localVersion.match(/\d+/) : "0";
  const mainVersionStr = localVersion.split(' ')[0] !== 'Ready' ? localVersion.split(' ')[0] : 'v0.0';

  return (
    <div className="app-container">
      <div className="layout-grid">
        
        {/* LEFT MAIN COLUMN */}
        <div className="main-column">
          
          {/* HERO CARD */}
          <div className="hero-card glass-panel">
            <div className="hero-left">
              <div className="server-icon-ring">
                <Database size={36} className="hero-icon" />
                <div className="status-badge-icon">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <div className="hero-title-group">
                <h2>Vega Server Online</h2>
                <span className="hero-subtitle">Current Version {mainVersionStr}</span>
                <span className="pill-stable">Stable Release</span>
              </div>
            </div>
            <div className="hero-right">
              <div className="status-list">
                <div className="status-item"><CheckCircle2 size={16} className="status-check" /> Installation Detected</div>
                <div className="status-item"><CheckCircle2 size={16} className="status-check" /> Providers Verified ({providersCount})</div>
                <div className="status-item"><CheckCircle2 size={16} className="status-check" /> Server Ready</div>
                <div className="status-item"><CheckCircle2 size={16} className="status-check" /> Desktop Player Ready</div>
              </div>
            </div>
          </div>

          {/* UPDATE CENTER CARD */}
          <div className="update-center-card glass-panel">
            <div className="card-header">
              <div className="card-title">
                <RefreshCw size={18} className="card-icon" />
                <h3>UPDATE CENTER</h3>
              </div>
              <button className="btn-outline-small" onClick={checkAllUpdates}>
                <RefreshCw size={14} /> Check for Updates
              </button>
            </div>
            
            <div className="update-grid">
              <div className="grid-cell"><span className="cell-label">Current Build</span><span className="cell-value">{mainVersionStr}</span></div>
              <div className="grid-cell"><span className="cell-label">Latest Build</span><span className="cell-value">{latestVersion.split(' ')[0]}</span></div>
              <div className="grid-cell"><span className="cell-label">Providers Installed</span><span className="cell-value">{providersCount}</span></div>
              <div className="grid-cell"><span className="cell-label">Last Commit</span><span className="cell-value commit-link">{lastCommit || "Fetching..."}</span></div>
              <div className="grid-cell"><span className="cell-label">Backup Status</span><span className="cell-value text-success">Ready</span></div>
              <div className="grid-cell"><span className="cell-label">Update Channel</span><span className="cell-value"><span className="pill-stable-small">Stable</span></span></div>
              <div className="grid-cell"><span className="cell-label">Install Location</span><span className="cell-value">{installInfo.path ? "Orbix Suite" : "Not Found"}</span></div>
              <div className="grid-cell"><span className="cell-label">Last Checked</span><span className="cell-value">Today, {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>

            {(status === 'downloading' || status === 'extracting') && (
              <div className="progress-section" style={{ marginTop: '1.5rem', padding: '0 1rem' }}>
                <div className="progress-info" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  <span>{status === 'downloading' ? 'Downloading Repository Archive...' : 'Extracting & Applying Update...'}</span>
                  <span>{progress ? `${progress.progress.toFixed(1)}%` : '0%'}</span>
                </div>
                <div className="progress-bar-bg" style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div className="progress-bar-fill" style={{ height: '100%', backgroundColor: 'var(--color-primary)', width: `${progress ? progress.progress : 0}%`, transition: 'width 0.2s' }}></div>
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="actions-wrapper">
            <button className="btn-action btn-primary" onClick={handleUpdate} disabled={!installInfo.exists || isUpdating}>
              <Download size={18} /> Check & Download<br/>Update
            </button>
            <button className="btn-action btn-success" onClick={() => handleLaunchApp('orbix')} disabled={!installInfo.exists}>
              <MonitorPlay size={18} /> Launch<br/>Orbix
            </button>
            <button className="btn-action btn-success-dark" onClick={() => handleLaunchApp('server')} disabled={!installInfo.exists}>
              <Database size={18} /> Launch<br/>OrbixServer
            </button>
            <button className="btn-action btn-danger" onClick={handleKillProcesses}>
              <Power size={18} /> Kill<br/>Processes
            </button>
            <button className="btn-action btn-outline" onClick={() => handleOpenFolder('install')} disabled={!installInfo.exists}>
              <FolderOpen size={18} /> Open<br/>Install
            </button>
            <button className="btn-action btn-outline" onClick={() => handleOpenFolder('backup')} disabled={!installInfo.exists}>
              <FolderOpen size={18} /> Open<br/>Backup
            </button>
            <button className="btn-action btn-warning" onClick={handleRestore} disabled={!installInfo.exists}>
              <History size={18} /> Restore<br/>Backup
            </button>
            <button className="btn-action btn-danger-dark" onClick={handleClearCache}>
              <Trash2 size={18} /> Clear Cache
            </button>
          </div>

          {/* LOGS PANEL */}
          <div className="logs-card glass-panel">
            <div className="card-header">
              <div className="card-title">
                <Terminal size={18} className="card-icon" />
                <h3>SYSTEM CONSOLE LOGS</h3>
              </div>
              <div className="logs-actions">
                <span className="view-full-logs" onClick={() => setLogs([])} style={{ cursor: 'pointer' }}>Clear Logs <Trash2 size={14} /></span>
              </div>
            </div>
            <div className="logs-container-inner">
              {logs.map((log, index) => (
                <div key={index} className="log-line">
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-text log-${log.type}`}>{log.text}</span>
                </div>
              ))}
              <div className="logs-fade-bottom"><ChevronDown size={16} /></div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="sidebar-column">
          
          {/* CONTRIBUTORS CARD */}
          <div className="side-card glass-panel">
            <div className="side-card-header">
              <Users size={16} /> DEVELOPERS & CONTRIBUTORS
            </div>
            
            <div className="dev-list">
              <div className="dev-item">
                <div className="dev-avatar"><img src="https://api.dicebear.com/7.x/bottts/svg?seed=Zenda" alt="Zenda-X" /></div>
                <div className="dev-info">
                  <h4>Zenda-X <BadgeCheck size={14} className="verified-badge" /></h4>
                  <p>Vega Server Architecture</p>
                </div>
              </div>
              <div className="dev-item">
                <div className="dev-avatar"><img src="https://api.dicebear.com/7.x/bottts/svg?seed=8man" alt="8man" /></div>
                <div className="dev-info">
                  <h4>8man <BadgeCheck size={14} className="verified-badge" /></h4>
                  <p>Provider Infrastructure & Maintenance</p>
                </div>
              </div>
              <div className="dev-item">
                <div className="dev-avatar"><img src="https://api.dicebear.com/7.x/bottts/svg?seed=Angel" alt="Angel" /></div>
                <div className="dev-info">
                  <h4>Angel (Mehul Singh) <BadgeCheck size={14} className="verified-badge" /></h4>
                  <ul className="dev-tasks">
                    <li>Orbix Desktop Player</li>
                    <li>Vega Desktop Server Integration</li>
                    <li>Windows Distribution & Patcher</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* THANKS CARD */}
          <div className="side-card glass-panel">
            <div className="side-card-header">
              <Heart size={16} className="heart-icon" /> THANKS TO TEAM VEGA
            </div>
            <div className="thanks-content">
              <p>A huge thanks to <strong>Team Vega</strong> for maintaining the provider infrastructure and server ecosystem that powers OrbixPlay Desktop.</p>
              <p style={{marginTop: '1rem'}}>Special appreciation to:</p>
              <div className="pill-group">
                <span className="pill-tag text-blue">Zenda-Cross</span>
                <span className="pill-tag text-cyan">8man</span>
                <span className="pill-tag text-purple">BR31 Technologies</span>
                <span className="pill-tag text-gold">Angel (Mehul Singh)</span>
              </div>
              <p style={{marginTop: '1rem'}}>For development, testing, desktop integration, patch deployment and continuous improvements to the OrbixPlay ecosystem.</p>
              <p style={{marginTop: '1rem'}}>Together, we build the future. <Heart size={14} fill="currentColor" className="heart-icon-small" /></p>
            </div>
          </div>
          
          <footer className="footer-centered">
            <p>Powered by Vega Server Infrastructure<br/>Desktop Integration by BR31</p>
            <p className="footer-copyright">© 2026 OrbixPlay • Vega Team • BR31 Technologies.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
