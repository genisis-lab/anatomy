/** Review candidates from the CC BY 4.0 Human Reference Atlas female v1.5.
 * Source metadata: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/metadata.json
 * Preserve world transforms and named structures; never synthesize missing anatomy.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { mkdir, writeFile } from 'node:fs/promises';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const groups = {
  'female-reproductive': /#VHF(Uterus|LeftFallopianTube|RightFallopianTube|LeftOvary|RightOvary|LigamentsUterusOvaries)$/,
  bladder: /#VHF(UrinaryBladder|Bladder)$/,
  spleen: /#VHFSpleen$/,
  'spinal-cord': /#VHFSpinalCord$/,
};
await mkdir('work/hra-studies', { recursive:true });
for (const [id, match] of Object.entries(groups)) {
  const doc = await io.read('work/z-anatomy/hra-female.glb');
  const structures = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const metadata = node.getExtras();
    const uterineVessel = id === 'female-reproductive' && /^VH_F_(left|right)_uterine_(artery|vein)$/.test(node.getName());
    if ((!match.test(metadata.anatomical_structure_of ?? '') && !uterineVessel) || metadata.label === '-') {
      node.setMesh(null);
    } else {
      structures.push({ name:node.getName(), label:metadata.label });
    }
  }
  if (!structures.length) { console.log(id, 'No matching structures; not exported'); continue; }
  await doc.transform(prune());
  await io.write(`work/hra-studies/${id}.glb`, doc);
  await writeFile(`work/hra-studies/${id}.json`, JSON.stringify(structures,null,2));
  console.log(id, structures);
}
