// Vite configuration for React + Tailwind CSS v4
// Using the @tailwindcss/vite plugin (Tailwind v4 approach — no tailwind.config.js needed)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind v4 vite plugin
  ],
});
