import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Prevent browser/CDN from caching trade data JSON files
        source: "/data/:path*.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js requires unsafe-inline + unsafe-eval for hydration scripts
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Supabase HTTP + WebSocket (Supabase Realtime uses wss://). GA4 collect endpoints use regional subdomains.
              "connect-src 'self' https://izvnmsrjygshtperrwqk.supabase.co wss://izvnmsrjygshtperrwqk.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
              "img-src 'self' data: blob: https://www.google-analytics.com",
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
