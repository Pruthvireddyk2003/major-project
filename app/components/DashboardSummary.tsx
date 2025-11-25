"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

export default function DashboardSummary({ logs }: { logs: any[] }) {
  const summary = useMemo(() => {
    if (!logs.length) return null;

    // Average drowsiness
    const drowsinessVals = logs.map((l) => l.drowsiness ?? 0);
    const avgDrowsiness =
      drowsinessVals.reduce((a, b) => a + b, 0) / drowsinessVals.length;

    // Emotion frequency
    const emotionFreq: Record<string, number> = {};
    for (const log of logs) {
      if (log.emotion)
        emotionFreq[log.emotion] = (emotionFreq[log.emotion] || 0) + 1;
    }
    const frequentEmotion =
      Object.entries(emotionFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "Unknown";

    // Emotion scoring
    const emotionScoreMap: Record<string, number> = {
      HAPPY: 1,
      CALM: 1,
      NEUTRAL: 0.8,
      SAD: 0.5,
      ANGRY: 0.3,
      UNKNOWN: 0.7,
    };
    const positiveEmotionScore =
      emotionScoreMap[frequentEmotion.toUpperCase()] ?? 0.7;

    // Combined score
    const drivingScore = Math.max(
      0,
      Math.round((1 - avgDrowsiness) * 70 + positiveEmotionScore * 30)
    );

    // Suggestion
    let suggestion = "Good performance.";
    if (avgDrowsiness > 0.6 || positiveEmotionScore < 0.5)
      suggestion = "Take a break — you seem tired or stressed.";
    else if (avgDrowsiness > 0.4 || positiveEmotionScore < 0.7)
      suggestion = "Drive carefully — alertness or mood dropping.";

    return { avgDrowsiness, frequentEmotion, drivingScore, suggestion };
  }, [logs]);

  if (!summary)
    return <p className="text-gray-500 text-center mt-6">No data available.</p>;

  const cards = [
    {
      title: "Avg Drowsiness",
      value: `${(summary.avgDrowsiness * 100).toFixed(2)}%`,
      color: "from-blue-400 to-blue-600",
      svg: (
        <svg
          className="w-6 h-6 text-blue-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      ),
    },
    {
      title: "Frequent Emotion",
      value: summary.frequentEmotion.toUpperCase(),
      color: "from-purple-400 to-purple-600",
      svg: (
        <svg
          className="w-6 h-6 text-purple-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      ),
    },
    {
      title: "Driving Score",
      value: summary.drivingScore,
      color: "from-green-400 to-green-600",
      svg: (
        <svg
          className="w-6 h-6 text-green-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="M3 12h18M12 3v18" />
        </svg>
      ),
    },
    {
      title: "Suggestion",
      value: summary.suggestion,
      color: "from-amber-400 to-amber-600",
      svg: (
        <svg
          className="w-6 h-6 text-amber-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <polygon points="12,2 22,22 2,22" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 w-full">
      {cards.map((card, idx) => (
        <motion.div
          key={idx}
          className="w-full bg-white rounded-2xl shadow-lg p-6 hover:scale-105 transition-transform relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
        >
          <div
            className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${card.color}`}
          />
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500">{card.title}</h3>
            {card.svg}
          </div>
          <p className="text-xl font-bold text-gray-800 leading-snug">
            {card.value}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
