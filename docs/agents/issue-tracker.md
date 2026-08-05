# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

`.scratch/` is gitignored. This is a public repo, so the working rule is that issue files stay local: don't stage them, and don't `git add -f` them. The ignore entry enforces nothing on its own — treat it as a convention, not a guarantee.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings). Wayfinding tickets are the exception — their `Status:` holds the claim lifecycle instead (see below); they are not triaged.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create the file under `.scratch/<feature-slug>/`, creating the directory if needed. A spec goes to `spec.md`; an implementation ticket goes to `issues/<NN>-<slug>.md`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. Issue numbers restart at `01` per feature, so a bare number is ambiguous — the user must pass the full path, or the feature slug alongside the number.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

Wayfinding tickets share the `.scratch/<name>/issues/` layout with ordinary implementation tickets. The discriminator is the `Type:` line — a ticket that has one is a wayfinding ticket and is never triaged; a ticket without one is an ordinary implementation ticket and carries a triage role.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `unclaimed`/`claimed`/`resolved` — the claim lifecycle, not a triage role. New tickets are created `unclaimed`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
