import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Was "/NUForce/" while hosted at jmcadoo1029.github.io/NUForce/.
  // Switched to "/" for the custom domain nuforce.nulabs.com (Phase 1 of merge).
  // Must be merged to main IN THE SAME ACTION as setting the GitHub Pages custom
  // domain — otherwise asset paths break on whichever side moves first.
  base: "/",
  build: {
    outDir: "dist",
  },
});
