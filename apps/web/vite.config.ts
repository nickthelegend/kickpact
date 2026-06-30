import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // WDK (@tetherto/wdk-wallet-evm) is built for Node/Bare and pulls in
    // sodium-universal + Node core modules. Polyfill them for the browser.
    nodePolyfills({
      include: ["buffer", "process", "stream", "events", "util", "crypto", "vm"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["@tetherto/wdk-wallet-evm", "sodium-javascript"],
  },
})
