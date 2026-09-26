# TODOS

Design and product debt recorded by reviews. Each item: what, why, pros,
cons, context, depends on.

## Offline scoring queue (plan-design-review D22, 2026-09-13)

- **What:** queue ticks, remarks and N/A reasons locally when the network is
  down; replay through the compare-and-set save when it returns; show
  "Queued" as the row state word meanwhile.
- **Why:** D8 shows "Not saved · Retry" per row but every retry is manual; a
  20-minute outage in a branch means 20 minutes of manual retries.
- **Pros:** fieldwork continues through outages; the versioned save and
  per-row state already exist to replay against.
- **Cons:** IndexedDB queue, conflict replay UI, a second save path, a
  service worker inside a licensed on-prem Docker deployment.
- **Context:** rural UCB branches on shared broadband. The first customer's
  branches are urban, so this is a second-customer need.
- **Depends on:** T3 versioned saves shipped.

## FORM examination kind UI (plan-design-review D23, 2026-09-13)

- **What:** design the third examination kind (structured verification form
  from a JSON schema with computed fields) before it is built.
- **Why:** spec §6.4 defers FORM to after go-live with no UI direction;
  the default outcome is a generic JSON-schema form renderer, which is the
  CRUD look DESIGN.md forbids.
- **Pros:** keeps the register vocabulary (rules, ink, state words); a
  schema-driven register is a natural extension of §6.5a.
- **Cons:** design against a pack schema that may still change.
- **Context:** cash verification is already a kernel surface; FORM
  generalises it for fixed assets and register checks.
- **Depends on:** content packs (§7) and the register (T2) shipped.

## Critical-cap explanation in reports (plan-design-review D24, 2026-09-13)

- **What:** a fixed block in every report that prints a module score:
  how the five values, N/A exclusion, bank weights and the 50.0 critical
  cap combined, with the engagement's actual numbers.
- **Why:** D19 prints aggregates as percentages and the cap as "capped at
  50.0"; a board member sees a 50.0 module with mostly Fully compliant
  rows and cannot tell why.
- **Pros:** one template block generated from `formatScore` and the
  `BranchRbiaScore` snapshot; closes the "explain score effects" ask.
- **Cons:** report space; wording needs the bank's audit head to sign off.
- **Context:** the register explains effects live in the band; reports are
  read without the auditor present.
- **Depends on:** reporting engine §6.2, T12 formatScore.

## docker-compose.vps.yml verification disclaimer (codebase review, 2026-09-26)

- **What:** a header comment on `docker-compose.vps.yml` stating it was
  verified against one specific external host (`vps-control`) on one
  specific date (2026-09-16), not a claim about current deployment state
  generally.
- **Why:** `docs/architecture.md` § Deployment targets says this overlay was
  "verified live against vps-control," while `CLAUDE.md`, `AGENTS.md` and
  `README.md` all repeatedly state AEGIS is "not deployed anywhere." Someone
  reading the compose file on its own, without also reading architecture.md's
  caveat, would reasonably conclude more than is true.
- **Pros:** one comment, no code change, removes a real inconsistency
  between the authoritative docs and a config file without requiring anyone
  to decide deployment policy first.
- **Cons:** a comment doesn't stay fresh on its own — if the file is edited
  again without updating the disclaimer's date/host, it becomes stale in the
  same way; doesn't address architecture.md's separate note that "nothing
  yet automates the VPS overlay" the way the on-prem installer does.
- **Context:** three Compose overlays exist (base, on-prem, VPS); this is the
  newest one and the only one verified against a live, named external host
  rather than purely local/on-prem tooling.
- **Depends on:** nothing — purely additive documentation.
