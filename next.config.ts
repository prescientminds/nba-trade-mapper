import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires unsafe-inline + unsafe-eval for hydration scripts
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Supabase HTTP + WebSocket (Supabase Realtime uses wss://)
              "connect-src 'self' https://izvnmsrjygshtperrwqk.supabase.co wss://izvnmsrjygshtperrwqk.supabase.co",
              "img-src 'self' data: blob:",
              // ELK.js layout engine runs in a Web Worker
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          // Prevent the app from being embedded in iframes (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
