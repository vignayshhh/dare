import type { Metadata } from "next";
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
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, user-scalable=yes, maximum-scale=5.0"
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
