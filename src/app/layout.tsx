import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/src/components/providers/ConvexClientProvider";
import Navigation from "@/src/components/Navigation";
import { ThemeProvider } from "@/src/components/ThemeProvider";
import { ToastProvider } from "@/src/components/common/Toast";
import { AmbientBackground } from "@/src/components/AmbientBackground";

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
  icons: {
    icon: "/icon.svg",
    apple: [
      { url: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  },
  appleWebApp: {
    title: "FleetCore",
    capable: true,
    statusBarStyle: "black-translucent",
  },
  other: {
    "theme-color": "#0B1220",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
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
              <div className="flex h-screen overflow-hidden bg-[var(--background)]">
                {/* Ambient background blobs */}
                <AmbientBackground />

                {/* Sidebar */}
                <Navigation />

                {/* Main content area */}
                <main className="flex-1 min-w-0 relative flex flex-col overflow-auto scrollbar-fleet">
                  {children}
                </main>
              </div>
            </ToastProvider>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
