"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setLoggedIn(!!token);
  }, [pathname]);

  if (pathname === "/login") return null;

  return (
    <nav className="w-full bg-white shadow-md sticky top-0 z-50">
      <div className="flex justify-between items-center w-full px-8 py-4">
        <h1
          className="text-2xl font-bold text-blue-600 cursor-pointer"
          onClick={() => router.push("/")}
        >
          Driver Monitoring
        </h1>
        {loggedIn && (
          <div className="flex items-center space-x-6">
            <button
              onClick={() => router.push("/")}
              className={`text-gray-700 hover:text-blue-600 ${
                pathname === "/" ? "font-semibold" : ""
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/live")}
              className={`text-gray-700 hover:text-blue-600 ${
                pathname === "/live" ? "font-semibold" : ""
              }`}
            >
              Live
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("driverId");
                toast.success("Logged out");
                router.push("/login");
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
