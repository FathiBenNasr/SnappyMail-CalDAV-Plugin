#!/bin/bash
# Build the installable plugin package for the version in index.php.
#
# SnappyMail installs a plugin by extracting a gzipped tar straight into its
# plugins directory, so the archive has to contain one top-level folder named
# after the plugin id - anything else lands loose beside the other plugins.
set -euo pipefail
cd "$(dirname "$0")"

ID=caldav
VERSION=$(sed -n "s/.*VERSION *= *'\([^']*\)'.*/\1/p" index.php | head -1)
[ -n "$VERSION" ] || { echo "no VERSION in index.php" >&2; exit 1; }

# Everything the plugin needs at runtime, and nothing about how it is developed.
FILES=(index.php calendar.js calendar.css contacts-popover.js fullcalendar.min.js
       sidebar.js templates LICENSE README.md AUTHORS)

OUT="dist/$ID-$VERSION.tar.gz"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "dist" "$STAGE/$ID"
cp -a "${FILES[@]}" "$STAGE/$ID/"

# Reproducible: the same source has to give the same archive, or every build
# looks like a change.
COMMITTED=$(git log -1 --format=%cI 2>/dev/null || echo '@0')
tar --sort=name --owner=0 --group=0 --numeric-owner \
    --mtime="$COMMITTED" -C "$STAGE" -cf - "$ID" | gzip -n -9 > "$OUT"

php -l index.php >/dev/null
node --check calendar.js 2>/dev/null || true
echo "$OUT"
tar -tzf "$OUT" | head -20
