#!/bin/sh
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  */docs/reference/*)
    echo "docs/reference/ is generated and byte-checked in CI — run 'pnpm docs:reference' instead of editing it by hand." >&2
    exit 2
    ;;
esac
exit 0
