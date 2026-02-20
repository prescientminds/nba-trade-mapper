import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBA Trade Impact Mapper",
  description: "Trace the ripple effects of NBA trades across time",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
