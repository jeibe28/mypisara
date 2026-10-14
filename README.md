# MyPisara

MyPisara is a visual board for ideas: notes, to-dos, links, images, files, headings, colour swatches, columns, connecting lines and nested boards on one zoomable canvas. *Pisara* is Filipino for chalkboard.

It is built with Next.js 16, TypeScript, Neon PostgreSQL, Better Auth (email and password) and a private Vercel Blob store.

## Run locally

Node.js 20.9 or newer is required.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without database credentials, MyPisara runs in **demo mode**: boards are saved in this browser only. `/demo` always opens demo mode, even when accounts are configured.

## Accounts and storage

Each account has its own private boards. Every board query runs as the restricted `mypisara_app` role with the signed-in user as owner, and PostgreSQL row-level security is forced on the `boards` table, so a missing or wrong owner returns nothing. Uploaded images and files are stored under `board-assets/<user id>/` in a private Blob store and are only streamed to their owner.

Sign-up is open by default. Set `DISABLE_SIGN_UP=true` to keep MyPisara private to existing accounts.

## Board features

- Left rail (Note, Link, To-do, Line, Board, Column, Heading, Image, Color, Upload) with drag-to-canvas, and **Trash** as a drop target.
- Columns stack their cards; drag cards in, between, and out.
- The **Board** tool creates a nested board, with breadcrumbs back to the parent.
- Selecting a card or line opens the side panel: rename, colour, line weight, solid/dashed, arrows, label, layer order, duplicate and delete. Several selected cards can be aligned and distributed.
- Multi-select by dragging on empty canvas; copy, cut, paste and duplicate keep column contents and line connections.
- Autosave with revision checks, undo/redo, browser draft recovery, minimap, zoom (Ctrl/⌘ + scroll or pinch) and keyboard shortcuts (press `?`).

## Checks

```bash
npm run typecheck
npm test
npx playwright test
npm run build
```

See [DEPLOYMENT.md](DEPLOYMENT.md) to put MyPisara on its own Vercel project and domain.
