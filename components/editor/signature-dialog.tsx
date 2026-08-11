"use client";

import { useRef, useState } from "react";
import { Eraser, Signature, X } from "lucide-react";

interface SignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export default function SignatureDialog({ open, onClose, onSave }: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const close = () => {
    clear();
    onClose();
  };

  if (!open) return null;

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="signature-title">
        <div className="dialog-heading">
          <div><span className="dialog-icon"><Signature size={19} /></span><h2 id="signature-title">Create your signature</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button>
        </div>
        <p>Draw with your mouse, trackpad, or finger. It stays only in this document.</p>
        <div className="signature-pad">
          <canvas
            ref={canvasRef}
            width={960}
            height={320}
            onPointerDown={(event) => {
              drawingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              const context = event.currentTarget.getContext("2d");
              const start = point(event);
              if (context) {
                context.beginPath();
                context.moveTo(start.x, start.y);
                context.lineCap = "round";
                context.lineJoin = "round";
                context.strokeStyle = "#17211b";
                context.lineWidth = 5;
              }
            }}
            onPointerMove={(event) => {
              if (!drawingRef.current) return;
              const next = point(event);
              const context = event.currentTarget.getContext("2d");
              context?.lineTo(next.x, next.y);
              context?.stroke();
              setHasInk(true);
            }}
            onPointerUp={(event) => {
              drawingRef.current = false;
              event.currentTarget.getContext("2d")?.closePath();
            }}
          />
          <span className="signature-line" />
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={clear}><Eraser size={16} /> Clear</button>
          <div>
            <button className="text-button" onClick={close}>Cancel</button>
            <button
              className="primary-button"
              disabled={!hasInk}
              onClick={() => {
                const data = canvasRef.current?.toDataURL("image/png");
                if (data) onSave(data);
              }}
            >Use signature</button>
          </div>
        </div>
      </section>
    </div>
  );
}
