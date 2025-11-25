"use client";

import { Pie } from "react-chartjs-2";
import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

type ViewMode = "hourly" | "daily" | "weekly";

export default function EmotionChart({
  logs,
  view,
}: {
  logs: any[];
  view: ViewMode;
}) {
  const emotionCounts = logs.reduce((acc: Record<string, number>, log) => {
    if (log.emotion) acc[log.emotion] = (acc[log.emotion] || 0) + 1;
    return acc;
  }, {});

  const data = {
    labels: Object.keys(emotionCounts),
    datasets: [
      {
        data: Object.values(emotionCounts),
        backgroundColor: [
          "#3B82F6",
          "#EF4444",
          "#10B981",
          "#F59E0B",
          "#8B5CF6",
          "#EC4899",
          "#6366F1",
          "#14B8A6",
        ],
        borderWidth: 2,
        borderColor: "#fff",
      },
    ],
  };

  const options: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: true, position: "right" },
      tooltip: { enabled: true },
    },
  };

  return (
    <motion.div
      className="flex-1 h-[300px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="text-xs text-gray-500 mb-2 text-right">
        {view === "hourly" && "Last 7 days"}
        {view === "daily" && "Last 15 days"}
        {view === "weekly" && "Last 90 days"}
      </div>
      <div className="w-full h-full">
        <Pie data={data} options={options} />
      </div>
    </motion.div>
  );
}
