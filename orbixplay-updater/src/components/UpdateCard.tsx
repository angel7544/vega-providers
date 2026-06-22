import React from "react";
import { Download, Play, RefreshCw, Check, AlertCircle } from "lucide-react";

interface DownloadProgress {
  file_type: string;
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  speed: number;
  eta: number;
}

interface UpdateCardProps {
  updateAvailable: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  updateStep: "idle" | "downloading_dist" | "downloading_providers" | "applying" | "success" | "error";
  downloadProgress: DownloadProgress | null;
  pathExists: boolean;
  errorMessage: string | null;
  onCheck: () => void;
  onUpdate: () => void;
  onRestart: () => void;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatETA(seconds: number): string {
  if (seconds === 0) return "Calculating...";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export const UpdateCard: React.FC<UpdateCardProps> = ({
  updateAvailable,
  isChecking,
  isUpdating,
  updateStep,
  downloadProgress,
  pathExists,
  errorMessage,
  onCheck,
  onUpdate,
  onRestart,
}) => {
  const getStepLabel = () => {
    switch (updateStep) {
      case "downloading_dist":
        return "Downloading Application Files (dist.zip)...";
      case "downloading_providers":
        return "Downloading Providers Package (providers.zip)...";
      case "applying":
        return "Applying updates (Backing up & Extracting)...";
      case "success":
        return "Update applied successfully!";
      case "error":
        return "Failed to apply update.";
      default:
        return updateAvailable ? "Update Available" : "System Up to Date";
    }
  };

  return (
    <div className="glass-card update-card">
      <div className="update-header">
        <span className="update-title">Update Operations</span>
        <span 
          className="update-status-text" 
          style={{ 
            color: updateStep === "success" ? "var(--color-success)" : 
                   updateStep === "error" ? "var(--color-error)" : 
                   "var(--color-primary)" 
          }}
        >
          {getStepLabel()}
        </span>
      </div>

      {/* Progress Bars Section */}
      {isUpdating && downloadProgress && (updateStep === "downloading_dist" || updateStep === "downloading_providers") && (
        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-title">
              <Download size={14} className="animate-bounce" /> 
              {downloadProgress.file_type === "dist" ? "dist.zip" : "providers.zip"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {downloadProgress.progress.toFixed(1)}%
            </span>
          </div>

          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${downloadProgress.progress}%` }}
            ></div>
          </div>

          <div className="stats-row">
            <span>
              {formatBytes(downloadProgress.bytes_downloaded)} / {formatBytes(downloadProgress.total_bytes)}
            </span>
            <span>
              {formatBytes(downloadProgress.speed)}/s • ETA: {formatETA(downloadProgress.eta)}
            </span>
          </div>
        </div>
      )}

      {isUpdating && updateStep === "applying" && (
        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-title">
              <RefreshCw size={14} className="animate-spin" style={{ animationDuration: "2s" }} /> 
              Extracting ZIPs & Overwriting Folders...
            </span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: "90%", animation: "pulse 1.5s infinite" }}></div>
          </div>
          <div className="stats-row">
            <span>Creating backups & applying rollback protection...</span>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {updateStep === "success" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "0.75rem", color: "var(--color-success)" }}>
          <Check size={18} />
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Update complete. Your OrbixPlay Suite is now updated and ready.</span>
        </div>
      )}

      {/* Error Banner */}
      {updateStep === "error" && errorMessage && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "0.75rem", color: "var(--color-error)" }}>
          <AlertCircle size={18} style={{ marginTop: "2px", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Error Encountered</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.9 }}>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="btn-group">
        {updateStep === "success" ? (
          <button className="btn btn-success" onClick={onRestart}>
            <Play size={16} /> Restart Orbix Suite
          </button>
        ) : (
          <>
            <button 
              className="btn btn-secondary" 
              onClick={onCheck} 
              disabled={isChecking || isUpdating || !pathExists}
            >
              <RefreshCw size={16} className={isChecking ? "animate-spin" : ""} />
              Check for Updates
            </button>
            <button 
              className="btn" 
              onClick={onUpdate} 
              disabled={!updateAvailable || isUpdating || !pathExists}
            >
              <Download size={16} />
              {updateAvailable ? "Apply Update" : "Up to Date"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
