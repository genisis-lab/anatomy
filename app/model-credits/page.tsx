import Link from "next/link";

export default function ModelCredits() {
  return <main style={{maxWidth:760,margin:"3rem auto",padding:"1.5rem",lineHeight:1.7}}>
    <Link href="/">← Return to Anatomy Atelier</Link>
    <h1>Model sources and scope</h1>
    <p>These models support anatomy learning, not diagnosis, procedures, or patient-specific planning. Cutaways, colors, microscopic structures, and some spatial separations are schematic and exaggerated for visibility. Model-specific limitations appear under “About this 3D study.”</p>
    <h2>Original educational cutaways</h2>
    <p>The ear, spinal cord, bladder, thyroid, isolated spleen, testes/prostate, and gallbladder studies were authored in Blender for Anatomy Atelier. They are released under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Anatomical relationships were guided by <a href="https://openstax.org/details/books/anatomy-and-physiology-2e">OpenStax Anatomy and Physiology</a>. These are simplified teaching models, not scans or histology micrographs.</p>
    <h2>Regional lymphoid anatomy</h2>
    <p>“Z-Anatomy — The libre 3D atlas of anatomy — CC-BY-SA 4.0,” by Gauthier Kervyn and contributors, derived from “BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan.” We extracted named lymphoid organs, baked transforms and materials, and compressed them for the web. Source: <a href="https://github.com/Z-Anatomy/Models-of-human-anatomy">Z-Anatomy</a>. The derivative remains CC BY-SA 4.0. No restricted inner-ear or kidney assets from that collection are used in these replacements.</p>
    <h2>Female reproductive anatomy</h2>
    <p>Kristen Browne and Heidi Schlehlein, 3D Reference Organ Set for Female, v1.5, HuBMAP/Human Reference Atlas, based on the National Library of Medicine Visible Human Female. <a href="https://doi.org/10.48539/HBM352.BTSQ.586">Dataset and citation</a>; <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Selected structures were extracted, normalized, rendered, and compressed. Registration was retained; no microscopic uterine layers were added.</p>
    <h2>Other existing models</h2>
    <p>Other BodyParts3D-derived specimens retain their existing CC BY-SA 2.1 Japan attribution. The complete asset record and rebuild scripts are in <a href="https://github.com/genisis-lab/anatomy/blob/main/THIRD_PARTY_ASSETS.md">the source repository</a>.</p>
  </main>;
}
