import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poketable · Multipliez-les tous !",
  description: "Révise tes tables de multiplication : trouve le code du coffre et attrape les Pokémon !",
  icons: { icon: "/pokemon/025-pikachu.webp" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e3350d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
