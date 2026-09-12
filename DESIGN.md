---
name: AEGIS 2.0
mode: operate
source: docs/superpowers/specs/2026-09-12-first-customer-readiness-design.md §6.5a, §7.6 (approved wireframe v3, 2026-09-12)
colors:
  background: "hsl(0 0% 100%)"          # {--background} white ground
  surface: "hsl(210 40% 96%)"           # {--muted} hover and skeleton fill only
  ink: "hsl(222 47% 11%)"               # {--foreground} #0F1A2E
  muted: "hsl(215 20% 37%)"             # {--muted-foreground} #4B5A70, AA on white
  border: "hsl(214 22% 86%)"            # {--border} #D3DBE4 row rules
  border-strong: "hsl(213 15% 62%)"     # {--border-strong} #8E9DB0 controls, section rules
  primary: "hsl(207 90% 35%)"           # {--primary} #0E5A9C the one accent
  warning: "hsl(32 93% 37%)"            # {--warning} #B45309 amber, ink only
  destructive: "hsl(4 68% 43%)"         # {--destructive} #B42318 red, ink and the Non-compliant fill
  success: "hsl(151 60% 26%)"           # {--success} #1B6B45 green, ink only
dark:
  background: "hsl(216 35% 9%)"         # #0F151F
  surface: "hsl(216 31% 13%)"           # #161E2A
  ink: "hsl(213 30% 93%)"               # #E8EDF3
  muted: "hsl(214 17% 69%)"             # #A2AFC0
  border: "hsl(214 25% 22%)"            # #2A3646
  border-strong: "hsl(213 19% 41%)"     # #55677D
  primary: "hsl(208 72% 71%)"           # #7DB8EC, on dark the accent lightens; accent-ink #0B1220
  warning: "hsl(35 71% 58%)"            # #E0A24A
  destructive: "hsl(5 81% 72%)"         # #F08A80
  success: "hsl(146 50% 62%)"           # #6CCF98
type:
  body: "Noto Sans"                     # {--font-noto-sans}
  display: "DM Serif Display"           # {--font-dm-serif} one line per page
  scale: [11, 12, 12.5, 13, 14, 16, 17, 22, 27, 32]
rounded:
  control: "2px"                        # {--radius} tags, inputs, buttons
  mark: "50%"                           # scale ticks only
spacing:
  gutter: "16px"
  row: "10px 6px"
---

# AEGIS 2.0 design system

Mode: operate. Auditors and bank admins finish tasks here; nothing on a page
persuades. The look is a bank inspection register: ink, rules and tabular
numbers on a white ground, one accent, semantic colour used as ink and never
as a tint.

## Palette roles

| Role | Variable | Use |
|---|---|---|
| background | `--background` | Every page and panel ground. Never a tinted body. |
| surface | `--muted` | Hover on rail rows, skeleton rows. Not a card fill. |
| ink | `--foreground` | Text, strong rules (section top, sticky header bottom). |
| muted | `--muted-foreground` | Reference lines, counts, labels. Darkened to `#4B5A70` so it passes AA at 12.5px. |
| border | `--border` | Row rules, table rules, pack list rule. |
| border-strong | `--border-strong` | Control borders, tick outline, group rules. |
| primary | `--primary` | Selected tick fill, links, primary button, changed-share figures, focus ring, selection, caret, `accent-color`. |
| warning | `--warning` | "Remarks due" word, required rule on the remarks textarea. Ink only. |
| destructive | `--destructive` | "Non-compliant" word and tick fill, Critical tag, "Not saved". |
| success | `--success` | "Scored" word, module scores at or above 0.80. Ink only. |

Semantic colour never tints a row, band, or card. State is carried by a
word in the code column and by the mark, not by a background.

## Type

- Body and UI: Noto Sans. Statement text 16px. Meta and reference 12.5–13px.
  Column headers 12px, tags 11px uppercase with 0.06em tracking.
- Display: DM Serif Display, 27px, for one line per page (the engagement or
  branch name, the page title). Nowhere else.
- Numbers: `font-variant-numeric: tabular-nums` on the body; every count,
  score, weight and code lines up.
- No third face. No monospace as costume; codes are Noto Sans with tabular
  figures.

## Shape

- Radius 2px on tags, inputs, buttons, panels. Ticks are circles; the N/A
  tick is a 2px square so it reads as a different kind of mark.
- No shadows. Depth is a 1px rule in ink or border.
- No pills, no chips with full radius, no icon tiles, no glyph icons in text
  buttons. Actions are underlined text links or bordered buttons.

## Named patterns

- **Register**: grid `code | statement | 6 ticks` with a sticky header
  carrying the section title, counts, filter, and the six column labels.
  Rows separated by `--border`; register top and header bottom in ink.
- **Tick**: 22px circle, `--border-strong` outline, fills `--primary` when
  selected, `--destructive` for Non-compliant, ink for N/A. 44px hit area.
- **State word**: 11px uppercase under the statement code. Unscored (muted),
  Remarks due (warning), Scored (success), Non-compliant (destructive),
  Not applicable (muted), Not saved · Retry (destructive), Scored by <name>
  (muted).
- **Band**: full-width row under the statement for remarks or N/A reason,
  label left, score effect right, amber left rule while required.
- **Tag**: 11px uppercase bordered box: Critical (destructive), Bank
  (primary), pack version (muted).
- **Rail**: module register grouped Core / Packs / Kernel; counts and band-
  coloured score right-aligned; current section marked by a 2px inset rule.
  Below 900px it lives in a left `sheet` opened from the section title.
- **Ticks as controls**: a `radiogroup` per row (five `radio`s labelled
  "<label>, <value>") plus a `checkbox` for N/A; one polite live region per
  row for the state word and score effect.
- **Side panel**: fixed right, ink left rule, `role="dialog"`, Escape
  closes, focus trapped and returned.
- **Status line**: bottom-left bordered text, 2.4s, for "Saved …" and
  "Added …". Not a toast stack.
- **Sample register**: the register with `Compliant | Violation | N/A`
  columns and an account list in the rail (spec §6.5b). Same state words.
- **Numbers**: amounts in Indian grouping (₹12,34,567.00) via `formatAmount`;
  scores via `formatScore`; dates `12 Sep 2026`.

## Themes

Light and dark ship together (D17); light is the default regardless of the OS,
and the user switches from the user menu (grilling Q9). Both palettes live in `globals.css`:
the bare `:root` block is light; `@media (prefers-color-scheme: dark)`
guarded as `:root:not([data-theme="light"])` and `:root[data-theme="dark"]`
redefine the same tokens. Components read tokens only; no colour is defined
inside a theme block. The sidebar reads the same tokens. Semantic colours
lighten on dark so they stay ink, not glow; the accent lightens and its
foreground flips to near-black.

## Browser surfaces

`::selection` primary at 20%, `caret-color` and `accent-color` primary,
`scrollbar-color` border on background, visited reference links muted with
the same underline.

## Do not

- Cards as layout. Cards only when the card is the interaction.
- Tinted state backgrounds, left accent stripes, gradients, glow.
- Toasts for outcomes that belong in the row.
- Inter, Roboto, Arial, system-ui as a voice. Emoji as markers.
- Labels inside fields as the only label.
- Body text under 16px on a statement; meta under 12.5px anywhere.
- Field names in copy ("hasForex"). Say "Branches with forex business".
