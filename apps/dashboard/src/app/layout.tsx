import type { Metadata } from "next";
import { ThemeProvider } from "@3cx-dash/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "3CX Dashboard",
  description: "3CX Telefonanlage – Live-Monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
