#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="/Users/thomasdaval/Desktop/cslol-manager/dist/web"
DST_DIR="/Users/thomasdaval/Desktop/riftskin-web"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Source folder not found: $SRC_DIR" >&2
  exit 1
fi

rsync -a --delete --exclude ".vercel" --exclude ".git" "$SRC_DIR"/ "$DST_DIR"/

cd "$DST_DIR"
git add .
if git diff --cached --quiet; then
  echo "No changes to deploy."
  exit 0
fi

git commit -m "Sync web from cslol-manager"
git push
echo "Pushed to GitHub. Vercel auto-deploy is running."
