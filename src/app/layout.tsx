import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://nbatrades.vercel.app",
  ),
  title: "NBA Trade Mapper",
  description: "Trace the ripple effects of NBA trades across time",
  openGraph: {
    title: "NBA Trade Mapper",
    description: "Trace the ripple effects of NBA trades across time",
    siteName: "NBA Trade Mapper",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NBA Trade Mapper",
    description: "Trace the ripple effects of NBA trades across time",
  },
};

// Prevent browser-level pinch zoom — let React Flow own all zoom gestures
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-0RFVS7FN50"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0RFVS7FN50');
          `}
        </Script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
