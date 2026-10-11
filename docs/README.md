# Project Documentation

Specifications for the **Historic Hunter Hills Neighborhood Association (HHHNA) App**, Prometheus Team No. 6305. Client: Maya Teague (HHHNA).

These Markdown files are the **authoritative, developer-facing specs**. They are distilled from the team's source documents (the `.docx` files in this folder). If a Markdown spec and a `.docx` disagree, the Markdown spec wins, because it was written later and records the decisions made since then. Record any change in [`decisions.md`](decisions.md).

| File | What it answers |
| --- | --- |
| [`product.md`](product.md) | What are we building, for whom, and which features are in scope? |
| [`architecture.md`](architecture.md) | What are the major components, what does each one own, and how do they talk to each other? |
| [`data-model.md`](data-model.md) | Which entities, fields, relationships and constraints exist? |
| [`api.md`](api.md) | Which HTTP interfaces exist between the app, Strapi, Supabase and external services? |
| [`security.md`](security.md) | How do authentication, authorization, data handling and secrets work? |
| [`integrations.md`](integrations.md) | Which external data sources do we use, and what is still unknown about them? |
| [`design/ui-spec.md`](design/ui-spec.md) | Navigation structure, screens, components and UX rules |
| [`design/user-flows.md`](design/user-flows.md) | Step-by-step flows, taken from the validated task scenarios |
| [`decisions.md`](decisions.md) | Decision log and **open questions** that still need a team or client answer |
| [`development.md`](development.md) | How to run, test and verify the project locally |
| [`tasks/`](tasks/) | Implementation task briefs and the agent-proposed plans for them |

## Source documents (`.docx`)

- `Team Project Description.docx`: the client's original project brief and expected deliverables.
- `DCA-6305 Detailed Design Version 1.docx`: static architecture, ERD and data design. Version 2 will add the dynamic architecture and UI design.
- `Iteration_Plan_Template.docx`: features broken into user stories with tasks and acceptance criteria.
- `Task Scenarios.docx`: the usability-test task scenarios from prototyping.

[`product.md`](product.md) summarizes the rules for each feature. The complete per-user-story tasks and acceptance criteria live in the Iteration Plan, and each implementation task in [`tasks/`](tasks/) restates the criteria that apply to it.
