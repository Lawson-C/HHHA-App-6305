# Hunter Hills: Sanity Studio

The content editor for Foundation staff: alerts, events, housing programs and listings,
library items, and the app's editable text. Project `nxvenp1m`, dataset `production`
(public: never put private data here). See `docs/architecture.md` and `docs/data-model.md`.

```sh
npm install
npm run dev        # http://localhost:3333 (sign in with your Sanity account)
npm run deploy     # publish to https://historic-hunter-hills.sanity.studio
npm run seed       # load the app's demo content (idempotent; skips existing titles)
npm run typecheck && npx sanity schemas validate
```

- Schemas: `schemaTypes/` (field names must match `src/lib/api/types.ts` and `docs/data-model.md`).
- Sidebar: `structure.ts`. "App text" is a singleton (`_id: "appCopy"`).
- Publishing an **Alert** sends a push notification through the Supabase `send-alert` function
  (Sanity webhook; see `supabase/README.md`).
- Changing a field that already holds data: follow the deprecation pattern in the
  `sanity-best-practices` skill (`.agents/skills/sanity-best-practices/references/schema.md`).
