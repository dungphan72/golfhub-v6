import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Golf Hub | The digital home of golf",
    template: "%s | Golf Hub",
  },
  description:
    "Golf Hub connects golfers, golf courses, and businesses across Vietnam.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
