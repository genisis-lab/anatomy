# Anatomy Atelier

An interactive, public anatomy learning experience for [BuiltWAI](https://builtwai.com). The site combines 30 educational 3D specimens and system modules with resumable lessons, focused review, labelling quizzes, guided system pathways, synchronized 3D comparisons, structure-linked notes, and anonymous learning progress.

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
- `npm run models:build` — rebuild the Three.js specimens (see below)
- `npm run models:previews` — re-render specimen artwork from the built models

## Product architecture

- `app/components/AnatomyApp.tsx` coordinates navigation, deep links, search, learner state, and the 3D experience.
- `app/components/ProductViews.tsx` contains Systems, Lessons, Library, structure-linked Notes, Profile, and mobile navigation.
- `app/components/ComparisonExperience.tsx` provides the synchronized side-by-side 3D comparison workspace.
- `app/components/LearningDialog.tsx` contains guided lessons, function sequences, system context, and scored quizzes.
- `app/lib/anatomy-data.ts`, `app/lib/expanded-organs.ts`, and `app/lib/additional-organs.ts` define the 30 specimens and their learning content. `app/lib/three-models.ts` joins the 21 Three.js specimens to their built models and hotspot anchors.
- `app/lib/three/` contains model loading, rendering, hotspots, and disposal.
- `worker/index.ts` serves the app and provides `/api/state` and `/api/events`.
- `db/schema.ts` and `drizzle/` define the D1 learner-state and analytics tables.

## Privacy and medical scope

The app does not request a name or email. A strictly necessary, HttpOnly anonymous session cookie connects saved progress to a D1 record; local storage is used as an offline cache. Analytics are limited to an allowlist of product-learning events and do not include free-form notes.

Content is educational and is not medical advice. Reference links and the content cross-check date are shown in the site footer.

## Three.js specimen pipeline

The nine core organs (heart, brain, lungs, liver, kidneys, eyeball, intestine,
pancreas and skin) ship their original models. The other 21 specimens are built
in Node with Three.js by `scripts/three-anatomy/`:

- stomach, skeleton, muscles, ear, spinal cord, bladder, thyroid, lymphatic,
  female and male reproductive, gallbladder, airway and diaphragm, spleen,
  esophagus and knee
- tooth, tongue, larynx, adrenal glands, lumbar spine and hand

`kit/` is a small modelling toolkit. It provides signed distance fields with
narrow-band marching cubes, tapered tubes and grown vessel trees, planar
sections with filled cut faces, and vertex-colour painting. The painting bakes
ambient occlusion, cavity shading and procedural tissue patterns, and also
paints the layers exposed on cut faces. Each `organs/<id>.mjs` builder describes
one specimen as named structures and places its hotspot anchors on them. The
skeleton, muscles, knee, hand, lumbar spine and the lymphatic skeletal frame
use registered BodyParts3D surfaces. The first build downloads these into the
ignored `scripts/.model-cache/bodyparts3d/` (set `ANATOMY_SCAN_SOURCE_DIR` to
use a local copy). They are smoothed, simplified, sectioned and painted. The
soft organs are authored from atlas references.

```bash
npm run models:build                     # all 21 specimens
npm run models:build -- ear knee         # selected specimens
npm run models:build -- --draft tooth    # write to work/three-anatomy/ for review
npm run models:previews                  # organ.webp and thumb.webp for every specimen
```

A published build writes meshopt-compressed, content-hashed GLBs to
`public/models/` and removes the previous file for each rebuilt id. It also
records every model's URL, size, mesh and triangle counts and hotspot anchors
(position and the named mesh each one snaps to) in `app/lib/three-models.json`.
Learning content and hotspot text stay in `app/lib/expanded-organs.ts` and
`app/lib/additional-organs.ts`. `npm run test:source` checks the manifest,
the files and every hotspot anchor.

Previews render the models with the viewer's lighting in headless Chromium
through `playwright-core`. Set `CHROMIUM_PATH` to use a specific browser build.

These are reference-guided teaching models, not patient-specific or clinically
validated anatomy. Cut-away windows, layer thicknesses, vessel calibre and
microscopic features are enlarged or simplified so they read at study scale.
Each specimen's limits are stated in its "About this 3D study" note. See
`THIRD_PARTY_ASSETS.md` for attribution and anatomy references.

## Deployment configuration

The Sites configuration remains in `.openai/hosting.json`. `vite.config.ts` also generates a recoverable Cloudflare deployment configuration with the production D1 database, static assets, Images, and Worker observability when `npm run deploy` runs. Apply pending D1 migrations before a deployment that changes the schema.
