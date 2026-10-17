#!/usr/bin/env bash
# Bundles packages/parser + rrule + luxon into one IIFE for JavaScriptCore.
#   scripts/build-core-js.sh          regenerate Resources/husrevity-core.js and core-js.inputs.sha256
#   scripts/build-core-js.sh --check  exit 1 if the committed bundle or the input hashes are stale
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$HERE/../Sources/HusrevityJS/Resources/husrevity-core.js"
MANIFEST="$HERE/core-js.inputs.sha256"
BUN="${BUN:-$(command -v bun || echo /opt/homebrew/bin/bun)}"

build_to() {
  "$BUN" build "$HERE/core-js-entry.ts" --tsconfig-override "$HERE/tsconfig.json" --target=browser --format=iife --minify-whitespace --outfile "$1" >/dev/null
}

# SHA-256 of every TypeScript input of the bundle, paths relative to the repo root, sorted.
# Keep in sync with BundleFreshnessTests.swift.
write_manifest() {
  (
    cd "$ROOT"
    {
      ls packages/parser/src/*.ts | grep -v '\.spec\.ts$'
      echo apps/api/src/item/item-recurrence.service.ts
      echo apps/api/src/item/rrule-validation.ts
      echo apps/macos/scripts/core-js-entry.ts
      echo apps/macos/scripts/core-js-expand.ts
      echo apps/macos/scripts/tsconfig.json
    } | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done
  ) > "$1"
}

if [[ "${1:-}" == "--check" ]]; then
  TMP="$(mktemp -t husrevity-core.XXXXXX)"
  TMP_MANIFEST="$(mktemp -t husrevity-inputs.XXXXXX)"
  trap 'rm -f "$TMP" "$TMP_MANIFEST"' EXIT
  build_to "$TMP"
  write_manifest "$TMP_MANIFEST"
  if ! cmp -s "$TMP" "$OUT" || ! cmp -s "$TMP_MANIFEST" "$MANIFEST"; then
    echo "husrevity-core.js is stale; run apps/macos/scripts/build-core-js.sh" >&2
    exit 1
  fi
  echo "husrevity-core.js is up to date"
else
  build_to "$OUT"
  write_manifest "$MANIFEST"
  echo "wrote $OUT and $MANIFEST"
fi
