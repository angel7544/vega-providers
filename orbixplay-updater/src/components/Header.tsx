import React from "react";
import { RefreshCw, Server, Info } from "lucide-react";

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, isRefreshing }) => {
  return (
    <header className="app-header">
      <div className="brand-wrapper">
        <Server className="logo-icon" size={28} />
        <h1 className="brand-title">OrbixPlay Vega Patcher</h1>
        <span className="brand-badge">Server Update</span>
        <div 
          className="developer-info" 
          title="Contributor: Angel Mehul Singh for Desktop development"
          style={{ display: "flex", alignItems: "center", marginLeft: "0.5rem", cursor: "help", color: "var(--text-muted)" }}
        >
          <Info size={16} />
        </div>
      </div>
      <button 
        className="refresh-button" 
        onClick={onRefresh} 
        disabled={isRefreshing}
        title="Refresh Update Status"
      >
        <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} style={{ animationDuration: isRefreshing ? "1.5s" : "0s" }} />
      </button>
    </header>
  );
};
