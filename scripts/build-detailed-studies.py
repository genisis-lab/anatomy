"""Original, reference-guided educational cutaways, not patient-specific scans.
Run with Blender --background --python scripts/build-detailed-studies.py.
Coordinates below use anatomical display axes (X, superior Y, anterior Z).
Microscopic units are enlarged and representative, never literal counts.
"""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix

OUT=Path('work/detailed-studies');OUT.mkdir(parents=True,exist_ok=True)
def xyz(p):return (p[0],-p[2],p[1])
def mat(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.55
    return m
def sphere(name,center,scale,m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=xyz(center));o=bpy.context.object;o.name=name;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(m)
    return o
def tube(name,points,r,m):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=r;c.bevel_resolution=3;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):p.co=xyz(co);p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.data.materials.append(m);return o
def shell(name,center,scale,m,opening=.0):
    o=sphere(name,center,scale,m)
    # Remove anterior hemisphere to expose a true concave inner wall.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=xyz((0,0,center[2]+opening)),plane_no=(0,-1,0),clear_outer=True)
    bm.to_mesh(o.data);bm.free();bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Visible wall thickness','SOLIDIFY');mod.thickness=.045;mod.offset=-1;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def ring(name,center,rx,ry,r,m):return tube(name,[(center[0]+rx*math.cos(a),center[1]+ry*math.sin(a),center[2]) for a in [i*2*math.pi/32 for i in range(33)]],r,m)
def mesh_face(name,points,m):
    me=bpy.data.meshes.new(name);me.from_pydata([xyz(p) for p in points],[],[tuple(range(len(points)))]);me.materials.append(m);o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
def materials():
    return [mat(n,c) for n,c in [('Capsule',(.58,.24,.22)),('Lining',(.86,.55,.47)),('Muscle',(.65,.28,.26)),('Artery',(.65,.06,.045)),('Vein',(.12,.23,.48)),('Nerve',(.88,.74,.38)),('Connective tissue',(.85,.77,.59)),('Lymphoid tissue',(.30,.47,.23))]]
def bladder():
    shell('Detrusor wall',(0,0,0),(.9,1,.6),muscle)
    shell('Urothelium',(0,0,0),(.84,.94,.55),lining)
    for j in range(8):
        y=.65-j*.16;w=.70*math.sqrt(max(.1,1-y*y))
        tube('Mucosal ruga '+str(j),[(-w,y,-.22),(-w*.5,y+.06,-.44),(0,y-.03,-.50),(w*.5,y+.05,-.44),(w,y,-.22)],.025,lining)
    mesh_face('Trigone',[(-.27,-.43,-.37),(.27,-.43,-.37),(0,-.82,-.27)],connective)
    for side in [-1,1]:
        tube('Ureter '+str(side),[(side*.7,1.7,-.65),(side*.65,.75,-.65),(side*.27,-.43,-.46)],.065,lining)
        ring('Ureteric opening '+str(side),(side*.27,-.43,-.33),.07,.05,.017,artery)
    tube('Urethra',[(0,-.8,-.26),(0,-1.2,-.16),(0,-1.6,-.12)],.09,lining)
    return [('Detrusor wall','Detrusor muscle'),('Urothelium','Urothelium'),('Trigone','Trigone'),('Ureter -1','Ureter'),('Urethra','Urethra')]
def thyroid():
    tube('Trachea',[(0,-1.4,-.25),(0,1.3,-.25)],.23,connective)
    for i in range(13):
        y=-1.3+i*.20;tube('Tracheal cartilage '+str(i),[(.25*math.cos(a),y,-.25+.25*math.sin(a)) for a in [j*math.pi/16 for j in range(33)]],.026,lining)
    sphere('Right thyroid lobe',(-.48,0,0),(.34,.9,.32),capsule)
    shell('Left thyroid lobe',(.48,0,0),(.34,.9,.32),capsule)
    tube('Isthmus',[(-.3,-.3,0),(0,-.32,.13),(.3,-.3,0)],.12,capsule)
    for row in range(8):
        y=-.64+row*.18
        for col in range(3):
            x=.30+col*.16;r=.064
            ring('Enlarged follicle', (x,y,.045),r,r,.014,muscle);sphere('Colloid',(x,y,.01),(r*.78,r*.78,.035),lining)
    for side in [-1,1]:
        tube('Thyroid artery '+str(side),[(side*.7,1.3,0),(side*.68,.65,.16),(side*.72,0,.18),(side*.58,-.7,.14)],.033,artery)
        for y in [-.4,0,.4]:tube('Arterial branch',[(side*.7,y,.16),(side*.5,y+.12,.23)],.016,artery)
        for y in [-.5,.5]:sphere('Parathyroid gland',(side*.5,y,-.33),(.09,.13,.06),nerve)
    return [('Right thyroid lobe','Right lobe'),('Left thyroid lobe','Left lobe cutaway'),('Isthmus','Isthmus'),('Enlarged follicle','Follicles (enlarged)'),('Parathyroid gland','Parathyroid gland')]
def gallbladder():
    green=mat('Gallbladder wall',(.31,.40,.10));gold=mat('Biliary mucosa',(.64,.56,.23))
    shell('Gallbladder wall',(0,-.25,0),(.55,1.05,.45),green)
    shell('Mucosal lining',(0,-.25,0),(.49,.98,.39),gold)
    for j in range(11):
        y=-1.05+j*.15;w=.4*math.sqrt(max(.1,1-((y+.25)/1.05)**2))
        tube('Mucosal fold '+str(j),[(-w,y,-.10),(0,y+.045,-.34),(w,y,-.10)],.025,gold)
    tube('Cystic duct',[(0,.72,0),(.1,1.1,0),(.65,1.3,0)],.07,green)
    tube('Common hepatic duct',[(.65,1.85,0),(.65,1.3,0)],.075,gold)
    tube('Common bile duct',[(.65,1.3,0),(.75,.55,0),(.9,-.8,0)],.075,gold)
    tube('Cystic artery',[(1,1.3,-.1),(.25,.65,-.18),(-.25,.25,-.3)],.03,artery)
    return [('Gallbladder wall','Gallbladder wall'),('Mucosal lining','Mucosa'),('Cystic duct','Cystic duct'),('Common hepatic duct','Common hepatic duct'),('Common bile duct','Common bile duct')]
def testis():
    for side in [-1,1]:
        x=side*.65
        (shell if side==1 else sphere)('Testis '+str(side),(x,-.9,0),(.42,.64,.34),capsule)
        tube('Epididymis '+str(side),[(x+.30,-.45,-.1),(x+.36,-.85,-.16),(x+.28,-1.38,-.1)],.10,lining)
        tube('Ductus deferens '+str(side),[(x+.28,-1.38,-.1),(x+.48,-.1,-.25),(side*.8,1.05,-.3),(side*.25,.9,-.3)],.055,connective)
        if side==1:
            for j in range(7):
                y=-1.36+j*.15
                tube('Seminiferous tubules '+str(j),[(x-.23+k*.025,y+.045*math.sin(k*1.6),-.07+.035*math.cos(k*1.6)) for k in range(19)],.020,lining)
                tube('Testicular septum '+str(j),[(x-.3,y-.06,-.08),(x+.21,-.85,-.17)],.009,connective)
        for j in range(6):sphere('Seminal vesicle '+str(side),(side*(.35+.05*math.sin(j)),.55+j*.1,-.38),(.12,.10,.10),lining)
    sphere('Prostate',(0,.28,-.08),(.43,.3,.32),muscle)
    tube('Prostatic urethra',[(0,.7,0),(0,.25,.1),(0,-.3,.15)],.055,connective)
    return [('Testis -1','Testis'),('Seminiferous tubules 3','Seminiferous tubules (enlarged)'),('Epididymis -1','Epididymis'),('Ductus deferens -1','Ductus deferens'),('Prostate','Prostate'),('Seminal vesicle -1','Seminal vesicle')]
def spleen():
    purple=mat('Splenic capsule',(.32,.075,.13));redpulp=mat('Red pulp',(.50,.14,.18))
    shell('Splenic capsule',(0,0,0),(.75,1.35,.45),purple)
    shell('Red pulp',(0,0,0),(.69,1.28,.40),redpulp)
    for j in range(9):
        y=-1+j*.24
        for side in [-1,1]:
            x=side*(.27+.08*math.sin(j));sphere('White pulp follicle',(x,y,-.18),(.08,.10,.05),connective)
            tube('Trabecula',[(side*.61,y,-.07),(x,y+.05,-.20)],.018,purple)
    tube('Splenic artery',[(-1.15,0,.1),(-.75,.15,.1),(-.35,.08,-.02)],.07,artery)
    tube('Splenic vein',[(-1.15,-.25,.08),(-.75,-.16,.08),(-.3,-.25,-.03)],.08,vein)
    return [('Splenic capsule','Capsule'),('Red pulp','Red pulp'),('White pulp follicle','White pulp (enlarged)'),('Splenic artery','Splenic artery'),('Splenic vein','Splenic vein')]
def spinal():
    tube('Spinal cord',[(0,1.8,0),(0,1,0),(0,0,0),(0,-1.2,0)],.12,connective)
    for j in range(15):
        y=1.65-j*.19
        for side in [-1,1]:
            tube('Dorsal root',[(side*.1,y,-.05),(side*.35,y-.08,-.06),(side*.55,y-.14,0)],.025,nerve)
            tube('Ventral root',[(side*.1,y,.065),(side*.3,y-.08,.09),(side*.55,y-.14,0)],.025,nerve)
            sphere('Dorsal root ganglion',(side*.37,y-.10,-.05),(.07,.045,.04),nerve)
    for j in range(13):tube('Cauda equina',[(0,-1.12,0),((j-6)*.025,-1.55,0),((j-6)*.06,-2.0,0)],.012,nerve)
    # Separate enlarged transverse section at right, visibly separated from the cord.
    sphere('White matter section',(1.2,.1,0),(.62,.5,.10),connective)
    for side in [-1,1]:
        tube('Gray matter horn',[(1.2+side*.33,.39,.11),(1.2+side*.15,.12,.11),(1.2+side*.30,-.23,.11)],.09,muscle)
    tube('Gray commissure',[(1.02,.08,.12),(1.38,.08,.12)],.045,muscle)
    ring('Central canal',(1.2,.08,.17),.027,.027,.014,nerve)
    return [('Spinal cord','Spinal cord'),('Dorsal root','Dorsal root'),('Ventral root','Ventral root'),('Dorsal root ganglion','Dorsal root ganglion'),('Cauda equina','Cauda equina'),('White matter section','White matter (enlarged section)'),('Gray matter horn','Gray matter (enlarged section)')]
def ear():
    shell('Auricle',(-1.1,.1,0),(.55,1.0,.23),lining)
    tube('Helix',[(-1.1+.51*math.cos(a),.1+.97*math.sin(a),.02) for a in [i*2*math.pi/40 for i in range(41)]],.065,lining)
    tube('Antihelix',[(-1.15,-.55,.15),(-.95,-.1,.15),(-1.18,.45,.15),(-1.1,.75,.12)],.055,capsule)
    sphere('Tragus',(-.67,-.12,.16),(.10,.16,.08),lining)
    tube('Ear canal',[(-.8,-.13,0),(-.38,-.1,0),(0,0,0)],.12,capsule)
    sphere('Tympanic membrane',(0,0,0),(.06,.24,.20),connective)
    tube('Malleus',[(.03,-.17,.05),(.13,.20,.03),(.20,.27,.03)],.04,connective)
    tube('Incus',[(.2,.27,.03),(.36,.24,.03),(.40,.03,.03)],.045,connective)
    ring('Stapes',(.50,.03,.03),.10,.075,.025,connective)
    sphere('Vestibule',(.69,.06,0),(.13,.14,.13),lining)
    tube('Cochlea',[(.95+( .36*(1-i/100)+.025)*math.cos(i*5*math.pi/100),-.25+(.36*(1-i/100)+.025)*math.sin(i*5*math.pi/100),i*.002) for i in range(101)],.065,lining)
    for axis in range(3):
        pts=[]
        for i in range(33):
            a=i*2*math.pi/32
            pts.append((.77+(.33*math.cos(a) if axis!=2 else .10*math.cos(a)),.47+.4*math.sin(a),(.28*math.cos(a) if axis==2 else .23*math.sin(a) if axis==1 else -.10)))
        tube('Semicircular canal '+str(axis),pts,.045,lining)
    tube('Auditory tube',[(.2,-.1,-.1),(.5,-.6,-.15),(.85,-1,-.2)],.07,capsule)
    tube('Vestibulocochlear nerve',[(1,.08,-.1),(1.35,.18,-.25),(1.55,.25,-.3)],.065,nerve)
    return [('Auricle','Auricle'),('Ear canal','External auditory canal'),('Tympanic membrane','Tympanic membrane'),('Malleus','Malleus'),('Incus','Incus'),('Stapes','Stapes'),('Cochlea','Cochlea'),('Semicircular canal 0','Semicircular canals')]
def lymphatic():
    # Registered regional node anatomy from the free atlas; no NC ear/kidney data.
    bpy.ops.import_scene.gltf(filepath='work/detailed-atlas/lymphatic.glb')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            obj.data.materials.clear();obj.data.materials.append(capsule if obj.name.startswith('Spleen') else lymph)
    shell('Enlarged lymph node capsule',(1.15,-.15,.05),(.48,.65,.25),lymph)
    shell('Node cortex',(1.15,-.15,.05),(.43,.59,.20),lining)
    for j in range(7):
        a=j*2*math.pi/7
        sphere('Lymphoid follicle',(1.15+.31*math.cos(a),-.15+.44*math.sin(a),.035),(.07,.07,.035),lymph)
    for j in range(4):
        y=-.43+j*.18
        tube('Medullary cord',[(.97,y,0),(1.12,y+.05,-.04),(1.30,y,.015)],.025,capsule)
    for j in range(3):
        y=-.48+j*.33
        tube('Afferent lymphatic',[(.54,y,.02),(.75,y+.03,.02)],.021,lymph)
    tube('Efferent lymphatic',[(1.47,-.15,.03),(1.86,-.15,.03)],.028,lymph)
    return [('Spleen','Spleen'),('Inferior deep lateral cervical nodes-l','Cervical nodes'),('Anterior axillary nodes-l','Axillary nodes'),('Superolateral superficial inguinal nodes-l','Inguinal nodes'),('Left lobe of thymus','Thymus'),('Enlarged lymph node capsule','Node capsule (enlarged)'),('Lymphoid follicle','Node follicle (enlarged)'),('Medullary cord','Medullary cords (enlarged)')]
def female():
    bpy.ops.import_scene.gltf(filepath='work/hra-studies/female-reproductive-normalized.glb')
    return [('VH_F_body_of_uterus','Uterine body'),('VH_F_cervix','Cervix'),('VH_F_left_ovary','Left ovary'),('VH_F_fibria_of_uterine_tube_L','Fimbriae'),('VH_F_ampulla_of_uterine_tube_R','Ampulla'),('VH_F_left_uterine_artery','Uterine artery')]

builders={'ear':ear,'spinal-cord':spinal,'bladder':bladder,'thyroid':thyroid,'spleen':spleen,'lymphatic':lymphatic,'female-reproductive':female,'male-reproductive':testis,'gallbladder':gallbladder}
requested=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(builders)
for organ in requested:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    capsule,lining,muscle,artery,vein,nerve,connective,lymph=materials()
    anchors=builders[organ]()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];bpy.context.view_layer.update()
    # Bake imports and normalize exactly as the viewer does.
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)/2;scale=3.8/max(high-low)
    for obj,world in [(o,o.matrix_world.copy()) for o in meshes]:
        obj.data=obj.data.copy();obj.data.transform(Matrix.Scale(scale,4)@Matrix.Translation(-center)@world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
        for p in obj.data.polygons:p.use_smooth=True
    bpy.context.view_layer.update()
    report=[]
    for name,label in anchors:
        obj=next((o for o in meshes if o.name==name or o.name.startswith(name+'.')),None)
        if obj is None:raise RuntimeError('Missing label mesh: '+name)
        p=sum((Vector(c) for c in obj.bound_box),Vector())/8
        report.append({'id':name.lower().replace(' ','-'),'label':label,'meshName':obj.name,'detail':label+' in this educational study','position':[p.x,p.z,-p.y],'color':'#c78176'})
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{organ}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False)
    (OUT/f'{organ}.json').write_text(json.dumps({'hotspots':report,'meshes':len(meshes),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)}))
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{organ}.blend'))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.5
    bpy.ops.object.camera_add(location=(.5,-8,.7));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.5;scene.camera=cam
    for co,power in [((-3,-4,5),600),((4,-1,2),350),((0,3,4),650)]:
        bpy.ops.object.light_add(type='AREA',location=co);light=bpy.context.object;light.data.energy=power;light.data.size=4;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/f'{organ}.png');bpy.ops.render.render(write_still=True)
    print('DETAILED',organ,flush=True)
