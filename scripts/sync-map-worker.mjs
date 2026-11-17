import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("maplibre-gl/package.json"));
const target = resolve(import.meta.dirname, "../public/maplibre");
await mkdir(target, { recursive: true });
await copyFile(
  resolve(root, "dist/maplibre-gl-worker.mjs"),
  resolve(target, "maplibre-gl-worker.mjs"),
);
await copyFile(resolve(root, "LICENSE.txt"), resolve(target, "LICENSE.txt"));
