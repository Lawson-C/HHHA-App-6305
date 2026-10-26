# Project Documentation

Specifications for the **Historic Hunter Hills Neighborhood Association (HHHNA) App**, Prometheus Team No. 6305. Client: Maya Teague (HHHNA).

These Markdown files are the **authoritative, developer-facing specs**. They are distilled from the team's source documents (the `.docx` files in this folder). If a Markdown spec and a `.docx` disagree, the Markdown spec wins, because it was written later and records the decisions made since then. Record any change in [`decisions.md`](decisions.md).

| File | What it answers |
| --- | --- |
| [`product.md`](product.md) | What are we building, for whom, and which features are in scope? |
| [`architecture.md`](architecture.md) | What are the major components (app, Sanity in `studio/`, Supabase in `supabase/`), what does each one own, and how do they talk to each other? |
| [`data-model.md`](data-model.md) | Which content types (Sanity, `studio/schemaTypes/`) and tables (Supabase, `supabase/migrations/`) exist, with their fields and constraints? |
| [`api.md`](api.md) | Which GROQ queries, Supabase tables/RPCs/Storage paths, Edge Functions and push payloads exist between the app, Sanity, Supabase and external services? |
| [`security.md`](security.md) | How do authentication, authorization (RLS), data handling and secrets work? |
| [`integrations.md`](integrations.md) | Which external data sources do we use, and what is still unknown about them? |
| [`design/ui-spec.md`](design/ui-spec.md) | Navigation structure, screens, components and UX rules |
| [`design/user-flows.md`](design/user-flows.md) | Step-by-step flows, taken from the validated task scenarios |
| [`decisions.md`](decisions.md) | Decision log and **open questions** that still need a team or client answer |
| [`development.md`](development.md) | How to run, test and verify the app, the Studio and Supabase, and how to deploy |
| [`tasks/`](tasks/) | Implementation task briefs and the agent-proposed plans for them |

Two more READMEs sit next to the code they describe. [`../supabase/README.md`](../supabase/README.md) covers the local stack, the hosted project, function secrets, the Sanity webhook, cron, and the rules for new migrations. The Sanity schemas in `studio/schemaTypes/` and the SQL in `supabase/migrations/` are the source of truth for field names and access rules. `data-model.md`, `api.md` and `security.md` must stay in sync with them.

## Source documents (`.docx`)

- `Team Project Description.docx`: the client's original project brief and expected deliverables.
- `DCA-6305 Detailed Design Version 1.docx`: static architecture, ERD and data design. Version 2 will add the dynamic architecture and UI design.
- `Iteration_Plan_Template.docx`: features broken into user stories with tasks and acceptance criteria.
- `Task Scenarios.docx`: the usability-test task scenarios from prototyping.

[`product.md`](product.md) summarizes the rules for each feature. The complete per-user-story tasks and acceptance criteria live in the Iteration Plan, and each implementation task in [`tasks/`](tasks/) restates the criteria that apply to it.
