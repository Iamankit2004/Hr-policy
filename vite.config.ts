import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

// Deployment target: Vercel serverless functions. To deploy elsewhere
// (Node server, Cloudflare Workers, Netlify, etc.), change `preset` below —
// see https://nitro.build/deploy for the full list of supported presets.
export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    ...tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    nitro({ preset: "vercel" }),
  ],
});
