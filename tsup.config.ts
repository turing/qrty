import { defineConfig } from "tsup";

// Builds the publishable JS. Dev still runs the TypeScript sources directly
// (`node src/cli.ts`); this exists only because Node refuses to type-strip files
// under node_modules, so a real `npm install` needs compiled output.
export default defineConfig({
  entry: ["src/cli.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node23.6",
  bundle: true,
  clean: true,
  dts: false,
  // deps (commander, ajv, qr-code-styling, canvas, …) stay external and resolve
  // from node_modules at runtime; only our own source is bundled.
});
