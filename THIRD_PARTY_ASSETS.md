# Third-party anatomy assets

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
