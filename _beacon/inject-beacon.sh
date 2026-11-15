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
#                    [--ask <path to a.js> --reader <path to r.js> [--ask-paths <glob>]]
#
# --ask adds the reading ask to post pages: a.js and r.js are copied to the
# build root, and the a.js tag goes into every page whose path under the
# build directory matches --ask-paths (a shell pattern, default
# "posts/*/index.html"). The reader posts to the same collector as the
# beacon, so the tag's endpoint is --endpoint with its trailing /e swapped
# for /r. With --ask, --beacon may be left out.
#
# Requires GNU sed (for \n in the replacement).

set -euo pipefail

BUILD_DIR="${1:-}"
shift || true
SITE=""
ENDPOINT=""
BEACON=""
ASK=""
READER=""
ASK_PATHS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --site)      SITE="${2:-}";      shift 2 ;;
    --endpoint)  ENDPOINT="${2:-}";  shift 2 ;;
    --beacon)    BEACON="${2:-}";    shift 2 ;;
    --ask)       ASK="${2:-}";       shift 2 ;;
    --reader)    READER="${2:-}";    shift 2 ;;
    --ask-paths) ASK_PATHS="${2:-}"; shift 2 ;;
    *) echo "inject-beacon: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "inject-beacon: $*" >&2; exit 1; }

[ -n "$BUILD_DIR" ] || die "usage: inject-beacon.sh <build-dir> --site <id> --endpoint <url> --beacon <path> [--ask <path> --reader <path> [--ask-paths <glob>]]"
[ -d "$BUILD_DIR" ] || die "build directory '$BUILD_DIR' does not exist"
[ -n "$SITE" ]      || die "--site is required"
[ -n "$ENDPOINT" ]  || die "--endpoint is required"
[ -z "$BEACON" ] || [ -f "$BEACON" ] || die "beacon file '$BEACON' does not exist"

if [ -n "$ASK" ]; then
  [ -f "$ASK" ]    || die "ask file '$ASK' does not exist"
  [ -n "$READER" ] || die "--reader is required with --ask"
  [ -f "$READER" ] || die "reader file '$READER' does not exist"
  case "$ENDPOINT" in
    */e) ;;
    *) die "--endpoint must end in /e when --ask is given (the reader posts to the same collector's /r), got '$ENDPOINT'" ;;
  esac
  READ_ENDPOINT="${ENDPOINT%/e}/r"
  ASK_PATHS="${ASK_PATHS:-posts/*/index.html}"

  # every page the ask is meant for must be able to take it before any is touched
  mapfile -t ASK_FILES < <(
    find "$BUILD_DIR" -type f -name '*.html' | sort | while IFS= read -r f; do
      rel="${f#"${BUILD_DIR%/}"/}"
      # shellcheck disable=SC2053 # the pattern is meant to match
      if [[ "$rel" == $ASK_PATHS ]]; then printf '%s\n' "$f"; fi
    done
  )
  ask_total="${#ASK_FILES[@]}"
  [ "$ask_total" -gt 0 ] || die "no page under '$BUILD_DIR' matches --ask-paths '$ASK_PATHS'"
  for f in "${ASK_FILES[@]}"; do
    grep -q '</body>' "$f" || die "'$f' has no </body>, so the ask has nowhere to go"
  done

  cp "$ASK" "$BUILD_DIR/a.js"
  cp "$READER" "$BUILD_DIR/r.js"

  ASK_TAG="<script defer src=\"/a.js\" data-site=\"$SITE\" data-endpoint=\"$READ_ENDPOINT\" data-reader=\"/r.js\"></script>"
  ASK_ESCAPED="$(printf '%s' "$ASK_TAG" | sed -e 's/[&|\\]/\\&/g')"

  ask_injected=0
  ask_skipped=0
  for f in "${ASK_FILES[@]}"; do
    if grep -q 'src="/a.js"' "$f"; then
      ask_skipped=$((ask_skipped + 1))
      continue
    fi
    sed -i "s|</body>|${ASK_ESCAPED}\n</body>|" "$f"
    ask_injected=$((ask_injected + 1))
  done

  # the ask must be on every matching page and on no other
  ask_carrying="$(grep -rl 'src="/a.js"' "$BUILD_DIR" --include='*.html' | wc -l | tr -d ' ')"
  if [ "$ask_carrying" -ne "$ask_total" ]; then
    die "verification failed: $ask_carrying HTML files carry the ask, but $ask_total match --ask-paths '$ASK_PATHS'"
  fi

  echo "inject-beacon: $ask_carrying/$ask_total pages matching '$ASK_PATHS' carry the ask (injected $ask_injected, already present $ask_skipped)"
  echo "inject-beacon: ask endpoint=$READ_ENDPOINT"

  [ -n "$BEACON" ] || exit 0
elif [ -n "$READER" ] || [ -n "$ASK_PATHS" ]; then
  die "--reader and --ask-paths need --ask"
fi

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
