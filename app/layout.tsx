import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ryanmullenuk.github.io"),
  title: "UK² — Claim your place on the map",
  description: "10,000 squares. One iconic island. Own a permanent piece of the UK² map and make your mark.",
  openGraph: {
    title: "UK² — Claim your place on the map",
    description: "10,000 squares. One iconic island. Own a permanent piece of the UK² map and make your mark.",
    type: "website",
    images: [{ url: "/UK2/og.png", width: 1200, height: 630, alt: "UK² — Claim your place on the map" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "UK² — Claim your place on the map",
    description: "10,000 squares. One iconic island. Own a permanent piece of the UK² map and make your mark.",
    images: ["/UK2/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
