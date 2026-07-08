import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Voice OS — Admin",
  description: "Multi-Tenant AI Voice SaaS — admin console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
