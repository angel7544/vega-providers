import React from "react";
import { ClipboardList } from "lucide-react";

interface ReleaseNotesProps {
  notes: string;
}

export const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ notes }) => {
  if (!notes) {
    return null;
  }

  return (
    <div className="release-notes-card">
      <div className="release-notes-title" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <ClipboardList size={14} style={{ color: "var(--color-primary)" }} />
        <span>What's New in this Update</span>
      </div>
      <div style={{ paddingLeft: "0.2rem", paddingTop: "0.25rem", whiteSpace: "pre-line" }}>
        {notes}
      </div>
    </div>
  );
};
