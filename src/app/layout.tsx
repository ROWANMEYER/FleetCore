import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/src/components/providers/ConvexClientProvider";
import Navigation from "@/src/components/Navigation";
import { ThemeProvider } from "@/src/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FleetCore",
  description: "Transport Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden`}
      >
        <ThemeProvider>
          <ConvexClientProvider>
            <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">
              <Navigation />
              <main className="flex-1 min-h-0 w-full relative flex flex-col overflow-auto bg-gray-50 dark:bg-slate-950">
                {children}
              </main>
            </div>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
