import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const ids = ['stomach','skeleton','muscles','ear','spinal-cord','bladder','thyroid','lymphatic','female-reproductive','male-reproductive','gallbladder','airway-diaphragm','spleen','esophagus','knee'];
const source = 'work/blender-source';
const output = 'work/blender-output';
await mkdir(source, { recursive:true });
await mkdir(output, { recursive:true });
const files = await readdir('public/models');
// Blender cannot import the runtime's meshopt extension. Rebuild from the
// pinned, uncompressed source revision, never from compressed delivery files.
const sourceRevision = '91228b4b9e6e5e3155a38ec8035dcd20dc031b4c';
const sourceTree = spawnSync('git', ['ls-tree', '--name-only', sourceRevision, 'public/models/'], {encoding:'utf8'});
if (sourceTree.status !== 0) throw new Error(`Fetch source revision ${sourceRevision} before rebuilding models`);
for (const id of ids.slice(0,12)) {
  const filename = sourceTree.stdout.split('\n').find(f => f.startsWith(`public/models/${id}.`));
  try { await readFile(`${source}/${id}.glb`); }
  catch {
    const original = spawnSync('git', ['show', `${sourceRevision}:${filename}`], {maxBuffer:64*1024*1024});
    if(original.status !== 0) throw new Error(`Cannot retrieve original ${id}`);
    await writeFile(`${source}/${id}.glb`,original.stdout);
  }
}
if (!process.argv.includes('--pack-only')) {
  const result = spawnSync(process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender', ['-b','--factory-startup','--python','scripts/blender-atlas.py','--','--source',source,'--output',output,'--render'], { stdio:'inherit' });
  if(result.status !== 0) throw new Error('Blender authoring failed');
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const manifest = {};
let data = await readFile('app/lib/expanded-organs.ts','utf8');
for (const id of ids) {
  const doc = await io.read(`${output}/${id}.glb`);
  await doc.transform(dedup(), prune(), textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:85}), meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const bytes = await io.writeBinary(doc);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0,8);
  const filename = `${id}.${hash}.glb`;
  await writeFile(`public/models/${filename}`,bytes);
  for(const old of files.filter(f=>f.startsWith(`${id}.`) && f !== filename)) await unlink(`public/models/${old}`);
  data = data.replace(new RegExp(`/models/${id}\\.[a-f0-9]{8}\\.glb`,'g'),`/models/${filename}`);
  const dir=`public/anatomy/${id}`;
  await mkdir(dir,{recursive:true});
  await sharp(`${output}/${id}.png`).resize(640,640).webp({quality:88}).toFile(`${dir}/organ.webp`);
  await sharp(`${output}/${id}.png`).resize(128,128).webp({quality:85}).toFile(`${dir}/thumb.webp`);
  manifest[id]={url:`/models/${filename}`,bytes:bytes.length,...JSON.parse(await readFile(`${output}/${id}.json`,'utf8'))};
  console.log(id,bytes.length);
}
await writeFile('app/lib/expanded-organs.ts',data);
await writeFile('app/lib/refined-models.json',JSON.stringify(manifest,null,2)+'\n');
