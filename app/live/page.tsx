"use client";
import { useEffect, useState } from "react";
import LiveDashboard from "@/components/LiveDashboard";

export default function LivePage() {
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDriver = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }

      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          window.location.href = "/login";
          return;
        }

        const data = await res.json();
        setDriverId(data.driver.id);
      } catch (err) {
        console.error("Failed to fetch driver info:", err);
        window.location.href = "/login";
      } finally {
        setLoading(false);
      }
    };

    fetchDriver();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!driverId) return <div>Unauthorized</div>;

  return <LiveDashboard driverId={driverId} />;
}
