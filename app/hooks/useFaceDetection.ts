import { useEffect, useState } from "react";
import * as faceapi from "face-api.js";
import type {
  FaceExpressions,
  WithFaceLandmarks,
  WithFaceExpressions,
} from "face-api.js";

export interface LandmarksData {
  landmarks: { x: number; y: number }[];
  expressions: FaceExpressions;
}

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>
): LandmarksData | null {
  const [landmarksData, setLandmarksData] = useState<LandmarksData | null>(
    null
  );

  useEffect(() => {
    let animationFrame: number;

    // Load models
    async function loadModels() {
      await faceapi.nets.ssdMobilenetv1.loadFromUri("/models"); // accurate face detector
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      await faceapi.nets.faceExpressionNet.loadFromUri("/models");
    }

    async function detectFaceLoop() {
      const video = videoRef.current;
      if (!video) {
        animationFrame = requestAnimationFrame(detectFaceLoop);
        return;
      }

      try {
        const detection:
          | WithFaceLandmarks<WithFaceExpressions<any>>
          | undefined = await faceapi
          .detectSingleFace(
            video,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
          )
          .withFaceLandmarks()
          .withFaceExpressions();

        if (detection?.landmarks && detection.expressions) {
          setLandmarksData({
            landmarks: detection.landmarks.positions,
            expressions: detection.expressions,
          });
        }
      } catch (err) {
        console.error("Face detection error:", err);
      } finally {
        animationFrame = requestAnimationFrame(detectFaceLoop);
      }
    }

    loadModels().then(detectFaceLoop);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return landmarksData;
}
