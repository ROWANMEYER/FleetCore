import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/src/components/providers/ConvexClientProvider";
import Navigation from "@/src/components/Navigation";
import { ThemeProvider } from "@/src/components/ThemeProvider";
import { ToastProvider } from "@/src/components/common/Toast";
import { AmbientBackground } from "@/src/components/AmbientBackground";
import { PwaInstaller } from "@/src/components/PwaInstaller";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FleetCore",
  description: "Transport Management System",
  applicationName: "FleetCore",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: [
      { url: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" },
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    title: "FleetCore",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F0F4F8" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} antialiased`}
      >
        <ThemeProvider>
          <ConvexClientProvider>
            <ToastProvider>
              <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
                {/* Ambient background blobs */}
                <AmbientBackground />

                {/* Sidebar (drawer on mobile) */}
                <Navigation />

                {/* Main content area */}
                <main className="flex-1 min-w-0 relative flex flex-col overflow-auto scrollbar-fleet pt-14 md:pt-0">
                  {children}
                </main>
              </div>

              {/* PWA install prompt + service worker registration */}
              <PwaInstaller />
            </ToastProvider>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
