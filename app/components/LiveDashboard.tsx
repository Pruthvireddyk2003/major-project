"use client";

import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { VideoCard } from "@/components/VideoCard";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { useSoundAnalysis } from "@/hooks/useSoundAnalysis";
import { useFaceDetection } from "@/hooks/useFaceDetection";
import { useDriverMonitoring } from "@/hooks/useDriverMonitoring";
import { motion, AnimatePresence } from "framer-motion";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const MAX_LOGS = 180;

const TUNE = {
  DROWSY_THRESHOLD: 0.8, // normal mode
  DROWSY_DEMO_THRESHOLD: 0.6, // demo mode
  PERCLOS_ALERT: 0.25,
  PERCLOS_DEMO_ALERT: 0.18,
  ALERT_DEBOUNCE: 10_000,
  DEMO_ALERT_DEBOUNCE: 3_000,
  SMOOTH_WINDOW: 3,
};

// Fixed text – one message per cause
const ALERT_TEXT = {
  snore: "Snoring detected – driver may be sleeping.",
  yawn: "Yawning detected – driver is getting drowsy.",
  eyes: "Eyes closed too long – risk of microsleep.",
  drowsy: "Drowsiness level high – stop and rest.",
} as const;

const safeToast = {
  success: (m: string, o?: any) =>
    typeof window !== "undefined" && setTimeout(() => toast.success(m, o), 0),
  error: (m: string, o?: any) =>
    typeof window !== "undefined" && setTimeout(() => toast.error(m, o), 0),
  info: (m: string, o?: any) =>
    typeof window !== "undefined" && setTimeout(() => toast(m, o), 0),
};

export default function SimplifiedLiveDashboard({
  driverId,
}: {
  driverId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [micOn, setMicOn] = useState(false);

  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertRef = useRef<number>(0);

  const prevSoundWarningRef = useRef<boolean>(false);
  const prevMarRef = useRef<number>(0);
  const prevEyesBadRef = useRef<boolean>(false);
  const prevDrowsyScoreRef = useRef<number>(0);

  const lastSnoreToastRef = useRef<number>(0);
  const lastYawnToastRef = useRef<number>(0);
  const lastEyesToastRef = useRef<number>(0);

  const {
    volume,
    bandEnergyLow,
    isSilent,
    isRunning,
    permissionGranted,
    start,
    stop,
  } = useSoundAnalysis({ autoStart: true });

  const landmarksData = useFaceDetection(videoRef);

  const {
    status,
    drowsyScore,
    calibrationProgress,
    blinkCount,
    blinkDetected,
    dominantEmotion,
    continuousClose,
    perclos,
    soundWarning,
    startCalibration,
    stopCalibration,
    ear,
    mar,
  } = useDriverMonitoring(landmarksData, MAX_LOGS, {
    driverId: driverId ?? process.env.NEXT_PUBLIC_DRIVER_ID,
    soundAutoStart: true,
  });

  const smoothArr = (arr: number[], window = TUNE.SMOOTH_WINDOW) =>
    arr.map((_, i) => {
      const w = arr.slice(Math.max(0, i - (window - 1)), i + 1);
      return w.reduce((a, b) => a + b, 0) / Math.max(1, w.length);
    });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio("/alert.mp3");
    audio.preload = "auto";
    alertAudioRef.current = audio;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await start();
        setMicOn(true);
        safeToast.success("Microphone started");
      } catch {}
      try {
        startCalibration();
        safeToast.info("Calibration started — keep eyes open");
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!landmarksData) return;
    const ts = Date.now();
    setLogs((p) => [
      ...p.slice(-MAX_LOGS + 1),
      {
        id: ts,
        ear: ear ?? 0,
        mar: mar ?? 0,
        drowsyScore,
        speechVolume: Math.round((volume ?? 0) * 100),
        lowBandPct: Math.round((bandEnergyLow ?? 0) * 100),
        emotion: dominantEmotion ?? "neutral",
        blinkCount,
        isSilent,
        isRunning,
        continuousClose,
        perclos: perclos ?? 0,
        timestamp: new Date(ts).toLocaleTimeString(),
        ts,
      },
    ]);
  }, [
    landmarksData,
    drowsyScore,
    volume,
    bandEnergyLow,
    blinkCount,
    dominantEmotion,
    isSilent,
    isRunning,
    continuousClose,
    perclos,
    ear,
    mar,
  ]);

  const timestamps = logs.map((l) => l.timestamp);
  const drowsyData = smoothArr(logs.map((l) => l.drowsyScore ?? 0));
  const speechVolumeData = smoothArr(logs.map((l) => l.speechVolume ?? 0));
  const lowBandData = smoothArr(logs.map((l) => l.lowBandPct ?? 0));

  const emotionsCount: Record<string, number> = {};
  logs.forEach((l) => {
    const e = l.emotion || "neutral";
    emotionsCount[e] = (emotionsCount[e] || 0) + 1;
  });
  const emotionLabels = Object.keys(emotionsCount);
  const emotionCounts = Object.values(emotionsCount);

  const cardVariant = {
    hidden: { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0, transition: { duration: 0.35 } },
    exit: { opacity: 0, y: 8, transition: { duration: 0.25 } },
  };

  const headerVariant = {
    hidden: { opacity: 0, y: -8 },
    enter: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const handleMicToggle = async () => {
    try {
      if (!micOn) {
        await start();
        setMicOn(true);
        safeToast.success("Microphone started");
      } else {
        stop();
        setMicOn(false);
        safeToast.info("Microphone stopped");
      }
    } catch (e: any) {
      safeToast.error("Mic error: " + (e?.message ?? e));
    }
  };

  useEffect(() => {
    const audio = alertAudioRef.current;
    if (!audio) return;

    const threshold = demoMode
      ? TUNE.DROWSY_DEMO_THRESHOLD
      : TUNE.DROWSY_THRESHOLD;

    const prev = prevDrowsyScoreRef.current;
    prevDrowsyScoreRef.current = drowsyScore;

    if (prev < threshold && drowsyScore >= threshold) {
      lastAlertRef.current = Date.now();

      try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } catch {}

      safeToast.error(ALERT_TEXT.drowsy, {
        duration: 5000,
      });
    }
  }, [drowsyScore, demoMode]);

  useEffect(() => {
    const now = Date.now();
    const COOLDOWN = 15_000;

    const prev = prevSoundWarningRef.current;
    const current = !!soundWarning;
    prevSoundWarningRef.current = current;

    if (!prev && current) {
      if (now - lastSnoreToastRef.current < COOLDOWN) return;
      lastSnoreToastRef.current = now;

      safeToast.error(ALERT_TEXT.snore, {
        duration: 5000,
      });
    }
  }, [soundWarning]);

  useEffect(() => {
    const now = Date.now();
    const COOLDOWN = 10_000;
    const YAWN_THRESHOLD = 0.7;

    const prevMar = prevMarRef.current ?? 0;
    const currentMar = mar ?? 0;
    prevMarRef.current = currentMar;

    if (prevMar < YAWN_THRESHOLD && currentMar >= YAWN_THRESHOLD) {
      if (now - lastYawnToastRef.current < COOLDOWN) return;
      lastYawnToastRef.current = now;

      safeToast.error(ALERT_TEXT.yawn, {
        duration: 4000,
      });
    }
  }, [mar]);

  useEffect(() => {
    const now = Date.now();
    const COOLDOWN = 8000;

    const perclosThreshold = demoMode
      ? TUNE.PERCLOS_DEMO_ALERT
      : TUNE.PERCLOS_ALERT;

    const eyesBad =
      !!continuousClose ||
      (perclos ?? 0) > perclosThreshold ||
      (ear ?? 1) < 0.18; // very low EAR

    const prevBad = prevEyesBadRef.current;
    prevEyesBadRef.current = eyesBad;

    if (!prevBad && eyesBad) {
      if (now - lastEyesToastRef.current < COOLDOWN) return;
      lastEyesToastRef.current = now;

      safeToast.error(ALERT_TEXT.eyes, {
        duration: 4000,
      });
    }
  }, [continuousClose, perclos, ear, demoMode]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial="hidden"
        animate="enter"
        variants={headerVariant}
        className="flex justify-between items-center"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Live Driver Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Real-time drowsiness & audio monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleMicToggle}
            className={`px-4 py-2 rounded-lg font-medium shadow hover:shadow-md transition flex items-center gap-2 ${
              micOn ? "bg-red-600 text-white" : "bg-green-600 text-white"
            }`}
          >
            {micOn ? "Stop Mic" : "Start Mic"}
            <motion.span
              animate={{ opacity: micOn ? 1 : 0.3, scale: micOn ? 1.05 : 1 }}
              transition={{ duration: 0.3 }}
              className={`w-2 h-2 rounded-full ${
                micOn ? "bg-white" : "bg-black/20"
              }`}
            />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            onClick={() => {
              if (calibrationProgress > 0 && calibrationProgress < 1)
                stopCalibration();
              else startCalibration();
            }}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg shadow hover:shadow-md transition"
          >
            {calibrationProgress > 0 && calibrationProgress < 1
              ? "Stop Cal"
              : "Calibrate"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            onClick={() => setDemoMode((s) => !s)}
            className={`px-3 py-2 rounded-lg text-sm shadow hover:shadow-md transition ${
              demoMode ? "bg-indigo-700 text-white" : "bg-gray-200 text-black"
            }`}
          >
            {demoMode ? "Demo ON" : "Demo OFF"}
          </motion.button>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div
          variants={cardVariant}
          initial="hidden"
          animate="enter"
          className="relative w-full h-96 rounded-2xl shadow-xl bg-black/5 overflow-hidden"
        >
          <VideoCard
            videoRef={videoRef}
            className="w-full h-full object-cover rounded-2xl"
          />

          <AnimatePresence>
            {drowsyScore >=
              (demoMode
                ? TUNE.DROWSY_DEMO_THRESHOLD
                : TUNE.DROWSY_THRESHOLD) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-5 right-5 bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 font-semibold text-sm"
              >
                ⚠️ DROWSY {(drowsyScore * 100).toFixed(0)}%
              </motion.div>
            )}
          </AnimatePresence>

          {blinkDetected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-5 left-5 bg-blue-500 text-white px-3 py-1 rounded-xl shadow-md text-sm font-medium"
            >
              👁️ Blink {blinkCount}
            </motion.div>
          )}

          {/* Audio / Mic / Calibration Status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-5 right-5 bg-white/90 text-black px-4 py-2 rounded-xl shadow-sm text-xs flex flex-col gap-0.5 font-medium"
          >
            <div>🎤 Mic: {permissionGranted ? "granted" : "denied"}</div>
            <div>🔊 Audio: {isRunning ? "running" : "stopped"}</div>
          </motion.div>
        </motion.div>

        <motion.div
          variants={cardVariant}
          initial="hidden"
          animate="enter"
          className="bg-white rounded-2xl shadow-md p-6 h-96 overflow-hidden hover:shadow-xl transition-all w-full"
        >
          <div className="h-72">
            <Line
              data={{
                labels: timestamps,
                datasets: [
                  {
                    label: "EAR",
                    data: smoothArr(logs.map((l) => l.ear ?? 0)),
                    borderColor: "rgba(59, 130, 246, 1)",
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "rgba(59, 130, 246, 1)",
                  },
                  {
                    label: "MAR",
                    data: smoothArr(logs.map((l) => l.mar ?? 0)),
                    borderColor: "rgba(239, 68, 68, 1)",
                    backgroundColor: "rgba(239, 68, 68, 0.2)",
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "rgba(239, 68, 68, 1)",
                  },
                  {
                    label: "Drowsiness",
                    data: drowsyData,
                    borderColor: "rgba(245, 158, 24, 1)",
                    backgroundColor: "rgba(245, 158, 24, 0.2)",
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "rgba(245, 158, 24, 1)",
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    position: "top",
                    labels: {
                      usePointStyle: true,
                      pointStyle: "circle",
                      padding: 16,
                      color: "#4B5563",
                      font: { size: 12 },
                    },
                  },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    backgroundColor: "#1F2937",
                    titleColor: "#F9FAFB",
                    bodyColor: "#F9FAFB",
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    suggestedMax: 1.0,
                    ticks: { color: "#4B5563", stepSize: 0.1 },
                    grid: { color: "#E5E7EB" },
                  },
                  x: {
                    ticks: { color: "#4B5563" },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div
          className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl transition-all w-full h-64"
          variants={cardVariant}
        >
          <h3 className="text-lg font-bold text-gray-800 mb-4">Audio Levels</h3>

          <div className="h-44">
            <Line
              data={{
                labels: timestamps,
                datasets: [
                  {
                    label: "Volume",
                    data: speechVolumeData,
                    borderColor: "rgba(251, 190, 24, 1)",
                    backgroundColor: "rgba(251, 190, 24, 0.2)",
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "rgba(251, 190, 24, 1)",
                  },
                  {
                    label: "Low-band",
                    data: lowBandData,
                    borderColor: "rgba(139, 92, 246, 1)",
                    backgroundColor: "rgba(139, 92, 246, 0.2)",
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: "rgba(139, 92, 246, 1)",
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    position: "top",
                    labels: {
                      usePointStyle: true,
                      pointStyle: "circle",
                      padding: 20,
                      color: "#4B5563",
                      font: { size: 12 },
                    },
                  },
                  tooltip: {
                    mode: "index",
                    intersect: false,
                    backgroundColor: "#1F2937",
                    titleColor: "#F9FAFB",
                    bodyColor: "#F9FAFB",
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: "#4B5563", stepSize: 20 },
                    grid: { color: "#E5E7EB" },
                  },
                  x: {
                    ticks: { color: "#4B5563" },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl transition-all w-full h-64"
          variants={cardVariant}
        >
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            Driver Emotion
          </h3>

          <div className="h-44">
            <Bar
              data={{
                labels: emotionLabels,
                datasets: [
                  {
                    label: "Frequency",
                    data: emotionCounts,
                    backgroundColor: emotionLabels.map((label) => {
                      switch (label.toLowerCase()) {
                        case "happy":
                          return "#FBBF24";
                        case "sad":
                          return "#3B82F6";
                        case "angry":
                          return "#EF4444";
                        case "neutral":
                          return "#9CA3AF";
                        case "surprised":
                          return "#10B981";
                        default:
                          return "#6366F1";
                      }
                    }),
                    borderRadius: 8,
                    barPercentage: 0.6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    enabled: true,
                    backgroundColor: "#1F2937",
                    titleColor: "#F9FAFB",
                    bodyColor: "#F9FAFB",
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1, color: "#4B5563" },
                    grid: { color: "#E5E7EB" },
                  },
                  x: {
                    ticks: { color: "#4B5563" },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        </motion.div>

        <motion.div
          className="bg-white rounded-xl shadow p-4 h-64 hover:shadow-lg transition"
          variants={cardVariant}
        >
          <h2 className="text-md font-bold mb-2 text-gray-800">
            Driver Metrics
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-gray-500 text-sm">Status</span>
              <span
                className={`mt-1 font-semibold ${
                  status === "AWAKE" ? "text-green-600" : "text-red-600"
                }`}
              >
                {status}
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-gray-500 text-sm">Drowsiness</span>
              <div className="mt-1 w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-yellow-400 h-3 rounded-full transition-all"
                  style={{ width: `${(drowsyScore * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1">
                {(drowsyScore * 100).toFixed(1)}%
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-gray-500 text-sm">Low-band</span>
              <div className="mt-1 w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-400 h-3 rounded-full transition-all"
                  style={{ width: `${(bandEnergyLow * 100).toFixed(2)}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1">
                {(bandEnergyLow * 100).toFixed(2)}%
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-gray-500 text-sm">Calibration</span>
              <div className="mt-1 w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-purple-400 h-3 rounded-full transition-all"
                  style={{
                    width: `${(calibrationProgress * 100).toFixed(2)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1">
                {(calibrationProgress * 100).toFixed(2)}%
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-gray-500 text-sm">PERCLOS</span>
              <div className="mt-1 w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-red-400 h-3 rounded-full transition-all"
                  style={{ width: `${Math.round((perclos ?? 0) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1">
                {Math.round((perclos ?? 0) * 100)}%
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
