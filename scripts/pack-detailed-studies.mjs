import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const notes={
  ear:'Reference-guided schematic ear: outer ear, auditory canal, separate ossicles, cochlea, semicircular canals, auditory tube, and nerve. Structures are separated and enlarged for visibility; this is not a temporal-bone scan.',
  'spinal-cord':'Reference-guided spinal cord with dorsal and ventral roots, ganglia, and cauda equina. The separate gray/white-matter section is enlarged; root pairs and branching are representative, not a complete segment count.',
  bladder:'Anterior cutaway showing the detrusor wall, urothelium, rugae, ureteric openings, trigone, and urethra. Wall thickness and folds are exaggerated for study.',
  thyroid:'One lobe is opened to show enlarged representative follicles and colloid. The other lobe, isthmus, tracheal rings, thyroid arteries, and posterior parathyroid glands provide gross-anatomy context. Follicles are not shown at life size.',
  spleen:'Reference-guided cutaway showing capsule, red pulp, enlarged representative white-pulp follicles, trabeculae, artery, and vein. Microscopic structures are exaggerated and vessel branching is schematic.',
  lymphatic:'Registered regional node groups, spleen, thymus, and tonsils from Z-Anatomy/BodyParts3D, with a separate enlarged schematic node cutaway showing cortex, follicles, medullary cords, and afferent/efferent vessels. Connecting body-wide vessels and the thoracic duct are not included.',
  'female-reproductive':'Registered uterus, ovaries, tubal subdivisions, fimbriae, supporting ligaments, and uterine vessels from the Human Reference Atlas female dataset. Internal histological layers are not exposed.',
  'male-reproductive':'Reference-guided study with one opened testis showing enlarged representative seminiferous tubules and septa, plus epididymides, deferent ducts, seminal vesicles, prostate, and prostatic urethra. It omits the penis and bladder; tubular counts and scale are schematic.',
  gallbladder:'Cutaway with visible wall and mucosal folds, cystic duct, common hepatic duct, common bile duct, and cystic artery. Wall thickness and folds are exaggerated; surrounding liver and duodenum are omitted.',
};
const output={};
const refined=JSON.parse(await readFile('app/lib/refined-models.json','utf8'));
let expanded=await readFile('app/lib/expanded-organs.ts','utf8');
for(const [id,note] of Object.entries(notes)){
  const doc=await io.read(`work/detailed-studies/${id}.glb`);
  await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const bytes=await io.writeBinary(doc);
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,8);
  const file=`${id}.${hash}.glb`;
  await writeFile(`public/models/${file}`,bytes);
  for(const old of (await readdir('public/models')).filter(f=>f.startsWith(id+'.')&&f!==file))await unlink(`public/models/${old}`);
  const report=JSON.parse(await readFile(`work/detailed-studies/${id}.json`,'utf8'));
  const names=new Set(doc.getRoot().listNodes().map(n=>n.getName()));
  for(const h of report.hotspots)if(!names.has(h.meshName))throw new Error(`${id}: missing ${h.meshName}`);
  output[id]={model:`/models/${file}`,note,hotspots:report.hotspots};
  refined[id]={url:`/models/${file}`,bytes:bytes.length,id,meshes:report.meshes,triangles:report.triangles};
  expanded=expanded.replace(new RegExp(`/models/${id}\\.[a-f0-9]{8}\\.glb`,'g'),`/models/${file}`);
  for(const [asset,size] of [['organ',640],['thumb',128]])await sharp(`work/detailed-studies/${id}.png`).resize(size,size).webp({quality:88}).toFile(`public/anatomy/${id}/${asset}.webp`);
  console.log(id,bytes.length,report.meshes,report.hotspots.length);
}
await writeFile('app/lib/detailed-studies.json',JSON.stringify(output,null,2)+'\n');
await writeFile('app/lib/refined-models.json',JSON.stringify(refined,null,2)+'\n');
await writeFile('app/lib/expanded-organs.ts',expanded);
