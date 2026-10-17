#!/bin/bash
# Builds the release binary and assembles apps/macos/build/Husrevity.app, ad-hoc signed.
#
#   scripts/make-app.sh
#
# Environment overrides:
#   CONFIG        build configuration (default: release)
#   SCRATCH_PATH  SwiftPM scratch directory (default: <package>/.build)
#   VERSION       CFBundleShortVersionString (default: from Support/Info.plist)
#   BUILD_NUMBER  CFBundleVersion (default: from Support/Info.plist)
#
# The app is only assembled; it is not installed or launched, and nothing outside apps/macos is
# touched.
set -euo pipefail

PACKAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${CONFIG:-release}"
SCRATCH="${SCRATCH_PATH:-$PACKAGE/.build}"
APP="$PACKAGE/build/Husrevity.app"
EXECUTABLE="HusrevityApp"
PLIST_BUDDY=/usr/libexec/PlistBuddy

echo "==> swift build -c $CONFIG"
swift build -c "$CONFIG" --package-path "$PACKAGE" --scratch-path "$SCRATCH"
BIN_DIR="$(swift build -c "$CONFIG" --package-path "$PACKAGE" --scratch-path "$SCRATCH" --show-bin-path)"

if [[ ! -x "$BIN_DIR/$EXECUTABLE" ]]; then
  echo "error: $BIN_DIR/$EXECUTABLE was not produced" >&2
  exit 1
fi

echo "==> assembling $APP"
# Only ever remove the previous output of this script.
if [[ -e "$APP" ]]; then
  case "$APP" in
    */apps/macos/build/Husrevity.app) rm -rf "$APP" ;;
    *) echo "error: refusing to remove unexpected path $APP" >&2; exit 1 ;;
  esac
fi
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cp "$BIN_DIR/$EXECUTABLE" "$APP/Contents/MacOS/$EXECUTABLE"
cp "$PACKAGE/Support/Info.plist" "$APP/Contents/Info.plist"
if [[ -n "${VERSION:-}" ]]; then
  "$PLIST_BUDDY" -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
fi
if [[ -n "${BUILD_NUMBER:-}" ]]; then
  "$PLIST_BUDDY" -c "Set :CFBundleVersion $BUILD_NUMBER" "$APP/Contents/Info.plist"
fi

# SwiftPM puts every target's resources in a "<Package>_<Target>.bundle" next to the binary. They
# go into Contents/Resources, the only place a signed app bundle may hold extra files. (The test
# support bundle carries API fixtures and is never shipped.)
shopt -s nullglob
copied=0
for bundle in "$BIN_DIR"/*.bundle; do
  name="$(basename "$bundle")"
  case "$name" in
    *_HusrevityTestSupport.bundle) continue ;;
  esac
  cp -R "$bundle" "$APP/Contents/Resources/$name"
  echo "    resource bundle: $name"
  copied=$((copied + 1))
done
shopt -u nullglob
if [[ ! -d "$APP/Contents/Resources/Husrevity_HusrevityJS.bundle" ]]; then
  echo "error: Husrevity_HusrevityJS.bundle is missing from $BIN_DIR" >&2
  exit 1
fi

echo "==> codesign (ad hoc)"
codesign --force --deep -s - \
  --identifier com.husrevity.mac \
  --entitlements "$PACKAGE/Support/Husrevity.entitlements" \
  "$APP"

echo "==> done: $APP ($copied resource bundles)"
