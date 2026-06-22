import React, { useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";

export interface LogLine {
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  text: string;
}

interface LogsPanelProps {
  logs: LogLine[];
  onClear: () => void;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ logs, onClear }) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Terminal size={14} style={{ color: "var(--text-secondary)" }} />
          <span>System Console Logs</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button 
            onClick={onClear} 
            title="Clear Logs"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-error)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          >
            <Trash2 size={12} />
          </button>
          <div className="terminal-bullets">
            <span className="terminal-bullet red"></span>
            <span className="terminal-bullet yellow"></span>
            <span className="terminal-bullet green"></span>
          </div>
        </div>
      </div>

      <div className="terminal-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <div className="log-line log-info" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Console initialized. Awaiting user commands...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`log-line log-${log.type}`}>
              <span className="log-timestamp">[{log.timestamp}]</span>
              <span>{log.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
