"use client";

import { useEffect } from "react";

interface VideoCardProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onData?: (metrics: any) => void;
  className?: string; // <-- add this
}

export function VideoCard({ videoRef, onData, className }: VideoCardProps) {
  useEffect(() => {
    if (!videoRef.current) return;

    async function startWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    }

    startWebcam();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, [videoRef]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover ${className ?? ""}`}
      />
    </div>
  );
}
