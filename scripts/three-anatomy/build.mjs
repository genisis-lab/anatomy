// Builds the Three.js anatomy specimens into versioned, compressed GLBs.
//
//   node scripts/three-anatomy/build.mjs              # every specimen
//   node scripts/three-anatomy/build.mjs ear knee     # selected specimens
//   node scripts/three-anatomy/build.mjs ear --draft  # write to work/ only
//
// Published builds land in public/models/<id>.<hash>.glb and update
// app/lib/three-models.json (model URL, size, mesh counts, hotspot anchors).

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
import { bakeSpecimen } from "./kit/bake.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const organDirectory = join(root, "scripts/three-anatomy/organs");
const modelDirectory = join(root, "public/models");
const draftDirectory = join(root, "work/three-anatomy");
const manifestPath = join(root, "app/lib/three-models.json");

export const SPECIMENS = [
  "stomach", "skeleton", "muscles", "ear", "spinal-cord", "bladder", "thyroid", "lymphatic",
  "female-reproductive", "male-reproductive", "gallbladder", "airway-diaphragm", "spleen", "esophagus", "knee",
  "tooth", "tongue", "larynx", "adrenal-glands", "lumbar-spine", "hand",
];

const args = process.argv.slice(2);
const draft = args.includes("--draft");
const requested = args.filter((arg) => !arg.startsWith("--"));
const unknown = requested.filter((id) => !SPECIMENS.includes(id));
if (unknown.length) throw new Error(`Unknown specimen: ${unknown.join(", ")}`);
const ids = requested.length ? requested : SPECIMENS;

await MeshoptSimplifier.ready;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
mkdirSync(draft ? draftDirectory : modelDirectory, { recursive: true });

for (const id of ids) {
  console.log(`\n${id}`);
  const module = await import(pathToFileURL(join(organDirectory, `${id}.mjs`)).href);
  const specimen = await module.build();
  const result = await bakeSpecimen(specimen);
  if (draft) {
    writeFileSync(join(draftDirectory, `${id}.glb`), result.bytes);
    writeFileSync(join(draftDirectory, `${id}.json`), JSON.stringify(result.anchors, null, 2));
    continue;
  }
  const filename = `${id}.${result.hash}.glb`;
  for (const existing of readdirSync(modelDirectory)) {
    if (new RegExp(`^${id}\\.[a-f0-9]{8}\\.glb$`).test(existing) && existing !== filename) unlinkSync(join(modelDirectory, existing));
  }
  writeFileSync(join(modelDirectory, filename), result.bytes);
  manifest[id] = {
    model: `/models/${filename}`,
    bytes: result.bytes.length,
    meshes: result.meshes,
    triangles: result.triangles,
    anchors: result.anchors,
  };
}

if (!draft) {
  const ordered = Object.fromEntries(SPECIMENS.filter((id) => manifest[id]).map((id) => [id, manifest[id]]));
  writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`);
}
