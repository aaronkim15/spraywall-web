import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: true,          // listen on the LAN (0.0.0.0) so phones on the same Wi-Fi can connect
    allowedHosts: true,  // accept tunnel hostnames (cloudflared/ngrok) in dev
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "SprayWall",
        short_name: "SprayWall",
        description: "Home spray wall climbs",
        theme_color: "#0d0d0f",
        background_color: "#0d0d0f",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
