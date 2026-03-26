#!/bin/bash
# Download latest Kaggle NBA stats and re-import into Supabase.
# Usage: ./scripts/update-kaggle-stats.sh
#
# Requires: KAGGLE_API_TOKEN env var (or ~/.kaggle/kaggle.json)
# Get token: https://www.kaggle.com/settings → API → Create New Token

set -euo pipefail
cd "$(dirname "$0")/.."

KAGGLE_DIR="data/kaggle"
BACKUP_DIR="data/kaggle-prev"
TMP_DIR="data/kaggle-new"

# Preflight
if [ -z "${KAGGLE_API_TOKEN:-}" ] && [ ! -f ~/.kaggle/kaggle.json ]; then
  echo "Error: Set KAGGLE_API_TOKEN or place credentials at ~/.kaggle/kaggle.json"
  echo "Get token: https://www.kaggle.com/settings → API"
  exit 1
fi

command -v kaggle >/dev/null || { echo "Error: kaggle CLI not installed (brew install kaggle)"; exit 1; }

# Download
echo "Downloading latest dataset..."
rm -rf "$TMP_DIR"
kaggle datasets download sumitrodatta/nba-aba-baa-stats -p "$TMP_DIR" --unzip

# Compare row counts
OLD_COUNT=$(grep -c "^2026," "$KAGGLE_DIR/Player Per Game.csv" 2>/dev/null || echo "0")
NEW_COUNT=$(grep -c "^2026," "$TMP_DIR/Player Per Game.csv" 2>/dev/null || echo "0")
echo "2025-26 rows: $OLD_COUNT (old) → $NEW_COUNT (new)"

if [ "$NEW_COUNT" -le "$OLD_COUNT" ]; then
  echo "No new data. Cleaning up."
  rm -rf "$TMP_DIR"
  exit 0
fi

# Swap
echo "Swapping data..."
rm -rf "$BACKUP_DIR"
mv "$KAGGLE_DIR" "$BACKUP_DIR"
mv "$TMP_DIR" "$KAGGLE_DIR"

# Import
echo "Importing player stats..."
npx tsx scripts/import-player-stats.ts

echo ""
echo "Done. Previous data backed up to $BACKUP_DIR"
echo "To import accolades (wipe table first!): npx tsx scripts/import-accolades.ts"
echo "To import team seasons: npx tsx scripts/import-team-seasons.ts"
