import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lie Hard Game Show",
  description: "Operator Panel & Display",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Remove default font classes to allow globals.css to take priority */}
      <body>
        {children}
      </body>
    </html>
  );
}
