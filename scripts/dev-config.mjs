// What `tauri dev` must change to use another port of the development server: the address it opens.
// Printed as JSON, for `tauri dev --config`.
// Usage: node scripts/dev-config.mjs <port>
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error(`not a port: ${process.argv[2] ?? ""} (1024–65535)`);
  process.exit(1);
}
console.log(JSON.stringify({ build: { devUrl: `http://localhost:${port}` } }));
