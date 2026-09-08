"""Normalize and render HRA review candidates; preserve each named structure."""
import bpy
from pathlib import Path
from mathutils import Vector, Matrix

for path in Path('work/hra-studies').glob('*.glb'):
    if path.stem.endswith('-normalized'): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.context.view_layer.update()
    points=[o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(low+high)/2
    scale=3.8/max(high-low)
    worlds=[(o,o.matrix_world.copy()) for o in meshes]
    for obj,world in worlds:
        obj.data=obj.data.copy()
        obj.data.transform(Matrix.Scale(scale,4) @ Matrix.Translation(-center) @ world)
        obj.parent=None
        obj.matrix_world=Matrix.Identity(4)
        for p in obj.data.polygons:p.use_smooth=True
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH':bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path.with_name(path.stem+'-normalized.glb')),export_format='GLB',use_selection=True,export_extras=True,export_animations=False)
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
    bpy.ops.object.camera_add(location=(.5,-8,1))
    camera=bpy.context.object;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=4.5;scene.camera=camera
    for co,power in [((-3,-4,5),650),((4,-1,2),400),((0,3,4),700)]:
        bpy.ops.object.light_add(type='AREA',location=co)
        light=bpy.context.object;light.data.energy=power;light.data.size=4
        light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(path.with_suffix('.png'))
    bpy.ops.render.render(write_still=True)
