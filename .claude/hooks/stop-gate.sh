#!/bin/sh
jq -e .stop_hook_active >/dev/null && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -z "$(git status --porcelain -- '*.ts' '*.tsx' ':!next-env.d.ts')" ] && exit 0
out=$(pnpm exec tsc --noEmit 2>&1 && pnpm exec vitest run 2>&1) || { printf '%s\n' "$out" | tail -40 >&2; exit 2; }
