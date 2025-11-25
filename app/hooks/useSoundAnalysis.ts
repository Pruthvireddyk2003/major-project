import { useCallback, useEffect, useRef, useState } from "react";

export function useSoundAnalysis({
  sampleIntervalMs = 200,
  analyserFftSize = 2048,
  smoothingTimeConstant = 0.3,
  silenceDbThreshold = -55,
  silenceSeconds = 5,
  varianceWindowSize = 8,
  lowBandStartHz = 50,
  lowBandEndHz = 300,
  autoStart = false,
} = {}) {
  const [volume, setVolume] = useState<number>(0);
  const [bandEnergyLow, setBandEnergyLow] = useState<number>(0);
  const [isSilent, setIsSilent] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const dummyGainRef = useRef<GainNode | null>(null);

  const cfgRef = useRef({
    sampleIntervalMs,
    analyserFftSize,
    smoothingTimeConstant,
    silenceDbThreshold,
    silenceSeconds,
    varianceWindowSize,
    lowBandStartHz,
    lowBandEndHz,
  });

  const lastSampleTimeRef = useRef<number>(0);
  const silenceStartRef = useRef<number | null>(null);
  const varianceBufRef = useRef<number[]>([]);
  const envelopeBufferRef = useRef<number[]>([]);
  const envelopeTimeRef = useRef<number[]>([]);

  const lastVolumeRef = useRef<number>(volume);
  const lastBandRef = useRef<number>(bandEnergyLow);
  const lastSilentRef = useRef<boolean>(isSilent);

  useEffect(() => {
    cfgRef.current = {
      sampleIntervalMs,
      analyserFftSize,
      smoothingTimeConstant,
      silenceDbThreshold,
      silenceSeconds,
      varianceWindowSize,
      lowBandStartHz,
      lowBandEndHz,
    };
  }, [
    sampleIntervalMs,
    analyserFftSize,
    smoothingTimeConstant,
    silenceDbThreshold,
    silenceSeconds,
    varianceWindowSize,
    lowBandStartHz,
    lowBandEndHz,
  ]);

  const computeRmsDb = (timeDomain: Float32Array) => {
    let sum = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const v = timeDomain[i];
      sum += v * v;
    }
    const mean = sum / Math.max(1, timeDomain.length);
    const rms = Math.sqrt(mean) || 1e-12;
    const db = 20 * Math.log10(rms);
    return Math.max(db, -120);
  };

  const computeSpectralVariance = (mag: Float32Array) => {
    if (!mag.length) return 0;
    let mean = 0;
    for (let i = 0; i < mag.length; i++) mean += mag[i];
    mean /= mag.length;
    let varSum = 0;
    for (let i = 0; i < mag.length; i++) {
      const d = mag[i] - mean;
      varSum += d * d;
    }
    return varSum / mag.length;
  };

  const computeLowBandRatio = (
    analyser: AnalyserNode,
    startHz: number,
    endHz: number
  ) => {
    try {
      const freqCount = analyser.frequencyBinCount;
      const freqData = new Float32Array(freqCount);
      analyser.getFloatFrequencyData(freqData); // dB
      const sampleRate = audioContextRef.current?.sampleRate ?? 48000;
      const fftSize = analyser.fftSize;
      const freqPerBin = sampleRate / fftSize;
      const startBin = Math.max(0, Math.floor(startHz / freqPerBin));
      const endBin = Math.min(freqCount - 1, Math.floor(endHz / freqPerBin));
      let sumMag = 0;
      for (let i = startBin; i <= endBin; i++) {
        const db = freqData[i];
        if (!Number.isFinite(db)) continue;
        sumMag += Math.pow(10, db / 20);
      }
      let total = 0;
      for (let i = 0; i < freqCount; i++) {
        const db = freqData[i];
        if (!Number.isFinite(db)) continue;
        total += Math.pow(10, db / 20);
      }
      if (total <= 0) return 0;
      return Math.max(0, Math.min(1, sumMag / total));
    } catch (e) {
      return 0;
    }
  };

  const sampleFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    sampleFnRef.current = function sampleAudio() {
      const analyser = analyserRef.current;
      if (!analyser) {
        rafRef.current = requestAnimationFrame(sampleFnRef.current);
        return;
      }

      const now = performance.now();
      const delta = now - lastSampleTimeRef.current;
      if (delta < cfgRef.current.sampleIntervalMs) {
        rafRef.current = requestAnimationFrame(sampleFnRef.current);
        return;
      }
      lastSampleTimeRef.current = now;

      const bufferLen = analyser.fftSize;
      const timeDomain = new Float32Array(bufferLen);
      try {
        analyser.getFloatTimeDomainData(timeDomain);
      } catch (e) {
        rafRef.current = requestAnimationFrame(sampleFnRef.current);
        return;
      }
      const db = computeRmsDb(timeDomain);

      const freqCount = analyser.frequencyBinCount;
      const freq = new Float32Array(freqCount);
      analyser.getFloatFrequencyData(freq);
      const mag = new Float32Array(freqCount);
      for (let i = 0; i < freqCount; i++) {
        const val = freq[i];
        mag[i] = Number.isFinite(val) ? Math.pow(10, val / 20) : 0;
      }
      const specVar = computeSpectralVariance(mag);

      const specVarThreshold = 1e-8;
      const currentlySilent =
        db < cfgRef.current.silenceDbThreshold && specVar < specVarThreshold;

      const normalized = Math.max(0, Math.min(1, (db + 120) / 120));

      const bandRatio = computeLowBandRatio(
        analyser,
        cfgRef.current.lowBandStartHz,
        cfgRef.current.lowBandEndHz
      );

      const envVal = Math.round(bandRatio * 100);
      envelopeBufferRef.current.push(envVal);
      envelopeTimeRef.current.push(Date.now());
      const MAX_ENV = 512;
      if (envelopeBufferRef.current.length > MAX_ENV) {
        envelopeBufferRef.current.shift();
        envelopeTimeRef.current.shift();
      }

      const vbuf = varianceBufRef.current;
      vbuf.push(specVar);
      if (vbuf.length > cfgRef.current.varianceWindowSize) vbuf.shift();

      if (currentlySilent) {
        if (silenceStartRef.current === null) silenceStartRef.current = now;
        const elapsed = now - (silenceStartRef.current ?? now);
        if (elapsed >= cfgRef.current.silenceSeconds * 1000) {
          if (!lastSilentRef.current) {
            lastSilentRef.current = true;
            setIsSilent(true);
          }
        }
      } else {
        if (lastSilentRef.current) {
          lastSilentRef.current = false;
          setIsSilent(false);
        }
        silenceStartRef.current = null;
      }

      const EPS = 0.005;
      if (Math.abs(normalized - lastVolumeRef.current) > EPS) {
        lastVolumeRef.current = normalized;
        setVolume(normalized);
      }

      if (Math.abs(bandRatio - lastBandRef.current) > EPS) {
        lastBandRef.current = bandRatio;
        setBandEnergyLow(bandRatio);
      }

      rafRef.current = requestAnimationFrame(sampleFnRef.current);
    };

    return () => {
      // nothing
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setPermissionGranted(true);

      const Ac = (window.AudioContext ||
        (window as any).webkitAudioContext) as any;
      const ac: AudioContext = new Ac();
      audioContextRef.current = ac;

      if (ac.state === "suspended") {
        try {
          await ac.resume();
        } catch (e) {
          // ignore
        }
      }

      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = cfgRef.current.analyserFftSize;
      analyser.smoothingTimeConstant = cfgRef.current.smoothingTimeConstant;
      try {
        analyser.minDecibels = -120;
        analyser.maxDecibels = -10;
      } catch {}

      const dummy = ac.createGain();
      dummy.gain.value = 0;
      source.connect(analyser);
      analyser.connect(dummy);
      try {
        dummy.connect(ac.destination);
      } catch {}

      analyserRef.current = analyser;
      dummyGainRef.current = dummy;

      lastSampleTimeRef.current = 0;
      silenceStartRef.current = null;
      varianceBufRef.current = [];
      envelopeBufferRef.current = [];
      envelopeTimeRef.current = [];
      lastVolumeRef.current = 0;
      lastBandRef.current = 0;
      lastSilentRef.current = false;

      setIsRunning(true);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(sampleFnRef.current);
    } catch (e) {
      console.error("useSoundAnalysis start failed", e);
      setPermissionGranted(false);
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (dummyGainRef.current) {
        try {
          dummyGainRef.current.disconnect();
        } catch {}
        dummyGainRef.current = null;
      }
      analyserRef.current = null;
    } finally {
      setIsRunning(false);
      setIsSilent(false);
      setBandEnergyLow(0);
      envelopeBufferRef.current = [];
      envelopeTimeRef.current = [];
      lastVolumeRef.current = 0;
      lastBandRef.current = 0;
      lastSilentRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoStart) {
      start().catch((e) => console.error("auto start failed", e));
    }
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentEnvelope = useCallback((maxSamples = 120) => {
    const env = envelopeBufferRef.current.slice(-maxSamples);
    const times = envelopeTimeRef.current.slice(-maxSamples);
    return { envelope: env, times };
  }, []);

  return {
    volume,
    bandEnergyLow,
    isSilent,
    permissionGranted,
    isRunning,
    start,
    stop,
    recentEnvelope,
  };
}
