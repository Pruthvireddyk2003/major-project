import "./globals.css";
import { Toaster } from "react-hot-toast";
import type { ReactNode } from "react";
import Navbar from "./components/Navbar";

export const metadata = {
  title: "Driver Monitoring System",
  description: "Real-time driver monitoring and emotion recognition",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="bg-gray-100 text-gray-900 h-full flex flex-col">
        <Navbar />
        <main className="flex-1 w-full">{children}</main>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
