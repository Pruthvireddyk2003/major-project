"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

type ViewMode = "hourly" | "daily" | "weekly";

export default function DrowsinessChart({
  logs,
  view,
}: {
  logs: any[];
  view: ViewMode;
}) {
  const aggregatedLogs = useMemo(() => {
    if (!logs?.length) return [];

    const grouped: Record<string, { sum: number; count: number; ts: number }> =
      {};

    for (const log of logs) {
      const d = new Date(log.timestamp || log.createdAt);
      if (isNaN(d.getTime())) continue;

      let key = "";
      if (view === "hourly") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")} ${String(
          d.getHours()
        ).padStart(2, "0")}:00`;
      } else if (view === "daily") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(d.getDate()).padStart(2, "0")}`;
      } else {
        const firstDay = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(
          ((d.getTime() - firstDay.getTime()) / 86400000 +
            firstDay.getDay() +
            1) /
            7
        );
        key = `${d.getFullYear()}-W${weekNum}`;
      }

      if (!grouped[key]) {
        grouped[key] = { sum: 0, count: 0, ts: d.getTime() };
      }
      grouped[key].sum += log.drowsiness ?? 0;
      grouped[key].count += 1;
    }

    return Object.entries(grouped)
      .map(([period, { sum, count, ts }]) => ({
        period,
        avg: sum / count,
        ts,
      }))
      .sort((a, b) => a.ts - b.ts);
  }, [logs, view]);

  const data = {
    labels: aggregatedLogs.map((entry) => {
      if (view === "weekly") return entry.period;

      const d = new Date(entry.ts);
      if (view === "hourly")
        return d.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
        });
      if (view === "daily")
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
      return entry.period;
    }),
    datasets: [
      {
        label: `Avg Drowsiness (${
          view.charAt(0).toUpperCase() + view.slice(1)
        })`,
        data: aggregatedLogs.map((entry) => entry.avg),
        borderColor: "#2563EB",
        backgroundColor: "rgba(37, 99, 235, 0.2)",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#2563EB",
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `Avg Drowsiness: ${ctx.parsed.y.toFixed(2)}`,
        },
      },
    },
    scales: {
      y: { min: 0, max: 1, title: { display: true, text: "Drowsiness Level" } },
      x: {
        title: {
          display: true,
          text: view.charAt(0).toUpperCase() + view.slice(1),
        },
      },
    },
  };

  return (
    <motion.div
      className="flex flex-col flex-1"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex-1 min-h-[300px]">
        <Line data={data} options={options} />
      </div>
    </motion.div>
  );
}
