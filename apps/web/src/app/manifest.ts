import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DineSense",
    short_name: "DineSense",
    lang: "en-IN",
    dir: "ltr",
    description: "Table timers, live orders and service tasks for the restaurant floor",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    launch_handler: { client_mode: "navigate-existing" },
    prefer_related_applications: false,
    background_color: "#0B0A08",
    theme_color: "#0B0A08",
    categories: ["business", "food", "productivity"],
    shortcuts: [
      {
        name: "Waiter floor",
        short_name: "Waiter",
        url: "/waiter",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Kitchen board",
        short_name: "Kitchen",
        url: "/chef",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Reception",
        short_name: "Reception",
        url: "/reception",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Owner dashboard",
        short_name: "Owner",
        url: "/admin",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
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
