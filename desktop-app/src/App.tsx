import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, ExternalLink, Play, Square, Info, X, Package, CheckCircle, Sun, Moon, Code, User, Mail, Activity, PowerOff, RefreshCw, Download, Stethoscope, Globe, Clock, MoreVertical, HelpCircle, Link as LinkIcon, Shield } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

interface LogEntry {
  time: string;
  type: string;
  message: string;
}


// Fallback for browser testing
const safeInvoke = async (cmd: string, args?: any) => {
  try {
    return await invoke(cmd, args);
  } catch (e) {
    console.warn(`Mocking invoke for ${cmd} due to missing Tauri backend.`);
    if (cmd === 'get_local_ip') return '127.0.0.1';
    if (cmd === 'get_stats') return { cpu: 12, ram_mb: 220 };
    if (cmd === 'check_files') return true;
    return null;
  }
};

function App() {
  const [status, setStatus] = useState<'Stopped' | 'Starting' | 'Running'>('Stopped');
  const [uptime, setUptime] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  
  const [ip, setIp] = useState('127.0.0.1');
  const [targetPort, setTargetPort] = useState(3001);
  const [stats, setStats] = useState({ cpu: 0, ram_mb: 0 });
  const [showFaq, setShowFaq] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    // Initial fetches
    safeInvoke('get_local_ip').then((res: any) => setIp(res));
    safeInvoke('check_files').then((res: any) => {
      if (!res) addLog('ERROR', 'Missing required files (package.json, dev-server.js, providers)');
    });

    // Listen to logs from Rust backend
    const unlistenServer = listen<{line: string}>('server-log', (event) => {
      const line = event.payload.line;
      let type = 'INFO';
      if (line.toLowerCase().includes('error')) type = 'ERROR';
      else if (line.toLowerCase().includes('warn')) type = 'WARNING';
      else if (line.toLowerCase().includes('ready') || line.toLowerCase().includes('success')) {
        type = 'SUCCESS';
        if (line.toLowerCase().includes('ready')) setStatus('Running');
      }
      else if (line.toLowerCase().includes('client')) type = 'CLIENT';
      addLog(type, line);
    });

    const unlistenNpm = listen<{line: string}>('npm-log', (event) => {
      addLog('INFO', `[NPM] ${event.payload.line}`);
    });

    const unlistenNpmFinished = listen('npm-finished', () => {
      addLog('SUCCESS', 'NPM Install finished');
    });

    return () => {
      unlistenServer.then(f => f());
      unlistenNpm.then(f => f());
      unlistenNpmFinished.then(f => f());
    };
  }, []);

  // Uptime and stats polling
  useEffect(() => {
    let interval: number;
    if (status === 'Running') {
      interval = window.setInterval(() => {
        setUptime((prev) => prev + 1);
        safeInvoke('get_stats').then((res: any) => setStats(res));
      }, 1000);
    } else {
      setUptime(0);
      setStats({ cpu: 0, ram_mb: 0 });
    }
    return () => clearInterval(interval);
  }, [status]);

  const addLog = (type: string, message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev, { time, type, message }]);
  };



  const handleStart = async () => {
    const hasFiles = await safeInvoke('check_files');
    if (!hasFiles) {
      addLog('ERROR', 'Cannot start: Missing required files in parent directory.');
      return;
    }
    setStatus('Starting');
    addLog('INFO', `Starting server on port ${targetPort}...`);
    await safeInvoke('kill_port', { port: targetPort });
    await safeInvoke('start_server', { port: targetPort });
    
    // For mock fallback
    setTimeout(() => {
      setStatus('Running');
      addLog('SUCCESS', `Server ready on port ${targetPort}`);
    }, 2000);
  };

  const handleStop = async () => {
    await safeInvoke('stop_server');
    setStatus('Stopped');
    addLog('INFO', 'Server stopped');
  };

  const handleNpmInstall = async () => {
    addLog('INFO', 'Running npm install...');
    await safeInvoke('npm_install');
  };

  const handleCheckFiles = async () => {
    const res = await safeInvoke('check_files');
    if (res) {
      addLog('SUCCESS', 'File check passed.');
    } else {
      addLog('ERROR', 'File check failed. Missing package.json, dev-server.js or providers.');
    }
  };

  const handleListNodeServers = async () => {
    addLog('CLIENT', '> Listing Node.js processes...');
    try {
      await safeInvoke('run_terminal_command', { commandStr: 'tasklist /FI "IMAGENAME eq node.exe"' });
    } catch (err: any) {
      addLog('ERROR', `Failed to list node processes: ${err.toString()}`);
    }
  };

  const handleKillNodeServers = async () => {
    addLog('CLIENT', '> Killing all Node.js processes...');
    try {
      await safeInvoke('run_terminal_command', { commandStr: 'taskkill /F /IM node.exe /T' });
      addLog('SUCCESS', 'Sent kill signal to Node.js processes.');
      if (status !== 'Stopped') {
        handleStop();
      }
    } catch (err: any) {
      addLog('ERROR', `Failed to kill node processes: ${err.toString()}`);
    }
  };

  const handleDiagnostics = async () => {
    addLog('CLIENT', '> Running Diagnostics...');
    await safeInvoke('run_terminal_command', { commandStr: 'node -v' });
    await safeInvoke('run_terminal_command', { commandStr: 'npm -v' });
    await handleCheckFiles();
  };

  const handleRestart = async () => {
    addLog('CLIENT', '> Restarting Server...');
    if (status !== 'Stopped') {
      await handleStop();
    }
    setTimeout(() => {
      handleStart();
    }, 1000);
  };

  const handleExportLogs = () => {
    const text = logs.map(l => `[${l.time}] [${l.type}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'server-logs.txt';
    a.click();
    URL.revokeObjectURL(url);
    addLog('SUCCESS', 'Logs exported successfully.');
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput.trim();
    if (!cmd) return;
    
    addLog('CLIENT', `> ${cmd}`);
    setCommandInput('');
    
    const lowerCmd = cmd.toLowerCase();
    if (lowerCmd === 'clear') {
      setLogs([]);
      return;
    } else if (lowerCmd === 'stop') {
      if (status !== 'Stopped') handleStop();
      else addLog('WARNING', 'Server is already stopped.');
      return;
    } else if (lowerCmd === 'start') {
      if (status === 'Stopped') handleStart();
      else addLog('WARNING', 'Server is already running.');
      return;
    } else if (lowerCmd === 'help') {
      addLog('INFO', 'Supported commands: start, stop, clear, help');
      setShowFaq(true);
      return;
    }
    
    try {
      await safeInvoke('run_terminal_command', { commandStr: cmd });
    } catch (err: any) {
      addLog('ERROR', `Command failed: ${err.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      addLog('CLIENT', '^C (Interrupt)');
      if (status !== 'Stopped') {
        handleStop();
      } else {
        addLog('INFO', 'Server is already stopped.');
      }
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`http://${ip}:${targetPort}`);
    addLog('SUCCESS', 'Copied URL to clipboard');
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    if (status === 'Running') return '#3fb950';
    if (status === 'Starting') return '#d29922';
    return '#f85149';
  };

  const getLogColorClass = (type: string) => {
    switch (type) {
      case 'INFO': return 'log-info';
      case 'ERROR': return 'log-error';
      case 'WARNING': return 'log-warning';
      case 'SUCCESS': return 'log-success';
      case 'CLIENT': return 'log-client';
      case 'STREAM': return 'log-stream';
      default: return 'log-info';
    }
  };

  return (
    <div className="app-container">
      <div className="title-bar">
        <div className="title-bar-left" style={{ paddingLeft: '15px', gap: '8px' }}>
          <button className="mac-control close-btn" onClick={() => getCurrentWindow().close()} title="Close" />
          <button className="mac-control minimize" onClick={() => getCurrentWindow().minimize()} title="Minimize" />
          <button className="mac-control maximize" onClick={() => getCurrentWindow().toggleMaximize()} title="Maximize" />
        </div>
        <div className="title-bar-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} data-tauri-drag-region>
          <img src="/logo.png" alt="OrbiPlay Logo" style={{ width: '24px', height: '24px', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)', pointerEvents: 'none' }}>OrbixPlay Vega Provider Server</div>
        </div>
        <div className="title-bar-right" style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '15px' }}>
          <button className="accent title-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button className="accent title-btn" onClick={() => setShowFaq(true)}>
            <Info size={14} /> Help & Info
          </button>
        </div>
      </div>
      <div className="main-content">

        <div className="content-split" style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="left-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', paddingRight: '5px' }}>
            <div className="top-row">
              <div className="card status-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: '0 0 320px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: status === 'Running' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: getStatusColor() }} />
                    </div>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>Server Status</span>
                  </div>
                  <MoreVertical size={16} color="var(--text-subtitle)" style={{ cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: getStatusColor(), lineHeight: 1 }}>{status}</div>
                    <div style={{ backgroundColor: status === 'Running' ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)', color: getStatusColor(), padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', width: 'fit-content' }}>
                      {status === 'Running' ? 'Running' : 'Not Running'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Clock size={16} color="var(--text-subtitle)" />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-subtitle)' }}>Uptime</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontFamily: 'monospace' }}>{formatUptime(uptime)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: '20px', marginTop: 'auto' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', borderRight: '1px solid var(--border)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={16} color="var(--text-subtitle)" fill="currentColor" />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-subtitle)' }}>Last Start</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 'bold' }}>--</span>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Square size={16} color="var(--text-subtitle)" fill="currentColor" />
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-subtitle)' }}>Status</span>
                    <span style={{ fontSize: '0.9rem', color: getStatusColor(), fontWeight: 'bold' }}>{status === 'Running' ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>

              <div className="card url-card" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(47, 129, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Globe size={18} color="#2f81f7" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1rem' }}>Public URL & Port</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-subtitle)' }}>Access your server using the URL or scan the QR code.</span>
                    </div>
                  </div>
                  <HelpCircle size={16} color="var(--text-subtitle)" style={{ cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 15px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--bg-main)' }}>
                    <LinkIcon size={16} color="var(--text-subtitle)" />
                    <input type="text" readOnly value={`http://${ip}:${targetPort}`} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '30px', alignItems: 'center', marginTop: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', paddingLeft: '10px' }}>
                    <div style={{ padding: '15px', border: '2px solid rgba(47, 129, 247, 0.5)', borderRadius: '12px', backgroundColor: 'white' }}>
                      <QRCodeSVG value={`http://${ip}:${targetPort}/web/index.html`} size={110} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', width: '100%' }}>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-subtitle)' }}>Scan to connect</span>
                      <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, justifyContent: 'center', paddingRight: '10px' }}>
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 15px', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--bg-main)' }}>
                      <Shield size={16} color="var(--text-subtitle)" />
                      <input type="number" value={targetPort} onChange={(e) => setTargetPort(Number(e.target.value))} disabled={status !== 'Stopped'} style={{ flex: 1, width: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem' }} title="Port" />
                    </div>
                    <button onClick={handleCopyUrl} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #2f81f7', backgroundColor: 'transparent', color: '#2f81f7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(47, 129, 247, 0.1)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <Copy size={16} /> Copy
                    </button>
                    <button onClick={async () => {
                      try {
                        await openUrl(`http://${ip}:${targetPort}/web/index.html`);
                      } catch (e) {
                        window.open(`http://${ip}:${targetPort}/web/index.html`, '_blank');
                      }
                    }} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#2f81f7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 12px rgba(47, 129, 247, 0.3)' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f6feb'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2f81f7'}>
                      <ExternalLink size={16} /> Open Portal
                    </button>
                  </div>
                </div>
              </div>
            </div>

        <div>
          <div className="title">Media Server Actions</div>
          <div className="quick-actions-grid">
            <button className={`action-button ${status === 'Stopped' ? 'primary' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleStart} disabled={status !== 'Stopped'}>
              <Play size={18} fill="currentColor" /> Start Server
            </button>
            <button className={`action-button ${status === 'Running' ? 'danger' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleStop} disabled={status === 'Stopped'}>
              <Square size={18} fill="currentColor" /> Stop Server
            </button>
            <button className="action-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleRestart} disabled={status === 'Stopped'}>
              <RefreshCw size={18} /> Restart Server
            </button>
            <button className="action-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleDiagnostics}>
              <Stethoscope size={18} /> Run Diagnostics
            </button>
            <button className="action-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleNpmInstall}>
              <Package size={18} /> Install Dependencies
            </button>
            <button className="action-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleCheckFiles}>
              <CheckCircle size={18} /> Verify Content Files
            </button>
            <button className="action-button" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleListNodeServers}>
              <Activity size={18} /> List Node Servers
            </button>
            <button className="action-button danger" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleKillNodeServers}>
              <PowerOff size={18} /> Kill All Node Servers
            </button>
          </div>
        </div>

        <div>
          <div className="title">Entertainment Server Stats</div>
          <div className="stats-row">
            <div className="card stat-card">
              <span className="subtitle">CPU Usage</span>
              <span className="value-text">{stats.cpu.toFixed(1)}%</span>
            </div>
            <div className="card stat-card">
              <span className="subtitle">RAM Usage</span>
              <span className="value-text">{stats.ram_mb} MB</span>
            </div>
            <div className="card stat-card">
              <span className="subtitle">Active Users</span>
              <span className="value-text">{status === 'Running' ? '16' : '0'}</span>
            </div>
            <div className="card stat-card">
              <span className="subtitle">Active Streams</span>
              <span className="value-text">{status === 'Running' ? '8' : '0'}</span>
            </div>
          </div>
          
          <div className="developer-info" style={{ marginTop: 'auto', padding: '15px', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-card)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
            
            <div style={{ color: 'var(--text-subtitle)', marginBottom: '10px' }}>Developed by Angel Singh</div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <a href="#" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); openUrl('https://github.com/angelsingh'); }}><Code size={14} /> GitHub</a>
              <a href="#" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); openUrl('https://linkedin.com/in/angelsingh'); }}><User size={14} /> LinkedIn</a>
              <a href="#" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); openUrl('mailto:angel@orbixplay.com'); }}><Mail size={14} /> Email</a>
            </div>
          </div>
          
          </div>
          </div>

          <div className="right-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
            <div className="main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card logs-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="logs-header">
              <span className="subtitle">Live Streaming Logs</span>
              <div className="logs-header-actions" style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleExportLogs} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Export
                </button>
                <button onClick={() => setAutoScroll(!autoScroll)}>
                  Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => setLogs([])}>Clear</button>
              </div>
            </div>
            <div className="terminal" ref={terminalRef}>
              {logs.map((log, i) => (
                <div key={i} className="log-line">
                  <span className="log-time">[{log.time}]</span>
                  <span className={getLogColorClass(log.type)}>[{log.type}]</span>{' '}
                  <span style={{ color: 'var(--text-main)' }}>{log.message}</span>
                </div>
              ))}
            </div>
            <div className="terminal-input-container" style={{ display: 'flex', borderTop: '1px solid var(--border)', padding: '10px', backgroundColor: 'var(--bg-terminal)' }}>
              <span style={{ color: 'var(--text-subtitle)', marginRight: '10px', display: 'flex', alignItems: 'center', fontFamily: 'Consolas, monospace' }}>$</span>
              <form onSubmit={handleCommandSubmit} style={{ flex: 1, display: 'flex' }}>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontFamily: 'Consolas, Courier New, monospace',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                  placeholder="Enter command..."
                />
              </form>
            </div>
          </div>
          </div>
          </div>
        </div>
      </div>
      

      {showFaq && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '80%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ padding: '20px', borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
              <span className="title">Help & Info</span>
              <button className="danger" style={{ display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => setShowFaq(false)}>
                <X size={16} /> Close
              </button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '10px' }}>What Tech Stack is Used?</h3>
              <p style={{ marginBottom: '20px', color: 'var(--text-subtitle)' }}>
                This desktop app is built using <b>Tauri (Rust)</b> for the backend, <b>React</b> with <b>TypeScript</b> and <b>Vite</b> for the frontend, and it manages a <b>Node.js</b> local server.
              </p>
              
              <h3 style={{ marginBottom: '10px' }}>Terminal Commands & Shortcuts</h3>
              <ul style={{ marginBottom: '20px', color: 'var(--text-subtitle)', paddingLeft: '20px' }}>
                <li><b>start</b>: Starts the media server</li>
                <li><b>stop</b>: Stops the media server</li>
                <li><b>clear</b>: Clears the terminal output</li>
                <li><b>help</b>: Opens this help menu</li>
                <li><b>Ctrl + C</b>: Keyboard shortcut to stop the server</li>
                <li>(Any other command is sent directly to your OS terminal)</li>
              </ul>

              <h3 style={{ marginBottom: '10px' }}>Instructions: How to run</h3>
              <p style={{ marginBottom: '20px', color: 'var(--text-subtitle)' }}>
                To make this app run correctly, you must have the provider data in the correct place. 
                <br/><br/>
                <b>1.</b> Copy your provider scripts into the <code>providers</code> folder in the root directory.
                <br/>
                <b>2.</b> Ensure that <code>package.json</code> and <code>dev-server.js</code> are present in the parent directory (the directory above the desktop app).
                <br/>
                <b>3.</b> Install dependencies (if you haven't already), then click <b>Start Server</b>.
              </p>

             
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
