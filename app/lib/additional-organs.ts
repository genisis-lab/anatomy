import type { Organ } from './anatomy-data';
import models from './refined-models.json';

/** Teaching specimens: scan-derived spleen/knee and an authored wall cutaway.
 * Vessel size and cutaway thickness are exaggerated for visibility. */
export const additionalOrgans: Organ[] = [
  {
    id:'spleen', name:'Spleen', scientificName:'Splen', system:'Lymphatic System',
    model:models.spleen.url, icon:'◒', accent:'#a45d73', illustrated:true, specimenOnly:true,
    description:'A blood-filtering lymphatic organ that removes worn red blood cells and supports immune responses. This study combines a scan-derived surface with schematic hilar vessels.',
    poetic:'The blood’s quiet guardian', size:'Approximately fist-sized', weight:'Varies with age and body size',
    location:'Upper left abdomen, beside the stomach and beneath the diaphragm',
    function:'Filters blood and supports immune surveillance', dailyFact:'Continuously screens circulating blood',
    medical:'Red pulp filters blood; white pulp supports lymphocyte responses. These internal regions are not exposed in this surface model.',
    bloodSupply:'Splenic artery; venous drainage through the splenic vein',
    funFact:'Unlike lymph nodes, the spleen monitors blood rather than lymph.',
    tissue:'Red pulp and white pulp', comparison:'Spleen vs. lymphatic system',
    conditions:['Splenomegaly','Splenic injury','Splenic infarction','Hypersplenism'],
    hotspots:[
      {id:'capsule',meshName:'Spleen',label:'Capsule',detail:'Connective tissue covering of the spleen',position:[.45,.65,.5],color:'#a45d73'},
      {id:'hilum',meshName:'Spleen',label:'Hilum',detail:'Region where vessels enter and leave; vessel sizes are schematic',position:[-.1,0,.7],color:'#e5a45b'},
      {id:'splenic-artery',meshName:'Splenic artery',label:'Splenic Artery',detail:'Brings arterial blood to the spleen',position:[-.5,.1,.8],color:'#d3594a'},
      {id:'splenic-vein',meshName:'Splenic vein',label:'Splenic Vein',detail:'Carries blood toward the hepatic portal circulation',position:[-.5,-.3,.8],color:'#6384bc'},
    ],
  },
  {
    id:'esophagus',name:'Esophagus',scientificName:'Oesophagus',system:'Digestive System',
    model:models.esophagus.url,icon:'∿',accent:'#c78176',illustrated:true,specimenOnly:true,
    description:'A muscular passage that moves swallowed food from the pharynx to the stomach. This longitudinal cutaway separates the wall layers, with thickness exaggerated for study.',
    poetic:'The passage to digestion',size:'About 25 cm long in an adult',weight:'Depends on body size and specimen preparation',
    location:'Behind the trachea, through the chest and diaphragm to the stomach',function:'Propels swallowed food by peristalsis',
    dailyFact:'Coordinates muscular waves with each swallow',medical:'The lining protects against abrasion. Muscle transitions from skeletal above to smooth below; sphincters are not represented in this wall segment.',
    bloodSupply:'Regional branches of the inferior thyroid artery, thoracic aorta, and left gastric artery',
    funFact:'Peristaltic waves can move food even when gravity does not assist.',tissue:'Stratified squamous epithelium and muscular wall',comparison:'Esophagus vs. stomach',
    conditions:['Reflux esophagitis','Achalasia','Esophageal stricture','Barrett esophagus'],
    hotspots:[
      {id:'longitudinal-muscle',meshName:'Longitudinal muscular layer',label:'Longitudinal Muscle',detail:'Outer muscular layer shortens the passage',position:[.38,.9,.32],color:'#b66154'},
      {id:'circular-muscle',meshName:'Circular muscular layer',label:'Circular Muscle',detail:'Inner muscular layer narrows the passage',position:[.28,.3,.28],color:'#d8907c'},
      {id:'submucosa',meshName:'Submucosa',label:'Submucosa',detail:'Connective tissue supporting the mucosa',position:[.17,-.35,.25],color:'#d8b079'},
      {id:'mucosa',meshName:'Mucosa',label:'Mucosa',detail:'Inner lining with protective squamous epithelium',position:[-.09,-.9,-.1],color:'#e7a399'},
    ],
  },
  {
    id:'knee',name:'Knee',scientificName:'Articulatio genus',system:'Skeletal System',
    model:models.knee.url,icon:'⌘',accent:'#c7ad86',illustrated:true,specimenOnly:true,
    description:'An articulated bone study of the right knee, retaining the registered positions of the femur, tibia, fibula, and patella. Shafts are sectioned and soft tissues are omitted to expose the bony relationships.',
    poetic:'The hinge of each stride',size:'Connects the thigh to the lower leg',weight:'Varies with body size',location:'Between the thigh and lower leg',
    function:'Enables flexion and extension while transferring body weight',dailyFact:'Alternates support and motion during walking',
    medical:'Cartilage, menisci, and ligaments guide and cushion the living joint. They are not shown in this bone-only study.',
    bloodSupply:'Genicular branches around the knee',funFact:'The patella is a sesamoid bone embedded in the quadriceps tendon.',
    tissue:'Bone, articular cartilage, and fibrocartilage',comparison:'Knee vs. skeleton',conditions:['Osteoarthritis','Patellar dislocation','Meniscal injury','Ligament injury'],
    hotspots:[
      {id:'femur',meshName:'Right femur',label:'Distal Femur',detail:'Thigh bone ending in the femoral condyles',position:[0,.8,.15],color:'#c7ad86'},
      {id:'tibia',meshName:'Right tibia',label:'Proximal Tibia',detail:'Main weight-bearing bone of the lower leg',position:[0,-.6,.15],color:'#6393d8'},
      {id:'fibula',meshName:'Right fibula',label:'Fibular Head',detail:'Lateral attachment region; not part of the main tibiofemoral articulation',position:[-.55,-.25,-.1],color:'#d69db8'},
      {id:'patella',meshName:'Right patella',label:'Patella',detail:'Kneecap in front of the distal femur',position:[0,.1,.5],color:'#e49c57'},
    ],
  },
];
