# Anatomy Atelier

An interactive, public anatomy learning experience for [BuiltWAI](https://builtwai.com). The site combines 24 educational 3D specimens and system modules with resumable lessons, focused review, labelling quizzes, guided system pathways, synchronized 3D comparisons, structure-linked notes, and anonymous learning progress.

Production: [anatomy.builtwai.com](https://anatomy.builtwai.com)

## Stack

- Next.js-compatible app routing through Vinext and Vite
- React 19 and Three.js for the interactive specimens
- Cloudflare Workers and D1 through OpenAI Sites
- Drizzle schema and migrations

## Local development

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Useful commands:

- `npm run typecheck` — validate TypeScript
- `npm run test:source` — validate product, accessibility, data, and caching contracts
- `npm run build` — create the Cloudflare/Vinext production build
- `npm run test:rendered` — test rendered pages and the Worker APIs after a build
- `npm test` — run the complete verification sequence
- `npm run db:generate` — generate a new Drizzle migration after schema changes

## Product architecture

- `app/components/AnatomyApp.tsx` coordinates navigation, deep links, search, learner state, and the 3D experience.
- `app/components/ProductViews.tsx` contains Systems, Lessons, Library, structure-linked Notes, Profile, and mobile navigation.
- `app/components/ComparisonExperience.tsx` provides the synchronized side-by-side 3D comparison workspace.
- `app/components/LearningDialog.tsx` contains guided lessons, function sequences, system context, and scored quizzes.
- `app/lib/anatomy-data.ts`, `app/lib/expanded-organs.ts`, and `app/lib/additional-organs.ts` define the 24 specimens and their learning content.
- `app/lib/three/` contains file-backed and procedural model loading, rendering, hotspots, and disposal.
- `worker/index.ts` serves the app and provides `/api/state` and `/api/events`.
- `db/schema.ts` and `drizzle/` define the D1 learner-state and analytics tables.

## Privacy and medical scope

The app does not request a name or email. A strictly necessary, HttpOnly anonymous session cookie connects saved progress to a D1 record; local storage is used as an offline cache. Analytics are limited to an allowlist of product-learning events and do not include free-form notes.

Content is educational and is not medical advice. Reference links and the content cross-check date are shown in the site footer.

## Blender model refinement

`npm run models:refine` rebuilds the 12 expanded specimens and the spleen,
esophagus wall cutaway, and right-knee bone study. Requires Blender (tested with
5.2.1); set `BLENDER_BIN` to override the macOS application path. The pipeline
retrieves uncompressed inputs from Git revision
`91228b4b9e6e5e3155a38ec8035dcd20dc031b4c` (fetch that revision if using a shallow
clone without it). It preserves named anatomy, smooths surfaces, repairs knee
scan seams, and writes editable `.blend` files and renders in ignored
`work/blender-output/`. It then generates meshopt-compressed, content-hashed
GLBs with embedded WebP textures and matching specimen thumbnails.

`app/lib/refined-models.json` records delivered sizes and geometry counts.
The spleen vessels and esophageal wall thickness are schematic. The knee
retains four registered bones, not cartilage or ligaments. These specimens use
honest text-based tissue/location context instead of simulated micrographs.
The original nine core models are unchanged. See `THIRD_PARTY_ASSETS.md` for
attribution and anatomy references.

## Deployment configuration

The Sites configuration remains in `.openai/hosting.json`. `vite.config.ts` also generates a recoverable Cloudflare deployment configuration with the production D1 database, static assets, Images, and Worker observability when `npm run deploy` runs. Apply pending D1 migrations before a deployment that changes the schema.
