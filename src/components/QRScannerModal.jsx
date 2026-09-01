// Camera QR scanner used by the waiter to open a table session. The table QR
// encodes …/menu?restaurantId=<id>&tableId=<id>; the caller extracts tableId and
// sends it as the `qrToken` to POST /api/staff/:rId/waiter/tables/scan.

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CheckCheck, QrCode, X, XCircle } from "lucide-react";

export default function QRScannerModal({ onClose, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | error
  const [errorMsg, setErrorMsg] = useState("");
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus("scanning");
          scan();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access and try again."
            : "Could not access camera: " + err.message);
        }
      }
    }

    function scan() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        setDetected(code.data);
        setTimeout(() => {
          onScan(code.data);
          onClose();
        }, 800);
      } else {
        rafRef.current = requestAnimationFrame(scan);
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[#1a1a1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCode className="h-4 w-4 text-brand-orange" /> Scan Table QR
          </span>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-white/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewfinder */}
        <div className="relative aspect-square w-full bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanning overlay corners */}
          {status === "scanning" && !detected && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-56 w-56">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-brand-orange" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-brand-orange" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-brand-orange" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-brand-orange" />
                <div className="absolute inset-0 overflow-hidden">
                  <div className="animate-scan-line absolute left-0 right-0 h-0.5 bg-brand-orange/70 shadow-[0_0_8px_2px_rgba(234,88,12,0.5)]" />
                </div>
              </div>
            </div>
          )}

          {/* Detected flash */}
          {detected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-green">
                <CheckCheck className="h-7 w-7 text-white" />
              </div>
              <p className="text-sm font-semibold text-white">QR Detected!</p>
              <p className="text-xs text-white/70">{detected}</p>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
              <XCircle className="h-10 w-10 text-brand-red" />
              <p className="text-sm text-white/80">{errorMsg}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
          )}

          {/* Starting spinner */}
          {status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}
        </div>

        <p className="px-4 py-3 text-center text-xs text-white/50">
          Point your camera at the table QR code
        </p>
      </div>
    </div>
  );
}
