"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { motion } from "framer-motion";

import DrowsinessChart from "@/components/DrowsinessChart";
import EmotionChart from "@/components/EmotionChart";
import DashboardSummary from "@/components/DashboardSummary";
import { getToken, requireAuth } from "@/lib/auth";

interface DriverLog {
  id: string;
  drowsiness?: number;
  emotion?: string;
  timestamp?: string;
  createdAt: string;
}

type ViewResolution = "hourly" | "daily" | "weekly";
type RangePreset = "7d" | "15d" | "90d" | "custom";

export default function Dashboard() {
  const router = useRouter();
  const [logs, setLogs] = useState<DriverLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [resolution, setResolution] = useState<ViewResolution>("hourly");

  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  useEffect(() => {
    requireAuth();
    const driverId = localStorage.getItem("driverId");
    if (!driverId) return;

    const fetchLogs = async () => {
      try {
        const token = getToken();
        const res = await fetch(`/api/logs/driver?driverId=${driverId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch logs");
        const data = await res.json();
        setLogs(data.logs);
      } catch (err: any) {
        toast.error(err.message || "Failed to load dashboard");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [router]);

  const filteredLogs = useMemo(() => {
    if (!logs?.length) return [];

    const now = new Date();
    let from: Date;
    let to: Date = now;

    if (rangePreset === "custom" && customFrom && customTo) {
      const f = new Date(customFrom);
      const t = new Date(customTo);
      if (isNaN(f.getTime()) || isNaN(t.getTime())) {
        return logs;
      }
      from = f;
      to = t;
    } else {
      from = new Date();
      if (rangePreset === "7d") {
        from.setDate(now.getDate() - 7);
      } else if (rangePreset === "15d") {
        from.setDate(now.getDate() - 15);
      } else if (rangePreset === "90d") {
        from.setDate(now.getDate() - 90);
      } else {
        from.setDate(now.getDate() - 7);
      }
    }

    return logs.filter((log) => {
      const d = new Date((log as any).timestamp || log.createdAt);
      if (isNaN(d.getTime())) return false;
      return d >= from && d <= to;
    });
  }, [logs, rangePreset, customFrom, customTo]);

  if (loading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50">
        <motion.div
          className="w-64 h-6 bg-gray-200 rounded-full"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
        <motion.div
          className="w-80 h-48 bg-gray-200 rounded-2xl"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
        />
      </div>
    );

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col items-stretch">
      <div className="flex flex-col md:flex-row items-center justify-between mt-16 px-6 md:px-12 gap-4">
        <motion.h1
          className="text-4xl font-bold text-gray-800 text-center md:text-left"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          Driver Dashboard
        </motion.h1>

        <motion.div
          className="flex flex-col sm:flex-row items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Range:</span>
            <select
              className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white focus:ring-1 focus:ring-blue-400"
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value as RangePreset)}
            >
              <option value="7d">Last 7 days</option>
              <option value="15d">Last 15 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {rangePreset === "custom" && (
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <label className="flex items-center gap-1">
                <span className="text-gray-600">From:</span>
                <input
                  type="date"
                  className="border border-gray-300 rounded-md px-2 py-1 bg-white"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-gray-600">To:</span>
                <input
                  type="date"
                  className="border border-gray-300 rounded-md px-2 py-1 bg-white"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Resolution:</span>
            <select
              className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white focus:ring-1 focus:ring-blue-400"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ViewResolution)}
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="w-full mt-12 flex flex-col md:flex-row gap-6 px-6 md:px-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <DashboardSummary logs={filteredLogs} />
      </motion.div>

      <div className="w-full mt-16 flex flex-col lg:flex-row gap-6 px-6 md:px-12 pb-12">
        <motion.div
          className="lg:flex-[2] bg-white rounded-2xl shadow-lg p-6 min-h-[400px]"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <h2 className="text-xl font-semibold mb-4">Drowsiness Trends</h2>
          <DrowsinessChart logs={filteredLogs} view={resolution} />
        </motion.div>

        <motion.div
          className="lg:flex-[1] bg-white rounded-2xl shadow-lg p-6 min-h-[400px]"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <h2 className="text-xl font-semibold mb-4">Emotion Distribution</h2>
          <EmotionChart logs={filteredLogs} view={resolution} />
        </motion.div>
      </div>
    </div>
  );
}
