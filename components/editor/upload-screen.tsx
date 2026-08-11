"use client";

import { useRef, useState } from "react";
import { FileText, LockKeyhole, MousePointer2, Sparkles, Upload } from "lucide-react";

interface UploadScreenProps {
  busy: boolean;
  error: string | null;
  onFile: (file: File) => void;
}

export default function UploadScreen({ busy, error, onFile }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = (file?: File) => {
    if (file) onFile(file);
  };

  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <a className="brand" href="#" aria-label="Paperly home">
          <span className="brand-mark"><FileText size={18} /></span>
          <span>Paperly</span>
        </a>
        <span className="privacy-pill"><LockKeyhole size={14} /> Files stay on your device</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> A calmer way to edit PDFs</span>
          <h1>Your documents.<br /><em>Your rules.</em></h1>
          <p className="hero-lede">
            Add text, signatures, images and notes, organize pages, then export a clean PDF—without uploading your document to a server.
          </p>
          <div className="trust-row">
            <span><LockKeyhole size={17} /> Local processing</span>
            <span><MousePointer2 size={17} /> No account needed</span>
          </div>
        </div>

        <div
          className={`upload-card ${dragging ? "is-dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="upload-icon"><Upload size={28} /></div>
          <h2>{busy ? "Opening your document…" : "Drop a PDF right here"}</h2>
          <p>or choose one from your device</p>
          <button
            className="primary-button upload-button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <span className="spinner" /> : <Upload size={17} />}
            {busy ? "Loading…" : "Choose PDF"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />
          <small>PDF files up to 100 MB</small>
          {error && <p className="upload-error" role="alert">{error}</p>}
        </div>
      </section>

      <footer className="landing-footer">
        <span>Private by design</span>
        <span>•</span>
        <span>Built for everyday documents</span>
      </footer>
    </main>
  );
}
