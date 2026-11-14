# Maple Helper

Personal MapleStory (GMS Heroic) tracker: gear per character with presets, and HEXA progression with an upgrade path.
Local-first web app — all data stays in your browser (IndexedDB) with JSON export/import.

> [!CAUTION]
> MOBILE SUPPORT WILL COME IN THE FUTURE

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (deploy anywhere, e.g. GitHub Pages)
```

## Configuration

The worker URL is read at build time from `VITE_PROXY_URL`:
- locally: copy `.env.example` to `.env` (gitignored) and set it;
- on GitHub Pages: set it as an Actions **variable** (or secret) named `VITE_PROXY_URL`; `.github/workflows/pages.yml`
  builds and deploys on every push to `main` (enable Pages → Source: GitHub Actions once).
It is not shown in the UI. Only the optional library `PUBLISH_KEY` is a real secret, and it lives on the
worker (Cloudflare → Worker → Settings → Variables), never in the app.

## One-time setup

1. **Item icons / search** work out of the box (maplestory.io). If new items are missing, bump the GMS version in Settings.
2. **Character fetch** (job, level, image from the GMS rankings) needs a tiny proxy because nexon.com blocks browser requests:
   - Cloudflare dashboard → Workers & Pages → Create Worker → paste `worker/proxy.js` → Deploy
   - Paste the worker URL into Settings → "Nexon rankings proxy URL"
   - Without it, you can still add characters manually (name, job, level, image URL).

## Using it

- **Sidebar**: add characters (+) — pick region (EU/NA) and world type (Heroic/Regular) in the dialog, then Fetch. Click one to open it. Hover → trash to delete.
- **Gear**: the grid mirrors the in-game Equipment window. Click a slot → search an item (or add a manual one) → edit stars, potential, flames, soul, notes in the side panel. Borders show potential rank; the star badge turns gold when you hit your goal.
- **Presets**: tabs above the grid. Double-click or the pencil to rename; duplicate to make a "drop gear" variant of your main set.
- **HEXA**: set each node's current level; add checkpoints ("node → level") in your intended order. The app computes fragment cost, days at your rate, next step and completion %. Drop your class' leveling-order image on the page to keep it next to the tracker. Nodes are editable (rename/add/remove) and resettable to the class template.
- **Import a chart** (HEXA page → "Import chart", or drop an image on the image card): the app finds the icon tiles, matches
  them into skills, reads names (legend / labels / known icons) and the level under each tile, then shows a review popup
  (rename, set types, merge icon variants, fix flagged levels). "Apply" replaces the node list + leveling order and can save
  the result as a class template that shows up in the class dropdown for other characters. Works with legend+rows charts
  (Night Walker style), labelled grids (Adele style) and busy-background charts (Hayato style). OCR runs locally
  (tesseract.js bundled under `public/tess`), nothing is uploaded anywhere.
- **Flame score** = main + secondary/12 + 3×ATT + 10×All% (community rule of thumb); goals per item come from the Flame Score Targets table (Early / Mid / Late by item level, flame-advantaged or not) — new items default to the Mid target. Weights per character in Settings.
- **Backup**: Settings → Export JSON. Import on another device (merge or replace).

## Shared template library (optional)

The same worker can host a shared library of imported HEXA templates so other people start from an existing node list,
icons and leveling order instead of re-importing a chart: in Cloudflare, create a **Workers KV** namespace and bind it to
the worker as `TEMPLATES` (Worker → Settings → Bindings). Then the import popup offers "Publish to shared library" and the
Add-character dialog has "Browse shared library". Add a `PUBLISH_KEY` secret on the worker if you want to restrict publishing.

## Structure

```
src/data/slots.ts       grid layout + slot → item categories
src/data/hexaCosts.ts   fragment/erda cost tables per node type
src/data/classes.ts     seeded HEXA node lists (Hero, Ren, Night Walker) + flame weights
src/db.ts               Dexie schema, export/import
src/api/                maplestory.io (icons, search) and nexon rankings (via proxy)
src/components/         Sidebar, equipment/ (grid, inspector, presets, search), hexa/, SettingsView
worker/proxy.js         Cloudflare Worker CORS proxy
```

Adding a class: append an entry to `CLASSES` in `src/data/classes.ts`.
