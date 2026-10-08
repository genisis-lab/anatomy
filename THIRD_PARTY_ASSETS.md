# Third-party anatomy assets

## Three.js specimens (October 2026)

Twenty-one specimens are built by `scripts/three-anatomy/` and listed in
`app/lib/three-models.json`. The nine core organ models (heart, brain, lungs,
liver, kidneys, eyeball, intestine, pancreas, skin) are unchanged.

### Original teaching geometry

The stomach, ear, spinal cord, bladder, thyroid, female and male reproductive,
gallbladder, airway and diaphragm, spleen, esophagus, tooth, tongue, larynx and
adrenal gland specimens are original procedural geometry authored for Anatomy
Atelier. They are released under CC BY-SA 4.0. The knee's cartilage,
menisci, ligaments and extensor mechanism, the lumbar spine's dural sac, cauda
equina and ligaments, the hand's flexor retinaculum and median nerve, and the
lymphatic vessels and nodes are original geometry under the same terms. Cut-away
windows, layer thicknesses, vessel calibre and microscopic features are enlarged
or simplified for study. They are not scans, histology or clinically validated
patient anatomy.

### BodyParts3D derivatives

The skeleton, muscles, knee bones, hand bones, lumbar vertebrae, discs and
sacrum, and the lymphatic specimen's skeletal frame derive from BodyParts3D:

> BodyParts3D, © The Database Center for Life Science, licensed under Creative Commons Attribution-Share Alike 2.1 Japan.

Source: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>

STL mirror used by the build: <https://github.com/Kevin-Mattheus-Moerman/BodyParts3D>

Modifications: the selected FMA surfaces (`scripts/three-anatomy/kit/bodyparts3d.json`)
were Taubin-smoothed, simplified and, for the knee, hand and lumbar spine, sectioned
with filled cut faces. They were then vertex-painted, combined with the original
geometry above, normalized and meshopt-compressed. These derivative GLBs remain
available under CC BY-SA 2.1 Japan. Application code is licensed separately under
the repository's software license.

Rendered specimen previews (`public/anatomy/<id>/organ.webp`, `thumb.webp`)
inherit their model's license. No histology images are claimed.

### Retired assets

Earlier Blender-refined BodyParts3D derivatives, the Z-Anatomy regional lymphoid
model and the HuBMAP female reference organ set are no longer shipped. These
specimens were rebuilt as described above. The supplementary microscopic,
location and comparison illustrations kept for the stomach, skeleton, muscles
and airway are unchanged.

## References

Anatomical relationships and learning context were cross-checked against OpenStax Anatomy and Physiology:

- [Lymphatic and immune anatomy](https://openstax.org/books/anatomy-and-physiology/pages/21-1-anatomy-of-the-lymphatic-and-immune-systems)
- [Mouth, pharynx, and esophagus](https://openstax.org/books/anatomy-and-physiology-2e/pages/23-3-the-mouth-pharynx-and-esophagus)
- [Selected synovial joints](https://openstax.org/books/anatomy-and-physiology/pages/9-6-anatomy-of-selected-synovial-joints)
- [The endocrine system: adrenal glands](https://openstax.org/books/anatomy-and-physiology-2e/pages/17-6-the-adrenal-glands)
- [Organs and structures of the respiratory system](https://openstax.org/books/anatomy-and-physiology-2e/pages/22-1-organs-and-structures-of-the-respiratory-system)
- [The vertebral column](https://openstax.org/books/anatomy-and-physiology-2e/pages/7-3-the-vertebral-column)
- [Bones of the upper limb](https://openstax.org/books/anatomy-and-physiology-2e/pages/8-2-bones-of-the-upper-limb)
