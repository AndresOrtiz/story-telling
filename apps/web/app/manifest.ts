import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Collective Story",
    short_name: "Story",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1214",
    theme_color: "#0b1214",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
