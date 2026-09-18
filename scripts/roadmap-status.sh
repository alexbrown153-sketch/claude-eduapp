#!/usr/bin/env bash
# Is there anything in the roadmap file that hasn't been built yet?
#
# The answer doesn't need a state file: js/changelog.js already carries
# ROADMAP_LAST_ITEM_NUMBER, the highest item that has been processed, and the
# roadmap file carries the highest item that exists. Anything above the
# watermark is new work.
#
# Prints a human-readable summary and exits. The scheduled Routine that
# processes the roadmap runs this first and stops when there is nothing new,
# which is most days. It also writes has_new / first_new / highest to
# $GITHUB_OUTPUT when that is set, so it drops straight into a GitHub Actions
# step if this ever moves to CI.
set -euo pipefail

cd "$(dirname "$0")/.."

ROADMAP="Roadmap ideas and debug.md"
CHANGELOG="js/changelog.js"

[ -f "$ROADMAP" ] || { echo "Missing $ROADMAP" >&2; exit 1; }
[ -f "$CHANGELOG" ] || { echo "Missing $CHANGELOG" >&2; exit 1; }

# Highest "N." that starts a line — the same rule the relay Worker uses to
# number a new suggestion, so the two can't disagree about what item N is.
highest=$(grep -oE '^[0-9]+\.' "$ROADMAP" | tr -d '.' | sort -n | tail -1)

processed=$(grep -oE 'ROADMAP_LAST_ITEM_NUMBER = [0-9]+' "$CHANGELOG" | grep -oE '[0-9]+$')

if [ -z "$highest" ] || [ -z "$processed" ]; then
  echo "Could not read the item numbers (highest='$highest', processed='$processed')" >&2
  exit 1
fi

if [ "$highest" -gt "$processed" ]; then
  has_new=true
  first_new=$((processed + 1))
  echo "Unprocessed: items $first_new–$highest (watermark is $processed)."
else
  has_new=false
  first_new=""
  echo "Nothing new: the file stops at $highest and $processed is already processed."
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "has_new=$has_new"
    echo "first_new=$first_new"
    echo "highest=$highest"
    echo "processed=$processed"
  } >> "$GITHUB_OUTPUT"
fi
