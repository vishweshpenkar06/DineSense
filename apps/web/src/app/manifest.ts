import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DineSense",
    short_name: "DineSense",
    description: "Table timers, live orders and service tasks for the restaurant floor",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#020617",
    theme_color: "#020617",
    categories: ["business", "food", "productivity"],
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
