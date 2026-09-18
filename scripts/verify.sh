#!/usr/bin/env bash
# The gate between an automated roadmap change and the app the child actually
# practises on. Nothing reaches main unless every check here passes.
#
# Runs locally too — worth a minute before pushing by hand.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "1. JavaScript parses"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for f in js/*.js worker/src/*.js; do
  # node --check treats .js as CommonJS and rejects import/export, so check a
  # .mjs copy of each ES module instead.
  cp "$f" "$tmp/$(basename "${f%.js}").mjs"
done
for f in "$tmp"/*.mjs; do
  node --check "$f" || fail "$(basename "$f") has a syntax error"
done

echo "2. Every module the app loads exists"
# A renamed or forgotten file only shows up as a blank screen at runtime,
# which is exactly the failure an unattended change must not ship.
grep -ohE "from '\./[a-zA-Z0-9_]+\.js'" js/*.js \
  | grep -oE "[a-zA-Z0-9_]+\.js" | sort -u | while read -r mod; do
  [ -f "js/$mod" ] || fail "js/$mod is imported but missing"
done
grep -oE 'src="js/[a-zA-Z0-9_]+\.js"' index.html | grep -oE 'js/[^"]+' | while read -r mod; do
  [ -f "$mod" ] || fail "$mod is referenced by index.html but missing"
done

echo "3. Worker tests"
( cd worker && node --test ) || fail "worker tests"

echo "4. The changelog watermark moved"
# Without this the same items get reprocessed on every future run, forever.
processed=$(grep -oE 'ROADMAP_LAST_ITEM_NUMBER = [0-9]+' js/changelog.js | grep -oE '[0-9]+$')
highest=$(grep -oE '^[0-9]+\.' "Roadmap ideas and debug.md" | tr -d '.' | sort -n | tail -1)
[ "$processed" -ge "$highest" ] || fail "ROADMAP_LAST_ITEM_NUMBER is $processed but the roadmap file reaches $highest"

echo "5. A Changes entry was added"
# Roadmap item 81: every processing run records what it did.
grep -q "CHANGELOG = \[" js/changelog.js || fail "CHANGELOG is missing from js/changelog.js"

echo "6. The roadmap file itself is untouched"
# The workflow triggers on changes to this file. A run that edits it would
# trigger the next run, which would edit it again.
if ! git diff --quiet HEAD -- "Roadmap ideas and debug.md"; then
  fail "the roadmap file was modified — that would re-trigger the workflow"
fi

echo "All checks passed."
