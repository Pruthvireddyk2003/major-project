"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem("token", data.token);
      localStorage.setItem("driverId", data.driver.id);

      toast.success(`Welcome, ${data.driver.name}!`);
      router.push("/");
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="relative space-y-6 bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md z-20"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
    >
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
        Welcome Back
      </h2>

      <div className="relative">
        <input
          type="email"
          placeholder="Email"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition peer"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <motion.div
          className="absolute bottom-0 left-0 h-1 bg-blue-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: email ? "100%" : 0 }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="relative">
        <input
          type="password"
          placeholder="Password"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition peer"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <motion.div
          className="absolute bottom-0 left-0 h-1 bg-blue-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: password ? "100%" : 0 }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <motion.button
        type="submit"
        disabled={loading}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition disabled:opacity-60 font-semibold"
      >
        {loading ? "Logging in..." : "Login"}
      </motion.button>
    </motion.form>
  );
}
