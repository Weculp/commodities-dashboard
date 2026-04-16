import { useState } from "react";

export default function GeminiKeyModal({ apiKey, onChange }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(apiKey || "");

  const hasKey = !!apiKey;

  const handleSave = () => {
    onChange(value.trim());
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setValue("");
    setOpen(false);
  };

  return (
    <>
      <button className="gemini-status" onClick={() => setOpen(true)}>
        <span className={`gemini-dot ${hasKey ? "gemini-dot-on" : "gemini-dot-off"}`} />
        <span style={{ color: "var(--text-dim)", fontFamily: "Inter, sans-serif" }}>
          AI: {hasKey ? "Connected" : "No Key"}
        </span>
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <h3>Gemini API Key</h3>
            <p className="modal-note">
              Your API key is stored locally in your browser and never sent to our servers.
              It is used to call the Gemini API directly from your browser for AI strategy suggestions.
              Get a key at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                aistudio.google.com
              </a>
            </p>
            <input
              className="modal-input"
              type="password"
              placeholder="Enter your Gemini API key..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <div className="modal-actions">
              {hasKey && (
                <button className="btn" onClick={handleClear} style={{ color: "var(--danger)" }}>
                  Clear Key
                </button>
              )}
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={!value.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
