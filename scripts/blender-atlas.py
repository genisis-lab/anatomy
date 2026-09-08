"""Blender authoring stage. Run through `npm run models:refine`.

Source coordinates and mesh names are preserved for the existing specimens.
New studies reuse attributed scan geometry and explicitly schematic additions.
The GLBs are subsequently compressed by refine-atlas.mjs, not by Blender.
"""
import argparse
import json
import math
import sys
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--ids", nargs="*")
parser.add_argument("--render", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
source = Path(args.source)
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
expanded = ["stomach", "skeleton", "muscles", "ear", "spinal-cord", "bladder", "thyroid", "lymphatic", "female-reproductive", "male-reproductive", "gallbladder", "airway-diaphragm"]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def load(organ):
    raw = (source / f"{organ}.glb").read_bytes()
    document = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
    tints = {}
    for node in document.get("nodes", []):
        if "mesh" not in node: continue
        primitive = document["meshes"][node["mesh"]]["primitives"][0]
        mat = document.get("materials", [])[primitive["material"]]
        tints[node.get("name", "")] = mat.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1,1,1,1])[:3]
    bpy.ops.import_scene.gltf(filepath=str(source / f"{organ}.glb"))
    # Bake world transforms before removing parents: no coordinate drift.
    transforms = [(o, o.matrix_world.copy()) for o in meshes()]
    for obj, world in transforms:
        obj["atlasBaseColor"] = tints.get(obj.name, [1,1,1])
        obj.data = obj.data.copy()
        obj.data.transform(world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)


def bounds(objects=None):
    points = [o.matrix_world @ Vector(c) for o in (objects or meshes()) for c in o.bound_box]
    return Vector(tuple(min(p[i] for p in points) for i in range(3))), Vector(tuple(max(p[i] for p in points) for i in range(3)))


def normalize():
    bpy.context.view_layer.update()
    low, high = bounds()
    center = (low + high) / 2
    scale = 3.8 / max(high - low)
    for obj in meshes():
        obj.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-center))
    bpy.context.view_layer.update()


def material(name, color, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = roughness
    p.inputs["Metallic"].default_value = 0
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    # Scan-derived vertex tint must not multiply the new material twice.
    for attr in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attr)


def smooth_and_refine():
    for obj in meshes():
        bpy.context.view_layer.objects.active = obj
        if organ == "muscles" and "BodyParts3D" in str(obj.get("source", "")):
            # Repair open scan seams before smoothing. Preserve every named
            # structure; a neutral matte material avoids invalid remeshed UVs.
            repair = obj.modifiers.new("Repair muscle scan seams", "REMESH")
            repair.mode = "VOXEL"
            repair.voxel_size = .006
            repair.use_smooth_shade = True
            bpy.ops.object.modifier_apply(modifier=repair.name)
            soften = obj.modifiers.new("Smooth scan repair", "SMOOTH")
            soften.factor = .5
            soften.iterations = 3
            bpy.ops.object.modifier_apply(modifier=soften.name)
            tint = tuple(obj["atlasBaseColor"])
            assign(obj, material("Matte repaired scan surface", tint))
        # Imported scans often contain split normals/vertices. Weld only an
        # imperceptible distance; preserve separate bones and named structures.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.000001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        for face in obj.data.polygons:
            face.use_smooth = True
        # Limit only dense individual surfaces, leaving delicate small parts.
        target = 1800 if organ == "muscles" else 12000
        if len(obj.data.polygons) > target:
            modifier = obj.modifiers.new("Silhouette-preserving web mesh", "DECIMATE")
            modifier.ratio = target / len(obj.data.polygons) if organ == "muscles" else max(0.35, target / len(obj.data.polygons))
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj["atlasPipeline"] = "Blender surface refinement; named anatomy retained"
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "NORMAL_MAP":
                node.inputs["Strength"].default_value = 0.22
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Coat Weight"].default_value = 0
                node.inputs["Sheen Weight"].default_value = 0
                node.inputs["Roughness"].default_value = 0.55


def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 10
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = "AUTO"
        p.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj.data.materials.append(mat)
    obj["anatomyNote"] = "Schematic educational structure; not patient-specific"
    return obj


def ellipsoid(name, center, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    assign(obj, mat)
    return obj


def keep_named(names):
    for obj in meshes():
        if obj.name not in names:
            bpy.data.objects.remove(obj, do_unlink=True)


def spleen():
    load("lymphatic")
    keep_named(["Spleen"])
    if len(meshes()) != 1:
        raise RuntimeError("Expected the attributed spleen scan")
    normalize()
    obj = meshes()[0]
    assign(obj, material("Splenic capsule", (0.34, 0.075, 0.12)))
    # Vessels on the concave visceral surface; their scale is exaggerated
    # for teaching. The underlying organ surface is the BodyParts3D scan.
    low, high = bounds()
    y = low.y - 0.03
    artery = material("Splenic artery", (0.68, 0.13, 0.10))
    vein = material("Splenic vein", (0.15, 0.28, 0.49))
    tube("Splenic artery", [(0.2, y, -0.15), (-0.22, y-0.05, -0.05), (-0.50, y, 0.13), (-0.95, y, 0.15)], 0.06, artery)
    tube("Splenic vein", [(0.2, y, -0.34), (-0.28, y-0.07, -0.28), (-0.65, y, -0.34), (-0.97, y, -0.25)], 0.075, vein)
    for index, z in enumerate([-0.85, -0.45, 0.45, 0.8]):
        tube(f"Hilar arterial branch {index+1}", [(-0.3, y, 0), (-0.05, y+0.03, z*0.5), (0.17, y+0.14, z)], 0.025, artery)


def esophagus():
    # A longitudinally opened teaching model makes the wall layers visible.
    # It is purpose-authored, not a patient scan or a histology micrograph.
    outer = material("Longitudinal muscle", (0.57, 0.20, 0.17))
    circular = material("Circular muscle", (0.76, 0.37, 0.32))
    submucosa = material("Submucosa", (0.83, 0.65, 0.46))
    mucosa = material("Squamous mucosa", (0.82, 0.48, 0.44))
    for name, radius, thickness, mat in [("Longitudinal muscular layer", .40, .08, outer), ("Circular muscular layer", .32, .055, circular), ("Submucosa", .265, .05, submucosa), ("Mucosa", .215, .035, mucosa)]:
        vertices, faces = [], []
        segments, rings = 60, 40
        # Opening faces the camera (-Y). Keep a 100-degree window.
        for radial in [radius, radius-thickness]:
            for j in range(rings+1):
                z = -1.8 + 3.6*j/rings
                cx = 0.09*math.sin(z*1.5)
                for i in range(segments+1):
                    a = math.radians(-40 + 260*i/segments)
                    vertices.append((cx+radial*math.cos(a), radial*math.sin(a), z))
        n = (rings+1)*(segments+1)
        for k in range(2):
            for j in range(rings):
                for i in range(segments):
                    a = k*n+j*(segments+1)+i
                    face = (a,a+1,a+segments+2,a+segments+1)
                    faces.append(face if k == 0 else face[::-1])
        for j in range(rings):
            for i in [0,segments]:
                a=j*(segments+1)+i
                faces.append((a,a+segments+1,a+segments+1+n,a+n))
        for j in [0,rings]:
            for i in range(segments):
                a=j*(segments+1)+i
                faces.append((a,a+n,a+n+1,a+1))
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(vertices,[],faces)
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        assign(obj,mat)
        obj["anatomyNote"]="Longitudinal cutaway; wall thickness exaggerated to distinguish layers"
    # Inner longitudinal folds make the normally collapsed lumen legible.
    for i in range(7):
        angle=math.radians(0+180*i/6)
        tube(f"Mucosal fold {i+1}", [(0.09*math.sin(z*1.5)+.176*math.cos(angle), .176*math.sin(angle), z) for z in [-1.8,-1.2,-.6,0,.6,1.2,1.8]], .014, mucosa)


def knee():
    load("skeleton")
    keep_named(["Right femur", "Right tibia", "Right fibula", "Right patella"])
    if len(meshes()) != 4:
        raise RuntimeError("Expected four registered right-knee bones")
    bone=material("Cortical bone", (.76,.67,.50))
    # Registered bones remain in their original relation; crop shafts above
    # and below the joint. Fill only the artificial teaching-section ends.
    for obj in meshes():
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        for z, normal in [(-.82,(0,0,1)),(-1.58,(0,0,-1))]:
            result=bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=.00001, plane_co=(0,0,z), plane_no=normal, clear_outer=True)
            edges=[e for e in result["geom_cut"] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
            if edges: bmesh.ops.holes_fill(bm,edges=edges,sides=0)
        boundary=[e for e in bm.edges if e.is_boundary]
        if boundary: bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data); bm.free()
        assign(obj,bone)
    normalize()
    # Deliberately keep this an osseous study: do not invent the locations of
    # menisci or cruciate ligaments without their registered scan geometry.
    for obj in meshes():
        bpy.context.view_layer.objects.active = obj
        repair = obj.modifiers.new("Seal scan seams", "REMESH")
        repair.mode = "VOXEL"
        repair.voxel_size = .012
        repair.use_smooth_shade = True
        bpy.ops.object.modifier_apply(modifier=repair.name)
        soften = obj.modifiers.new("Smooth repaired surface", "SMOOTH")
        soften.factor = .5
        soften.iterations = 3
        bpy.ops.object.modifier_apply(modifier=soften.name)
        obj["anatomyNote"]="Right knee, bone study; shafts sectioned; soft tissues omitted"


def render(organ):
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.resolution_x=640; scene.render.resolution_y=640
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new("Studio")
    scene.world.use_nodes=True
    scene.world.node_tree.nodes.get("Background").inputs[0].default_value=(.72,.76,.85,1)
    scene.world.node_tree.nodes.get("Background").inputs[1].default_value=.45
    scene.view_settings.view_transform="AgX"
    low,high=bounds(); center=(low+high)/2
    span=max(high-low)
    bpy.ops.object.camera_add(location=center+Vector((span*.35,-span*2.2,span*.18)))
    camera=bpy.context.object
    camera.rotation_euler=(center-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"; camera.data.ortho_scale=span*1.18
    scene.camera=camera
    for position, energy, size in [((-3,-4,5),650,4),((4,-1,2),380,3),((0,3,4),800,3)]:
        bpy.ops.object.light_add(type="AREA", location=center+Vector(position)*span/3.8)
        light=bpy.context.object; light.data.energy=energy; light.data.shape="DISK"; light.data.size=size*span/3.8
        light.rotation_euler=(center-light.location).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=str(output/f"{organ}.png")
    bpy.ops.render.render(write_still=True)


for organ in args.ids or expanded+["spleen","esophagus","knee"]:
    reset()
    if organ in expanded: load(organ)
    else: {"spleen":spleen,"esophagus":esophagus,"knee":knee}[organ]()
    smooth_and_refine()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes(): obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output/f"{organ}.glb"), export_format="GLB", use_selection=True, export_extras=True, export_yup=True, export_apply=True, export_animations=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(output/f"{organ}.blend"))
    report={"id":organ,"meshes":len(meshes()),"triangles":sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes())}
    (output/f"{organ}.json").write_text(json.dumps(report))
    if args.render: render(organ)
    print("ATLAS_MODEL",json.dumps(report),flush=True)
