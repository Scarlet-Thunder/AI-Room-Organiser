# ChiSpace: AI feng shui room planner

Set a budget, pick the furniture you want, and let an AI layout engine arrange your
room by feng shui principles. Explore it in 3D, then place the whole furnished room
at real-world scale in your actual space with AR.

Runs entirely in the browser: no backend, no account, no API keys.

## Features

- **Room setup**: presets (bedroom, living room, home office, studio), size, door, and windows.
- **Budget optimizer**: picks Essential / Mid / Premium tiers to fit your budget, drops nice-to-haves first, and spends leftover money where it matters most (bed, sofa, chair). You can lock any tier.
- **AI arrangement**: a simulated-annealing optimizer (runs in a Web Worker) tests tens of thousands of layouts against feng shui rules and keeps the best:
  - Commanding position for bed, desk, and sofa (solid wall behind, door visible diagonally, not in line with it)
  - Bed not under a window, accessible from both sides
  - Clear door swing and entry path; 55 cm+ walkways to every piece (grid path-finding)
  - Large pieces backed by walls; tall pieces not blocking windows
  - Bagua map from the entrance: plant in the wealth corner, open health centre
  - Mirror not reflecting the bed or the door; TV and seating facing each other; balanced weight
- **Explanations**: a scored checklist plus a "why it's here" note for every piece.
- **Fine-tune**: drag pieces on the floor plan (snaps to walls), rotate with R, and the score updates live.
- **3D view**: procedurally modelled furniture in a cut-away dollhouse view (three.js).
- **AR**: exports the furnished room (or any single piece) as a GLB and opens it in `<model-viewer>`, using WebXR on Android Chrome and Quick Look on iPhone/iPad. Furniture is placed at true scale, with a room outline and door marker on the floor. On desktop, scan the QR code to open the same layout on your phone.
- **Share links**: the whole project is encoded in the URL hash (never sent to a server).
- Saves automatically in your browser. Responsive, with light and dark themes.

## Run locally

Serve the folder with any static server (ES modules need http://, not file://):

```bash
npx serve .
```

```bash
python -m http.server 8090
```

On Windows without Node/Python: `powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8090`.

Engine self-test: open `/tests/selftest.html`.

## Deploy

Static files only. AR and camera features need HTTPS, which all of these provide:

- **GitHub Pages:** upload the files (with `index.html` at the repo root), then go to Settings → Pages → Deploy from a branch → `main` / `(root)`.
- **Netlify:** drag the folder onto https://app.netlify.com/drop.
- **Vercel:** `npx vercel` in this folder.

## How the AI works

1. Each layout is scored by a penalty function (`js/fengshui.js`): overlap, out-of-bounds, door clearance, access zones in front of and beside furniture, window blocking, wall backing, commanding position (angle and line-of-sight to the door), relationships (TV↔sofa, armchair↔coffee table), bagua placement, and balance.
2. Dependent pieces follow their parent (nightstands flank the bed, the chair tucks into the desk, the coffee table and rug sit in front of the sofa), which shrinks the search space.
3. Simulated annealing (`js/optimizer.js`) mutates the free pieces (shift, snap to wall, slide along wall, rotate, swap, teleport) with a cooling temperature. It does 8 random restarts plus a greedy polish, then a final walkway check picks the winner. It's seeded, so "Try another layout" is reproducible.
4. `explain()` turns the final penalty terms into the human-readable checklist.

## Project structure

```
index.html              App shell (three.js via import map)
css/styles.css          Styles
js/app.js               State, UI wiring, rendering
js/catalog.js           Furniture catalog, prices, room presets
js/budget.js            Tier selection under a budget
js/fengshui.js          Geometry, attachments, scoring, walkway check, explanations
js/optimizer.js         Simulated-annealing layout search
js/optimizer.worker.js  Runs the optimizer off the main thread
js/plan2d.js            SVG floor plan with drag/rotate
js/models.js            Procedural 3D furniture (three.js)
js/scene3d.js           3D room view + GLB export
js/ar.js                <model-viewer> AR modal + QR handoff
js/share.js             URL-hash project encoding
tests/                  Browser self-test
```

## Notes

- Prices are typical ranges per tier, not live retailer prices.
- Feng shui guidance follows common Form School / BTB principles. It's a design aid, not dogma.
- 3D models are procedural stand-ins sized to the catalog dimensions. To use real product models, swap a builder in `js/models.js` for a GLB loader.
