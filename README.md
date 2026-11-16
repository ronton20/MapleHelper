# Maple Helper

Personal MapleStory (GMS Heroic) tracker: gear per character with presets, and HEXA progression with an upgrade path.
Local-first web app — all data stays in your browser (IndexedDB) with JSON export/import.

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

## Mobile

The app is a PWA: on iPhone open it in Safari → Share → **Add to Home Screen**. Below ~900 px it switches to a phone layout
(character drawer, bottom Gear/HEXA tabs, bottom-sheet item editor, stacked HEXA tabs with a zoomable chart image).

**Sync between devices** (Settings → Sync): "Enable sync" creates a random key and shows a QR code / pairing link; scan it
with the phone camera (or paste the key) and both devices share the same data through the worker (`PUT/GET /sync/:key`,
stored in the same KV namespace). Newer version of each character wins; deletions don't propagate. Anyone with the key can
read the data, so don't share it.

## Shared template library (optional)

The worker also hosts a shared library of HEXA templates (node list, icons, leveling order), **categorised by class**.
Setup: in Cloudflare create a **Workers KV** namespace and bind it to the worker as `TEMPLATES`.

- **Sharing:** in the chart-import popup pick the class, give the save a name, tick "Share with other <class> players".
  Optional `PUBLISH_KEY` secret on the worker restricts who can publish (enter it in Settings).
- **Using:** in Add/Edit character pick the class; the "HEXA data" list then shows only that class's
  data saved on this device, and shared saves. Shared data is downloaded when you save the character.
- **Admin panel:** add an `ADMIN_KEY` secret on the worker (any long random string). In the app: Settings → Admin →
  enter the key → edit save names, reassign classes, rename/retype nodes, edit the leveling order, replace from JSON,
  download or delete. The key is kept only for the browser session.

## Skill bank (shared, admin-managed)

All HEXA skill icons, names and cores come from the **skill bank** in the same KV namespace (`bank:<classKey>`,
plus `bank:common` for Sol Janus / Sol Hecate / HEXA Stat). The app caches it in IndexedDB so it works offline.

- **First upload:** Admin → Skill bank → *Upload folder* → pick the `hexa-skills` folder (one sub-folder per class
  with `skills.csv` = `name,type,slot,primary,icon` + the icon PNGs). Each class's bank is replaced.
- **New skills later:** Admin → Skill bank → pick the class → *Edit*: add icons to a core, rename, move an icon to
  another core, or ★ the icon the core shows. Or, while importing a chart as admin, pick the core for an unknown icon
  and press the 📚 button to add it to the bank.
- **Chart import** matches every chart icon against the class + common bank: recognised icons get the core's name,
  type and slot automatically (several icons of one core are merged).
- **HEXA view:** node icons and default names come from the bank (names can still be renamed per character).
  Shared templates only store the core, not the icon.
- Test tools: `npx tsx scripts/bank-check.ts chart.png <classKey>` (match a chart against a local `hexa-skills`
  folder, `BANK=<dir>`), `npx tsx scripts/bank-parse-test.ts <hexa-skills dir>`.

## Contact links & Buy Me a Coffee

Edit `src/config.ts`: `SOCIALS.discord` (shown with a copy button at the bottom of the sidebar) and
`BUY_ME_A_COFFEE` (your buymeacoffee.com page name — the yellow button only shows once this is set).

## Structure

```
src/data/slots.ts       grid layout + slot → item categories
src/data/hexaCosts.ts   fragment/erda cost tables per node type
src/data/classes.ts     generic HEXA node list + default flame weights per class type
src/data/skillBank.ts   skill-bank slots (HEXA cores), lookups, CSV parsing
src/api/bank.ts         skill bank API + IndexedDB cache
src/db.ts               Dexie schema, export/import
src/api/                maplestory.io (icons, search) and nexon rankings (via proxy)
src/components/         Sidebar, equipment/ (grid, inspector, presets, search), hexa/, SettingsView
worker/proxy.js         Cloudflare Worker CORS proxy
```

Adding a class: append an entry to `CLASSES` in `src/data/classes.ts`.
