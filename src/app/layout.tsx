import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Libre_Caslon_Text } from "next/font/google";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const caslon = Libre_Caslon_Text({
  variable: "--font-caslon",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "600"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CaseLab Criminology",
  description:
    "A student's archive of real criminal cases: summaries, sources, flashcards, quizzes and both sides of the argument.",
};

export const viewport: Viewport = { themeColor: "#141312", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anton.variable} ${caslon.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
