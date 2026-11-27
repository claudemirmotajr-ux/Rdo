import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icone.svg"],
      manifest: {
        name: "RDO Pavimentação",
        short_name: "RDO",
        description: "Diário de obra, levantamento e não conformidades da pavimentação",
        lang: "pt-BR",
        start_url: ".",
        display: "standalone",
        background_color: "#ECEEEA",
        theme_color: "#2A2E32",
        icons: [
          { src: "icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // Só a "casca" do app fica guardada no celular. Dados e fotos
        // vêm sempre do servidor (nunca ficam em cache compartilhado).
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
    }),
  ],
});
