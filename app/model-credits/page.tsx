import Link from "next/link";

export default function ModelCredits() {
  return <main style={{maxWidth:760,margin:"3rem auto",padding:"1.5rem",lineHeight:1.7}}>
    <Link href="/">← Return to Anatomy Atelier</Link>
    <h1>Model sources and scope</h1>
    <p>These models support anatomy learning, not diagnosis, procedures, or patient-specific planning. Cutaways, colors, microscopic structures, and some spatial separations are schematic and exaggerated for visibility. Model-specific limitations appear under “About this 3D study.”</p>
    <h2>Original Three.js teaching models</h2>
    <p>The stomach, ear, spinal cord, bladder, thyroid, uterus and ovaries, testes and prostate, gallbladder, airway and diaphragm, spleen, esophagus, tooth, tongue, larynx, and adrenal gland studies were modelled in Three.js for Anatomy Atelier. So were the soft tissues added to the knee, hand, lumbar spine, and lymphatic studies. They are released under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Anatomical relationships were guided by <a href="https://openstax.org/details/books/anatomy-and-physiology-2e">OpenStax Anatomy and Physiology</a>. These are simplified teaching models, not scans or histology micrographs.</p>
    <h2>Registered scan anatomy</h2>
    <p>The skeleton, muscles, and the bones of the knee, hand, lumbar spine, and lymphatic study derive from “BodyParts3D, © The Database Center for Life Science,” licensed under <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 Japan</a>. Source: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/">BodyParts3D</a>. We smoothed, simplified, sectioned, and painted the selected surfaces and compressed them for the web. These derivatives remain CC BY-SA 2.1 Japan.</p>
    <h2>Other existing models</h2>
    <p>The heart, brain, lungs, liver, kidneys, eyeball, intestine, pancreas, and skin models are unchanged. The complete asset record and rebuild scripts are in <a href="https://github.com/genisis-lab/anatomy/blob/main/THIRD_PARTY_ASSETS.md">the source repository</a>.</p>
  </main>;
}
