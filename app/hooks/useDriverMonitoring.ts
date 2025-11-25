// app/hooks/useDriverMonitoring.ts
import { useEffect, useRef, useState } from "react";
import type { LandmarksData } from "./useFaceDetection";
import { useSoundAnalysis } from "./useSoundAnalysis";

const DEBUG = false;

export interface MonitoringResult {
  status: "DROWSY" | "AWAKE";
  drowsyScore: number;
  drowsyHistory: number[];
  emotionHistory: string[];
  calibrationProgress: number;
  blinkCount: number;
  blinkDetected: boolean;
  dominantEmotion?: string;
  soundWarning?: boolean;
  continuousClose?: boolean;
  perclos?: number;
  startCalibration: () => void;
  stopCalibration: () => void;

  ear: number;
  mar: number;
}

type SavePayloadClient = {
  driverId: string;
  drowsiness?: number | null;
  emotion?: string | null;
  eyeAspectRatio?: number | null;
  mouthAspectRatio?: number | null;
  headPose?: string | null;
  blinkDetected?: boolean | null;
  microExpression?: string | null;
  speechVolume?: number | null;
  ts?: string;
};

export function useDriverMonitoring(
  landmarksData: LandmarksData | null,
  maxPoints: number = 60,
  options?: { driverId?: string; soundAutoStart?: boolean }
): MonitoringResult {
  const driverId = options?.driverId ?? process.env.NEXT_PUBLIC_DRIVER_ID;
  if (!driverId && DEBUG) {
    console.warn(
      "useDriverMonitoring: driverId not provided — persistence disabled."
    );
  }

  // state
  const [status, setStatus] = useState<"DROWSY" | "AWAKE">("AWAKE");
  const [drowsyScore, setDrowsyScore] = useState<number>(0);
  const [drowsyHistory, setDrowsyHistory] = useState<number[]>([]);
  const [emotionHistory, setEmotionHistory] = useState<string[]>([]);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [blinkCount, setBlinkCount] = useState<number>(0);
  const [blinkDetected, setBlinkDetected] = useState<boolean>(false);
  const [dominantEmotion, setDominantEmotion] = useState<string>("neutral");
  const [soundWarning, setSoundWarning] = useState<boolean>(false);
  const [continuousClose, setContinuousClose] = useState<boolean>(false);
  const [perclosState, setPerclosState] = useState<number>(0);

  const [ear, setEar] = useState<number>(0);
  const [mar, setMar] = useState<number>(0);

  const {
    volume,
    bandEnergyLow,
    isSilent,
    isRunning,
    recentEnvelope,
    start,
    permissionGranted,
  } = useSoundAnalysis({ autoStart: options?.soundAutoStart ?? true });

  // refs
  const prevEyesClosed = useRef<boolean>(false);
  const lastEyeStateRef = useRef<{ closed: boolean; lastChangeTs: number }>({
    closed: false,
    lastChangeTs: Date.now(),
  });
  const percBufferRef = useRef<{ ts: number; closed: 0 | 1 }[]>([]);
  const longBlinkCountRef = useRef<number>(0);

  const lastPitchRef = useRef<number | null>(null);
  const lastPitchTsRef = useRef<number | null>(null);
  const emaRef = useRef<number>(0);

  const mouthRef = useRef<number | null>(null);

  // calibration
  const calibratingRef = useRef<boolean>(false);
  const calibrationStartTsRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationDurationMs = 10_000;

  // CONFIG
  const PERCLOS_WINDOW_MS = 30_000;
  const PERCLOS_ALERT = 0.12;
  const CONTINUOUS_CLOSE_MS_ALERT = 500;
  const LONG_BLINK_MS = 250;
  const LONG_BLINK_MAX_MS = 500;
  const YAWN_MAR_NORMALIZE = 0.55;
  const HEAD_NOD_ANGLE_DEG = 7;
  const HEAD_NOD_VEL_DEG_PER_S = 5;
  const SOUND_SUPPORT_WEIGHT = 0.25;
  const SMOOTH_ALPHA = 0.6;

  const baselineEarRef = useRef<number | null>(null);
  const EAR_CLOSED_REF = useRef<number>(0.26);
  const EAR_OPEN_REF = useRef<number>(0.3);

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const std = (arr: number[]) => {
    if (!arr.length) return 0;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    return Math.sqrt(
      arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length
    );
  };

  const detectPeaks = (
    values: number[],
    times: number[],
    minAmp = 14,
    minSeparationMs = 150,
    prominenceStd = 1.0
  ) => {
    const peaks: { idx: number; t: number; v: number }[] = [];
    if (!values.length) return peaks;
    const med = median(values);
    const s = std(values);
    for (let i = 1; i < values.length - 1; i++) {
      const v = values[i];
      if (v > values[i - 1] && v >= values[i + 1]) {
        const t = times[i] ?? Date.now();
        if (peaks.length && t - peaks[peaks.length - 1].t < minSeparationMs)
          continue;
        const prominenceOk = s > 0 ? v >= med + prominenceStd * s : true;
        if (prominenceOk && v >= minAmp) peaks.push({ idx: i, t, v });
      }
    }
    return peaks;
  };

  const evaluatePeriodicity = (
    peaks: { idx: number; t: number; v: number }[],
    minPeaks = 3,
    maxIntervalStdMs = 500
  ) => {
    if (peaks.length < minPeaks)
      return { ok: false, intervals: [] as number[] };
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++)
      intervals.push(peaks[i].t - peaks[i - 1].t);
    const meanI = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const stdI = std(intervals);
    if (stdI <= maxIntervalStdMs && meanI >= 200 && meanI <= 2000)
      return { ok: true, intervals };
    return { ok: false, intervals };
  };

  const startCalibration = () => {
    calibrationSamplesRef.current = [];
    calibrationStartTsRef.current = Date.now();
    calibratingRef.current = true;
    setCalibrationProgress(0);
  };
  const stopCalibration = () => {
    calibratingRef.current = false;
    calibrationStartTsRef.current = null;
    if (calibrationSamplesRef.current.length) {
      const avg =
        calibrationSamplesRef.current.reduce((s, x) => s + x, 0) /
        calibrationSamplesRef.current.length;
      baselineEarRef.current = avg;
      EAR_CLOSED_REF.current = Math.max(0.12, avg * 0.6);
      EAR_OPEN_REF.current = Math.max(
        EAR_CLOSED_REF.current + 0.04,
        avg * 0.75
      );
      setCalibrationProgress(1);
    } else {
      setCalibrationProgress(1);
    }
  };

  const lastUpdateRef = useRef<number>(0);
  const prevValuesRef = useRef<any>({});
  const UPDATE_MS = 180;

  const pendingSaveRef = useRef<SavePayloadClient | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const saveAbortControllerRef = useRef<AbortController | null>(null);

  const SAVE_INTERVAL_MS = 5000;
  const SAVE_ON_STATUS_CHANGE = true;

  const preparePayload = (
    extra?: Partial<SavePayloadClient>
  ): SavePayloadClient => ({
    driverId: driverId ?? "",
    drowsiness: Number(drowsyScore ?? 0),
    emotion: dominantEmotion ?? "neutral",
    eyeAspectRatio: Number(ear ?? 0), // EAR
    mouthAspectRatio: Number(mouthRef.current ?? 0),
    headPose: null,
    blinkDetected: blinkDetected ?? false,
    microExpression: null,
    speechVolume: Number(volume ?? 0),
    ts: new Date().toISOString(),
    ...extra,
  });

  const sendToServer = async (payload: SavePayloadClient, attempts = 3) => {
    if (!driverId) return false;
    if (!navigator.onLine) return false;
    saveAbortControllerRef.current?.abort();
    const controller = new AbortController();
    saveAbortControllerRef.current = controller;
    const url = "/api/logs/driver";
    const body = JSON.stringify(payload);
    let wait = 300;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        if (res.ok) return true;
        const text = await res.text().catch(() => "");
        if (DEBUG) console.warn("monitoring POST failed", res.status, text);
      } catch (e: any) {
        if (e?.name === "AbortError") return false;
        if (DEBUG) console.warn("monitoring send error:", e);
      }
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
    }
    return false;
  };

  const scheduleSave = (
    immediate = false,
    extra?: Partial<SavePayloadClient>
  ) => {
    if (!driverId) return;
    const payload = preparePayload(extra);
    pendingSaveRef.current = payload;
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (immediate) {
      (async () => {
        const p = pendingSaveRef.current;
        if (!p) return;
        const ok = await sendToServer(p);
        if (ok) pendingSaveRef.current = null;
      })();
    } else {
      saveTimeoutRef.current = window.setTimeout(async () => {
        const p = pendingSaveRef.current;
        if (!p) return;
        const ok = await sendToServer(p);
        if (ok) pendingSaveRef.current = null;
      }, SAVE_INTERVAL_MS) as unknown as number;
    }
  };

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (pendingSaveRef.current)
        sendToServer(preparePayload(), 1).catch(() => {});
      saveAbortControllerRef.current?.abort();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!landmarksData) return;
    const nowTs = Date.now();
    if (nowTs - (lastUpdateRef.current || 0) < UPDATE_MS) return;
    lastUpdateRef.current = nowTs;

    const { landmarks, expressions } = landmarksData;

    const leftEye = landmarks.slice(36, 42);
    const rightEye = landmarks.slice(42, 48);
    const computeEAR = (eye: { x: number; y: number }[]) =>
      (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) /
      (2 * dist(eye[0], eye[3]));
    const earLeft = computeEAR(leftEye);
    const earRight = computeEAR(rightEye);
    const EAR = (earLeft + earRight) / 2;

    setEar((prev) => (Math.abs(prev - EAR) > 0.0005 ? EAR : prev));

    if (calibratingRef.current && calibrationStartTsRef.current != null) {
      calibrationSamplesRef.current.push(EAR);
      const elapsed = nowTs - calibrationStartTsRef.current;
      const progress = Math.min(1, elapsed / calibrationDurationMs);
      setCalibrationProgress((prev) =>
        Math.abs(prev - progress) > 0.01 ? progress : prev
      );
      if (elapsed >= calibrationDurationMs) stopCalibration();
    }

    const EAR_CLOSED = EAR_CLOSED_REF.current;
    const EAR_OPEN = EAR_OPEN_REF.current;

    const eyesCurrentlyClosed = prevEyesClosed.current
      ? EAR < EAR_OPEN
      : EAR < EAR_CLOSED;

    if (eyesCurrentlyClosed !== lastEyeStateRef.current.closed) {
      const prevState = lastEyeStateRef.current;
      const durationMs = nowTs - prevState.lastChangeTs;

      if (prevState.closed) {
        if (durationMs >= LONG_BLINK_MS && durationMs < LONG_BLINK_MAX_MS) {
          longBlinkCountRef.current += 1;
          setBlinkCount((p) => p + 1);
          setBlinkDetected(true);
          setTimeout(() => setBlinkDetected(false), 300);
          if (DEBUG) console.debug("Long blink counted:", durationMs);
        } else {
          if (DEBUG)
            console.debug(
              "Closed duration (not counted as blink):",
              durationMs
            );
        }
      } else {
        setBlinkDetected(false);
      }

      lastEyeStateRef.current = {
        closed: eyesCurrentlyClosed,
        lastChangeTs: nowTs,
      };
    }

    prevEyesClosed.current = eyesCurrentlyClosed;

    percBufferRef.current.push({
      ts: nowTs,
      closed: eyesCurrentlyClosed ? 1 : 0,
    });
    while (
      percBufferRef.current.length &&
      percBufferRef.current[0].ts < nowTs - PERCLOS_WINDOW_MS
    ) {
      percBufferRef.current.shift();
    }
    const closedSum = percBufferRef.current.reduce((s, x) => s + x.closed, 0);
    const windowLen = Math.max(1, percBufferRef.current.length);
    const perclos = closedSum / windowLen;

    const lastChange = lastEyeStateRef.current.lastChangeTs;
    const continuousClosedMs = eyesCurrentlyClosed ? nowTs - lastChange : 0;
    const continuousCloseTriggered =
      continuousClosedMs >= CONTINUOUS_CLOSE_MS_ALERT;

    const mouth = landmarks.slice(60, 68);
    const MAR =
      (dist(mouth[2], mouth[6]) +
        dist(mouth[3], mouth[5]) +
        dist(mouth[1], mouth[7])) /
      (2 * dist(mouth[0], mouth[4]));
    const MAR_score = Math.min(1, MAR / YAWN_MAR_NORMALIZE);

    setMar((prev) => (Math.abs(prev - MAR_score) > 0.0005 ? MAR_score : prev));

    mouthRef.current = MAR_score;

    const leftEyeCenter = leftEye.reduce(
      (acc, p) => ({
        x: acc.x + p.x / leftEye.length,
        y: acc.y + p.y / leftEye.length,
      }),
      { x: 0, y: 0 }
    );
    const rightEyeCenter = rightEye.reduce(
      (acc, p) => ({
        x: acc.x + p.x / rightEye.length,
        y: acc.y + p.y / rightEye.length,
      }),
      { x: 0, y: 0 }
    );
    const eyeCenter = {
      x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
      y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
    };

    const nose = landmarks[30] ?? landmarks[Math.floor(landmarks.length / 2)];
    const vx = nose.x - eyeCenter.x;
    const vy = nose.y - eyeCenter.y;
    const pitchRad = Math.atan2(vy, Math.max(1e-6, vx));
    const pitchDeg = pitchRad * (180 / Math.PI);

    let pitchVel = 0;
    if (lastPitchRef.current != null && lastPitchTsRef.current != null) {
      const dt = (nowTs - lastPitchTsRef.current) / 1000;
      if (dt > 0) {
        const rawVel = (pitchDeg - (lastPitchRef.current ?? pitchDeg)) / dt;
        const prevVel = (lastPitchRef as any).currentVel ?? 0;
        const alpha = 0.5;
        const smoothed = prevVel * (1 - alpha) + rawVel * alpha;
        pitchVel = smoothed;
        (lastPitchRef as any).currentVel = smoothed;
      }
    }
    lastPitchRef.current = pitchDeg;
    lastPitchTsRef.current = nowTs;

    const absPitchDeg = Math.abs(pitchDeg);
    const absPitchVel = Math.abs(pitchVel);
    const headNodDetected =
      (pitchDeg > HEAD_NOD_ANGLE_DEG && absPitchVel > HEAD_NOD_VEL_DEG_PER_S) ||
      (absPitchVel > 2 * HEAD_NOD_VEL_DEG_PER_S &&
        absPitchDeg > HEAD_NOD_ANGLE_DEG / 2);

    let soundScore = 0;
    let detectedSoundWarning = false;
    try {
      const { envelope, times } = recentEnvelope(256);
      if (envelope && envelope.length >= 8) {
        const envSm = envelope.map((_, i, arr) => {
          const start = Math.max(0, i - 2);
          const slice = arr.slice(start, i + 1);
          return slice.reduce((s, x) => s + x, 0) / slice.length;
        });
        const peaks = detectPeaks(envSm, times, 14, 150, 1.0);
        const periodic = evaluatePeriodicity(peaks, 3, 500);
        if (periodic.ok) {
          const factor = Math.min(1, peaks.length / 6);
          soundScore += 1 * factor;
          detectedSoundWarning = true;
        } else if ((bandEnergyLow ?? 0) > 0.25) {
          soundScore += 0.5;
          detectedSoundWarning = true;
        }
      } else {
        if ((bandEnergyLow ?? 0) > 0.25) {
          soundScore += 0.4;
          detectedSoundWarning = true;
        }
      }
    } catch (e) {
      // silent
    }
    soundScore = Math.max(0, Math.min(1, soundScore));

    const W_EYES = 0.8;
    const W_PERCLOS = 0.5;
    const W_MAR = 0.35;
    const W_HEAD = 0.4;
    const W_SOUND = SOUND_SUPPORT_WEIGHT;

    const eyesInstant = continuousCloseTriggered
      ? 1
      : eyesCurrentlyClosed
      ? 0.9
      : 0;
    const perclosComponent = Math.min(1, perclos / PERCLOS_ALERT);
    const marComponent = MAR_score;
    const headComponent = headNodDetected
      ? 1
      : Math.min(1, Math.max(0, pitchDeg / 30));
    const soundComponent = soundScore;

    let newScoreUnsmoothed =
      W_EYES * eyesInstant +
      W_PERCLOS * perclosComponent +
      W_MAR * marComponent +
      W_HEAD * headComponent +
      W_SOUND * soundComponent;
    if (!Number.isFinite(newScoreUnsmoothed)) newScoreUnsmoothed = 0;
    newScoreUnsmoothed = Math.max(0, Math.min(1, newScoreUnsmoothed));

    const prevEma = emaRef.current ?? drowsyScore ?? 0;
    const ema =
      prevEma * (1 - SMOOTH_ALPHA) + newScoreUnsmoothed * SMOOTH_ALPHA;
    emaRef.current = ema;

    if (Math.abs((prevValuesRef.current.drowsyScore ?? 0) - ema) > 0.005) {
      prevValuesRef.current.drowsyScore = ema;
      setDrowsyScore(ema);
    }

    const isDrowsy = ema > 0.5;
    setDrowsyHistory((prev) => [
      ...prev.slice(-maxPoints + 1),
      isDrowsy ? 1 : 0,
    ]);

    if (Math.abs((prevValuesRef.current.perclos ?? 0) - perclos) > 0.002) {
      prevValuesRef.current.perclos = perclos;
      setPerclosState(perclos);
    }

    if (
      (prevValuesRef.current.continuousClose ?? false) !==
      continuousCloseTriggered
    ) {
      prevValuesRef.current.continuousClose = continuousCloseTriggered;
      setContinuousClose(continuousCloseTriggered);
    }

    let emotion = "neutral";
    if (expressions && typeof expressions === "object") {
      try {
        const exp = expressions as unknown as Record<string, number>;
        const best = Object.entries(exp).reduce(
          (a, b) => (a[1] > b[1] ? a : b),
          ["neutral", 0] as [string, number]
        );
        emotion = best[0] ?? "neutral";
      } catch {
        emotion = "neutral";
      }
    }
    if ((prevValuesRef.current.dominantEmotion ?? "") !== emotion) {
      prevValuesRef.current.dominantEmotion = emotion;
      setEmotionHistory((prev) => [...prev.slice(-maxPoints + 1), emotion]);
      setDominantEmotion(emotion);
    } else {
      setEmotionHistory((prev) => [...prev.slice(-maxPoints + 1), emotion]);
    }

    const newStatus: "DROWSY" | "AWAKE" = isDrowsy ? "DROWSY" : "AWAKE";
    const statusChanged = newStatus !== status;
    setStatus(newStatus);

    if ((prevValuesRef.current.blinkCount ?? 0) !== longBlinkCountRef.current) {
      prevValuesRef.current.blinkCount = longBlinkCountRef.current;
      setBlinkCount(longBlinkCountRef.current);
    }

    if (
      (prevValuesRef.current.soundWarning ?? false) !== detectedSoundWarning
    ) {
      prevValuesRef.current.soundWarning = detectedSoundWarning;
      setSoundWarning(detectedSoundWarning);
    }

    scheduleSave(false);
    if (SAVE_ON_STATUS_CHANGE && statusChanged) scheduleSave(true);
    if (continuousCloseTriggered) scheduleSave(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landmarksData, bandEnergyLow, volume, isSilent, isRunning]);

  return {
    status,
    drowsyScore,
    drowsyHistory,
    emotionHistory,
    calibrationProgress,
    blinkCount,
    blinkDetected,
    dominantEmotion,
    soundWarning,
    continuousClose,
    perclos: perclosState,
    startCalibration,
    stopCalibration,
    ear,
    mar,
  };
}
