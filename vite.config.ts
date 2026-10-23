// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      // The whole project is mounted in Docker: skip folders the web app never imports.
      watch: { ignored: ["**/apps/**", "**/.output/**", "**/.wrangler/**", "**/screenshots/**"] },
      // Public demo tunnels (npx localtunnel --port 8090).
      allowedHosts: [".loca.lt"],
      // Never serve local secrets/test credentials from the dev server.
      fs: { deny: [".env", ".env.*", "*.local", "*.{crt,pem,key}", "db/**", "docker-compose.yml"] },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
