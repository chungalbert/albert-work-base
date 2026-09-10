import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/albert-work-base/" : "/",
  optimizeDeps: {
    include: ["frappe-gantt/dist/frappe-gantt.js"],
    needsInterop: ["frappe-gantt/dist/frappe-gantt.js"],
  },
});
