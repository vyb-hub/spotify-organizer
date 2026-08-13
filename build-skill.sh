#!/usr/bin/env bash
# Regenerates the portable Claude Skill package (claude-skill/organize-spotify/scripts/)
# from the canonical CLI source (cli.js, src/) at the repo root. Run this after changing
# cli.js or anything in src/, so the two variants don't drift apart.
set -euo pipefail
cd "$(dirname "$0")"

DEST="claude-skill/organize-spotify/scripts"
rm -rf "$DEST"
mkdir -p "$DEST"

cp cli.js "$DEST/"
cp -r src "$DEST/"
cp package.json "$DEST/"
cp .env.example "$DEST/"

echo "Synced cli.js, src/, package.json, .env.example → $DEST"
