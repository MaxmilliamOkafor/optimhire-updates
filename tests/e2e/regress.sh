#!/usr/bin/env bash
# End-to-end suites for the extension, in headless Chromium (Playwright, preinstalled in
# Claude Code cloud sessions). Each suite loads a fresh copy of the deployment folder and
# drives it against local stand-ins for the sites (mapped with --host-resolver-rules).
#   tests/e2e/regress.sh              all suites
#   tests/e2e/regress.sh phone audit  some of them
# Work files (extension copies, browser profiles, outputs) go to $WORK (default /tmp/oh-e2e).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
EXT_SRC=$(ls -d "$REPO"/*"DEPLOYMENT READY"* | head -1)
WORK=${WORK:-${TMPDIR:-/tmp}/oh-e2e}
mkdir -p "$WORK"
cp -r "$HERE"/run_*.js "$HERE"/site "$WORK"/
[ -f "$WORK/oh_key.pem" ] || openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=localhost" \
  -keyout "$WORK/oh_key.pem" -out "$WORK/oh_cert.pem" >/dev/null 2>&1
ALL=$(cd "$HERE" && ls run_*.js | sed 's/^run_//; s/\.js$//' | tr '\n' ' ')
for s in ${@:-$ALL}; do
  rm -rf "$WORK/ext_$s" "$WORK/profile_$s"
  cp -r "$EXT_SRC" "$WORK/ext_$s"; rm -rf "$WORK/ext_$s/_metadata"
  node "$WORK/run_$s.js" "$WORK/ext_$s" > "$WORK/out_$s.txt" 2>&1
  p=$(grep -c '^PASS' "$WORK/out_$s.txt"); f=$(grep -c '^FAIL' "$WORK/out_$s.txt")
  if grep -q 'ALL PASS' "$WORK/out_$s.txt"; then r='ALL PASS'; else r="$f FAILED"; [ "$f" = 0 ] && r='CRASHED (see out file)'; fi
  echo "=== $s: $p pass, $f fail | $r"
done
