#!/usr/bin/env bash
#
# Insert the readlog beacon into an already-built static site.
#
# This exists because Taliesin has no site-wide script injection point: its
# config schema is closed and the raw-injection keys were deliberately retired.
# So the tag is added to the built artifact, after the build and before the
# deploy. Local previews and offline copies therefore stay clean, because the
# tag only ever exists in what gets published.
#
# Source of truth: readlog/tools/inject-beacon.sh. Consumers vendor a copy.
#
# usage:
#   inject-beacon.sh <build-dir> --site <id> --endpoint <url> --beacon <path to b.js>
#
# Requires GNU sed (for \n in the replacement).

set -euo pipefail

BUILD_DIR="${1:-}"
shift || true
SITE=""
ENDPOINT=""
BEACON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --site)     SITE="${2:-}";     shift 2 ;;
    --endpoint) ENDPOINT="${2:-}"; shift 2 ;;
    --beacon)   BEACON="${2:-}";   shift 2 ;;
    *) echo "inject-beacon: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "inject-beacon: $*" >&2; exit 1; }

[ -n "$BUILD_DIR" ] || die "usage: inject-beacon.sh <build-dir> --site <id> --endpoint <url> --beacon <path>"
[ -d "$BUILD_DIR" ] || die "build directory '$BUILD_DIR' does not exist"
[ -n "$SITE" ]      || die "--site is required"
[ -n "$ENDPOINT" ]  || die "--endpoint is required"
[ -n "$BEACON" ]    || die "--beacon is required"
[ -f "$BEACON" ]    || die "beacon file '$BEACON' does not exist"

cp "$BEACON" "$BUILD_DIR/b.js"

TAG="<script defer src=\"/b.js\" data-site=\"$SITE\" data-endpoint=\"$ENDPOINT\"></script>"
# & and | are special in the sed replacement; the delimiter is | below.
ESCAPED="$(printf '%s' "$TAG" | sed -e 's/[&|\\]/\\&/g')"

mapfile -t FILES < <(find "$BUILD_DIR" -type f -name '*.html' | sort)
total="${#FILES[@]}"
[ "$total" -gt 0 ] || die "no HTML files found under '$BUILD_DIR'"

injected=0
skipped=0
for f in "${FILES[@]}"; do
  if grep -q 'src="/b.js"' "$f"; then
    skipped=$((skipped + 1))
    continue
  fi
  grep -q '</body>' "$f" || die "'$f' has no </body>, so the tag has nowhere to go"
  sed -i "s|</body>|${ESCAPED}\n</body>|" "$f"
  injected=$((injected + 1))
done

# Verify rather than assume. A publish that silently injected into some files
# and not others would produce a plausible-looking dashboard that is simply
# wrong, and nobody would notice for months.
carrying="$(grep -rl 'src="/b.js"' "$BUILD_DIR" --include='*.html' | wc -l | tr -d ' ')"
if [ "$carrying" -ne "$total" ]; then
  die "verification failed: $carrying of $total HTML files carry the beacon"
fi

echo "inject-beacon: $carrying/$total HTML files carry the beacon (injected $injected, already present $skipped)"
echo "inject-beacon: site=$SITE endpoint=$ENDPOINT"
