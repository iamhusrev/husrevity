import type { MetadataRoute } from "next";

// Next injects <link rel="manifest" href="/manifest.webmanifest"> automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Husrevity",
    short_name: "husrevity",
    description:
      "Notlar, listeler, projeler, görevler, takvim ve anımsatıcılar için kişisel üretkenlik uygulaması.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ec",
    theme_color: "#a14d18",
    lang: "tr",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
