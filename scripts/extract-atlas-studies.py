"""Extract registered anatomy from Z-Anatomy; run Blender with --disable-autoexec.

Source: Z-Anatomy/Models-of-human-anatomy, Startup.blend (2023-05-02).
CC BY-SA 4.0, derived from BodyParts3D. Inner-ear and kidney assets are
deliberately excluded because upstream identifies additional NC licenses.
Outputs are review candidates, not automatically published replacements.
"""
import bpy
import bmesh
import json
from pathlib import Path
from mathutils import Vector

OUTPUT = Path("work/detailed-atlas")
OUTPUT.mkdir(parents=True, exist_ok=True)
studies = {
    "ear-outer": ["Helix.r", "Antihelix.r", "Antitragus.r", "Tragus.r", "Concha of auricle.r", "Crura of antihelix.r", "Lobule of auricle.r", "Anterior notch of auricle.r", "Apex of auricle.r"],
    "thyroid": ["Thyroid gland", "Trachea", "Thyroid cartilage", "Inferior thyroid artery.l", "Inferior thyroid artery.r", "Superior thyroid vein.l", "Superior thyroid vein.r", "Inferior parathyroid gland.l", "Inferior parathyroid gland.r", "Superior parathyroid gland.l", "Superior parathyroid gland.r"],
    "bladder": ["Urinary bladder", "Ureter.l", "Ureter.r", "Urethra"],
    "spleen": ["Spleen", "Splenic artery", "Splenic vein", "Splenic nodes"],
    "gallbladder": ["Gallbladder", "Bile duct", "Cystic node"],
    "male-reproductive": ["Testis.l", "Testis.r", "Epididymis.l", "Epididymis.r", "Ductus deferens.l", "Ductus deferens.r", "Seminal gland.l", "Seminal gland.r", "Prostate", "Urethra", "Urinary bladder"],
    "spinal-cord": ["White matter of spinal cord", "Anterior horn of spinal cord", "Posterior horn of spinal cord", "Anterior root of spinal nerve.l", "Anterior root of spinal nerve.r", "Posterior root of spinal nerve.l", "Posterior root of spinal nerve.r", "Cauda equina"],
}
studies["lymphatic"] = [o.name for o in bpy.data.objects if any(c.name == "6: Lymphoid organs" for c in o.users_collection) and o.type == "MESH" and len(o.data.polygons) > 0 and not o.name.endswith(".g")]

# Evaluate in the source scene first, retaining all modifier dependencies.
# Never execute the downloaded project's embedded scripts or text blocks.
source_scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
cache = {}
import sys
if '--' in sys.argv:
    studies={key:studies[key] for key in sys.argv[sys.argv.index('--')+1:]}
for name in set(sum(studies.values(), [])):
    original = bpy.data.objects.get(name)
    if original is None:
        raise RuntimeError(f"Missing anatomy: {name}")
    evaluated = original.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    if not mesh.polygons:
        raise RuntimeError(f"Empty evaluated anatomy: {name}")
    mesh.transform(original.matrix_world)
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    # Source materials include viewport hiding/driver setups. Use their
    # anatomical base colors, without those application-specific shaders.
    for i, original_mat in enumerate(mesh.materials):
        color=tuple(original_mat.diffuse_color)
        if original_mat.use_nodes:
            principled=next((n for n in original_mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            if principled:color=tuple(principled.inputs['Base Color'].default_value)
        mat=bpy.data.materials.new('Study '+original_mat.name)
        mat.use_nodes=True;mat.diffuse_color=(*color[:3],1)
        shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(*color[:3],1)
        shader.inputs['Roughness'].default_value=.55
        mesh.materials[i]=mat
    cache[name] = mesh

for organ, names in studies.items():
    scene = bpy.data.scenes.new("Study " + organ)
    bpy.context.window.scene = scene
    objects = []
    for name in names:
        obj = bpy.data.objects.new(name.replace(".", "-"), cache[name].copy())
        scene.collection.objects.link(obj)
        obj["anatomySource"] = "Z-Anatomy; BodyParts3D"
        obj["sourceStructure"] = name
        obj["license"] = "CC-BY-SA-4.0"
        for face in obj.data.polygons:
            face.use_smooth = True
        objects.append(obj)
    bpy.context.view_layer.update()
    points = [Vector(c) for o in objects for c in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center = (low + high) / 2
    scale = 3.8 / max(high - low)
    for obj in objects:
        for vertex in obj.data.vertices:
            vertex.co = (vertex.co - center) * scale
        obj.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f"{organ}.glb"), export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_animations=False)
    report = {"id": organ, "structures": names, "triangles": sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)}
    (OUTPUT / f"{organ}.json").write_text(json.dumps(report, indent=2))
    print("STUDY", json.dumps(report), flush=True)

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Study world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs[1].default_value = .6
    bpy.ops.object.camera_add(location=(1.5, -8.5, .5))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.6
    scene.camera = camera
    for position, power in [((-3,-4,5),600), ((4,-1,2),400), ((0,3,4),700)]:
        bpy.ops.object.light_add(type="AREA", location=position)
        light=bpy.context.object
        light.data.energy=power
        light.data.shape="DISK"
        light.data.size=4
        light.rotation_euler=(-light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUTPUT / f"{organ}.png")
    bpy.ops.render.render(write_still=True)
