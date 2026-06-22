import React from "react";
import { FolderOpen, HardDrive } from "lucide-react";

interface StatusCardProps {
  currentVersion: string;
  latestVersion: string;
  installationPath: string;
  pathExists: boolean;
  onOpenFolder: (type: "install" | "backup") => void;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  currentVersion,
  latestVersion,
  installationPath,
  pathExists,
  onOpenFolder,
}) => {
  return (
    <div className="glass-card status-grid">
      <div className="status-info-wrapper">
        <div className="status-row">
          <span className="status-label">Installation Path</span>
          <span className="status-value path-value" title={installationPath}>
            {installationPath || "Not Detected"}
          </span>
        </div>

        <div className="status-row">
          <span className="status-label">Status</span>
          <span className="status-value">
            {pathExists ? (
              <>
                <span className="status-indicator success"></span>
                <span style={{ color: "#10b981", fontSize: "0.85rem" }}>Detected</span>
              </>
            ) : (
              <>
                <span className="status-indicator error"></span>
                <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>Missing Installation</span>
              </>
            )}
          </span>
        </div>

        <div className="status-row">
          <span className="status-label">Version Details</span>
          <span className="status-value">
            Current: {currentVersion} | Latest: {latestVersion}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.5rem", borderLeft: "1px solid var(--border-color)", paddingLeft: "1rem" }}>
        <button 
          className="open-folder-btn" 
          onClick={() => onOpenFolder("install")}
          disabled={!pathExists}
          style={{ opacity: pathExists ? 1 : 0.5, cursor: pathExists ? "pointer" : "not-allowed" }}
        >
          <FolderOpen size={14} /> Open Install Dir
        </button>
        <button 
          className="open-folder-btn" 
          onClick={() => onOpenFolder("backup")}
          disabled={!pathExists}
          style={{ opacity: pathExists ? 1 : 0.5, cursor: pathExists ? "pointer" : "not-allowed" }}
        >
          <HardDrive size={14} /> Open Backup Dir
        </button>
      </div>
    </div>
  );
};
