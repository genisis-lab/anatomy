# Third-party anatomy assets

## Current detailed studies (September 2026)

The detailed-study manifest (`app/lib/detailed-studies.json`) overrides the
ear, spinal cord, bladder, thyroid, isolated spleen, lymphatic, female and male
reproductive, and gallbladder models. The ear, spinal cord, bladder, thyroid,
spleen, male reproductive and gallbladder replacements are original
reference-guided Blender teaching geometry, released under CC BY-SA 4.0.
The microscopic and cross-section features are enlarged schematic examples,
not exact counts, scans, or clinically validated patient anatomy.

The regional lymphoid model derives from **Z-Anatomy — The libre 3D atlas of
anatomy — CC-BY-SA 4.0**, Gauthier Kervyn and contributors, based on
**BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan**.
Source: https://github.com/Z-Anatomy/Models-of-human-anatomy (Startup.blend,
2023-05-02). Modifications: select regional lymphoid structures; bake
transforms; rebuild matte materials; normalize; add an original enlarged node
cutaway; compress. This derivative and its renders remain CC BY-SA 4.0.
The NC-restricted inner-ear and kidney meshes are not included.

Female reproductive geometry is by **Kristen Browne and Heidi Schlehlein**,
*3D Reference Organ Set for Female, v1.5*, HuBMAP/Human Reference Atlas, based
on the National Library of Medicine Visible Human Female. CC BY 4.0.
https://doi.org/10.48539/HBM352.BTSQ.586
https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/metadata.json
Modifications: select uterus/ovaries/tubes/supporting ligaments/uterine vessels,
preserve registration, normalize, render, and compress. Histological layers
are not exposed. Previews inherit their source model licenses.

Earlier provenance below applies to models not replaced by this manifest.

The expanded interactive specimens include geometry derived from BodyParts3D:

> BodyParts3D, © The Database Center for Life Science, licensed under Creative Commons Attribution-Share Alike 2.1 Japan.

Source: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>

Mirror and conversion tooling: <https://github.com/Kevin-Mattheus-Moerman/BodyParts3D>

The derived GLB files remain available under the same CC BY-SA license. Application code is licensed separately under the repository's software license.

## Blender refinements and new studies

The twelve expanded specimens are surface-refined derivatives with reduced
normal-map intensity, smooth shading, selective decimation, and meshopt/WebP
delivery compression. Full-body muscle scan seams are voxel-repaired per named structure and
decimated, retaining the source material colors with matte, UV-independent
surfaces. The isolated spleen derives from the existing lymphatic
model; its added vessels are schematic. The right knee derives from the registered
right femur, tibia, fibula, and patella in the skeleton, with sectioned shafts and
repaired scan seams. These derivatives retain CC BY-SA 2.1 Japan.

The esophagus wall cutaway is original procedural educational geometry authored
in `scripts/blender-atlas.py`; wall thickness is exaggerated and sphincters are
omitted. It is released under CC BY-SA 2.1 Japan as well. Rendered specimen
previews inherit their model's license. No new histology images are claimed.

Learning context was cross-checked against OpenStax Anatomy and Physiology:

- [Lymphatic and immune anatomy](https://openstax.org/books/anatomy-and-physiology/pages/21-1-anatomy-of-the-lymphatic-and-immune-systems)
- [Mouth, pharynx, and esophagus](https://openstax.org/books/anatomy-and-physiology-2e/pages/23-3-the-mouth-pharynx-and-esophagus)
- [Selected synovial joints](https://openstax.org/books/anatomy-and-physiology/pages/9-6-anatomy-of-selected-synovial-joints)
