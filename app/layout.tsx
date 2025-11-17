import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cricket DRS HawkEye Analyzer",
  description:
    "Analyze cricket bowling footage and visualize deliveries in a Hawk-Eye inspired 3D view."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
