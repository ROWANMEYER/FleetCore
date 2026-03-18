import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/src/components/providers/ConvexClientProvider";
import Navigation from "@/src/components/Navigation";
import { BackgroundProvider } from "@/src/components/BackgroundProvider";

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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 flex flex-col h-screen overflow-hidden`}
      >
        <ConvexClientProvider>
          <BackgroundProvider>
            <div
              className="flex flex-col h-screen overflow-hidden"
              style={{
                backgroundImage:
                  "var(--fleetcore-wallpaper), url('https://wallpaperaccess.com/full/4292206.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
                backgroundColor: "#87ceeb",
              }}
            >
              <Navigation />
              <main className="flex-1 min-h-0 w-full relative flex flex-col overflow-hidden">
                {children}
              </main>
            </div>
          </BackgroundProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
