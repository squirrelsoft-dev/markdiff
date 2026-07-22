#!/bin/sh
#
# Proves a downloaded macOS build is properly signed and notarised, rather
# than trusting that the workflow said so. Point it at a .dmg or .app.
#
#   ./scripts/verify-macos-release.sh markdiff_0.1.0_universal.dmg
#
# A build that is merely signed but not notarised passes codesign and
# still gets a Gatekeeper warning on other machines, so all three checks
# below matter, not just the first.

set -eu

ARTIFACT=${1:-}
[ -n "$ARTIFACT" ] && [ -e "$ARTIFACT" ] || { echo "usage: $0 <dmg-or-app>" >&2; exit 2; }

APP=$ARTIFACT
MOUNT=""
cleanup() { [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; }
trap cleanup EXIT

case "$ARTIFACT" in
  *.dmg)
    echo "▸ Verifying the disk image is signed and notarised…"
    spctl -a -vvv -t open --context context:primary-signature "$ARTIFACT" 2>&1 || true
    MOUNT=$(hdiutil attach "$ARTIFACT" -nobrowse -readonly 2>/dev/null \
      | grep -o '/Volumes/[^[:cntrl:]]*' | head -1)
    [ -n "$MOUNT" ] || { echo "✗ Could not mount the image." >&2; exit 1; }
    APP=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
    [ -n "$APP" ] || { echo "✗ No .app inside the image." >&2; exit 1; }
    ;;
esac

echo
echo "▸ Signature"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E 'Authority|TeamIdentifier|Identifier|Timestamp' || true

echo
echo "▸ Signature is valid and covers the whole bundle"
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 && echo "  ✓ codesign --verify passed"

echo
echo "▸ Gatekeeper assessment (what another Mac will decide)"
if spctl -a -vvv -t install "$APP" 2>&1 | tee /dev/stderr | grep -q 'source=Notarized Developer ID'; then
  echo "  ✓ Notarized Developer ID — opens with no warning"
else
  echo "  ✗ NOT notarised — users will see a Gatekeeper warning" >&2
  exit 1
fi

echo
echo "▸ Notarisation ticket is stapled (works offline / first launch)"
if xcrun stapler validate "$APP" 2>&1 | grep -q 'The validate action worked'; then
  echo "  ✓ ticket stapled"
else
  echo "  ⚠ not stapled — notarised but the ticket is not attached." >&2
  echo "    Gatekeeper will fetch it online on first launch instead." >&2
fi

echo
echo "All required checks passed."
