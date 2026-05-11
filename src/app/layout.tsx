import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DARE - Social Dare Challenge App",
  description: "Challenge your friends with dares and see who completes them",
  applicationName: "DARE",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DARE",
    statusBarStyle: "black-translucent",
  },
  // Cache busting for development
  other: {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  },
  openGraph: {
    title: "DARE - Social Dare Challenge App",
    description: "Challenge your friends with dares and see who completes them",
    type: "website",
    locale: "en_US",
    url: "https://dare-web-app.vercel.app",
    siteName: "DARE",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DARE Social Challenge App",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DARE - Social Dare Challenge App",
    description: "Challenge your friends with dares and see who completes them",
    images: {
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "DARE Social Challenge App",
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0a0f0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
