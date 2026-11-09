import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * The commit it is built from, with "*" at the end if there are uncommitted changes (in that case
 * the commit is only the starting point). Empty if unknown. In the `build-linux.sh` container
 * there is no `.git` (the `.dockerignore` excludes it): the script passes it in `NURDIFF_COMMIT`.
 */
function gitCommit(): string {
  const given = process.env.NURDIFF_COMMIT?.trim();
  if (given) return given;
  try {
    const run = (cmd: string) => execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return run("git rev-parse --short HEAD") + (run("git status --porcelain") ? "*" : "");
  } catch {
    return "";
  }
}

// The port of the development server: 1420 (tauri.conf.json points there), or the one in NURDIFF_DEV_PORT, which
// `./scripts/dev.sh gui <port>` sets together with the address Tauri opens (to run two apps at once).
const port = Number(process.env.NURDIFF_DEV_PORT) || 1420;

export default defineConfig({
  plugins: [react()],
  // The moment the build (or the development server) starts: shown by "About NurDiff".
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
  },
  clearScreen: false,
  server: {
    port,
    strictPort: true,
  },
  // Tests of the pure logic of the UI (src/lib), without a browser
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
