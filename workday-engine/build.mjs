// Bundles the engine + OptimHire adapter into one content script:
//   npm install && npm run build   →   <deployment folder>/assets/wd-engine.js
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const deploy = readdirSync(root).find((d) => d.includes("DEPLOYMENT READY"));
if (!deploy) throw new Error("deployment folder not found next to workday-engine/");

await build({
  entryPoints: [join(here, "src/oh/entry.ts")],
  outfile: join(root, deploy, "assets/wd-engine.js"),
  bundle: true,
  format: "iife",
  target: "chrome110",
  charset: "utf8",
  legalComments: "none",
  banner: { js: "/* wd-engine.js — built from workday-engine/ (npm run build). Do not edit here. */" },
  logLevel: "info",
});
