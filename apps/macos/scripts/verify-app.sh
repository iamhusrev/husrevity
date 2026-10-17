#!/bin/bash
# Checks the bundle that scripts/make-app.sh produced. Read-only apart from a throw-away probe
# compiled into a private temp directory.
#
#   scripts/verify-app.sh            # exit 1 on a failed check
#   STRICT_RESOURCES=1 scripts/verify-app.sh   # a resource warning also fails
set -uo pipefail

PACKAGE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:-$PACKAGE/build/Husrevity.app}"
EXECUTABLE="HusrevityApp"
JS_BUNDLE="Husrevity_HusrevityJS.bundle"
PLIST="$APP/Contents/Info.plist"
PLIST_BUDDY=/usr/libexec/PlistBuddy

failures=0
warnings=0
ok()   { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }
warn() { echo "  WARN  $*"; warnings=$((warnings + 1)); }

plist_value() { "$PLIST_BUDDY" -c "Print :$1" "$PLIST" 2>/dev/null; }

echo "==> verifying $APP"

echo "-- layout"
if [[ -d "$APP" ]]; then ok "bundle exists"; else fail "bundle missing (run scripts/make-app.sh)"; exit 1; fi
if [[ -x "$APP/Contents/MacOS/$EXECUTABLE" ]]; then ok "Contents/MacOS/$EXECUTABLE is executable"; else fail "executable missing"; fi
if [[ -f "$PLIST" ]]; then ok "Contents/Info.plist present"; else fail "Info.plist missing"; fi
root_entries="$(ls -A "$APP")"
if [[ "$root_entries" == "Contents" ]]; then ok "bundle root holds only Contents (nothing unsealed)"; else fail "unexpected entries in bundle root: $root_entries"; fi
if [[ -d "$APP/Contents/Resources/$JS_BUNDLE" ]]; then ok "Contents/Resources/$JS_BUNDLE present"; else fail "$JS_BUNDLE missing from Contents/Resources"; fi
js_file="$(find "$APP/Contents/Resources/$JS_BUNDLE" -name husrevity-core.js -type f 2>/dev/null | head -1)"
if [[ -n "$js_file" && -s "$js_file" ]]; then ok "husrevity-core.js present ($(wc -c < "$js_file" | tr -d ' ') bytes)"; else fail "husrevity-core.js missing or empty"; fi
if ls "$APP/Contents/Resources" | grep -q "TestSupport"; then fail "test fixtures bundle must not be shipped"; else ok "no test fixtures shipped"; fi

echo "-- Info.plist"
if plutil -lint "$PLIST" >/dev/null 2>&1; then ok "plutil -lint"; else fail "plutil -lint failed"; fi
expect() { # key expected
  local actual; actual="$(plist_value "$1")"
  if [[ "$actual" == "$2" ]]; then ok "$1 = $2"; else fail "$1 is '$actual', expected '$2'"; fi
}
expect CFBundleIdentifier com.husrevity.mac
expect CFBundleExecutable "$EXECUTABLE"
expect CFBundleName Husrevity
expect CFBundlePackageType APPL
expect LSMinimumSystemVersion 14.0
expect LSApplicationCategoryType public.app-category.productivity
if [[ -z "$(plist_value NSUserNotificationsUsageDescription)" ]]; then ok "no NSUserNotificationsUsageDescription (not needed)"; else fail "NSUserNotificationsUsageDescription should not be set"; fi

echo "-- signature"
if out="$(codesign --verify --deep --strict --verbose=2 "$APP" 2>&1)"; then ok "codesign --verify --deep --strict"; else fail "codesign verify: $out"; fi
if codesign -dv "$APP" 2>&1 | grep -q "Signature=adhoc"; then ok "ad-hoc signature"; else warn "not an ad-hoc signature"; fi

echo "-- resource lookup (what Bundle.module / CoreJS will do at runtime)"
# 1. The way CoreJS asks a bundle for the script, run against the bundle as shipped.
tmp="$(mktemp -d)"
cat > "$tmp/probe.swift" <<'SWIFT'
import Foundation
let path = CommandLine.arguments[1]
guard let bundle = Bundle(path: path) else { print("no bundle at \(path)"); exit(2) }
let url = bundle.url(forResource: "husrevity-core", withExtension: "js", subdirectory: "Resources")
    ?? bundle.url(forResource: "husrevity-core", withExtension: "js")
guard let url, let text = try? String(contentsOf: url, encoding: .utf8), text.contains("HusrevityCore") else {
    print("script not readable from \(path)"); exit(3)
}
print("read \(text.utf8.count) bytes from \(url.path)")
SWIFT
if swiftc -O -o "$tmp/probe" "$tmp/probe.swift" 2>/dev/null; then
  if msg="$("$tmp/probe" "$APP/Contents/Resources/$JS_BUNDLE" 2>&1)"; then ok "Bundle(path:) finds the script in Contents/Resources: $msg"; else fail "probe: $msg"; fi
else
  warn "could not compile the probe (swiftc unavailable?)"
fi
case "$tmp" in /var/folders/*|/tmp/*|/private/var/folders/*|/private/tmp/*) rm -rf "$tmp" ;; esac

# 2. SwiftPM's generated Bundle.module accessor only looks at <app root>/<name>.bundle and then at
#    an absolute path inside the build directory. A signed app cannot hold files in its root, so
#    the accessor on its own would only ever succeed through that build-directory fallback.
fallback="$(strings -a "$APP/Contents/MacOS/$EXECUTABLE" | grep "/$JS_BUNDLE\$" | grep '^/' | head -1)"
if [[ -e "$APP/$JS_BUNDLE" ]]; then
  fail "$JS_BUNDLE sits in the bundle root; that breaks the signature"
else
  ok "app root has no $JS_BUNDLE (Bundle.module's first candidate is absent by design)"
fi
# Source lines with comments stripped: whole-line comments (// and ///) are ignored, so a mention in
# documentation cannot satisfy a check.
code_lines() { grep -hv '^[[:space:]]*//' "$@" 2>/dev/null; }
code_lines_n() { grep -n -v '^[[:space:]]*//' "$1" 2>/dev/null; }
locator="$PACKAGE/Sources/HusrevityJS/CoreJSResourceLocator.swift"
core_js="$PACKAGE/Sources/HusrevityJS/CoreJS.swift"
if code_lines "$locator" | grep -q 'Bundle\.main\.resourceURL'; then
  ok "locator code searches Bundle.main.resourceURL (Contents/Resources)"
else
  fail "CoreJSResourceLocator does not use Bundle.main.resourceURL in code"
fi
if code_lines "$core_js" | grep -q 'CoreJSResourceLocator\.locate'; then
  ok "CoreJS() loads the script through CoreJSResourceLocator"
else
  fail "CoreJS() does not call CoreJSResourceLocator.locate"
fi
# Bundle.module may only be a last resort: never in the locator, and in CoreJS.swift only after the
# locator call (it traps when its bundle is missing, so it must not run first).
locate_line="$(code_lines_n "$core_js" | grep 'CoreJSResourceLocator\.locate' | head -1 | cut -d: -f1)"
module_line="$(code_lines_n "$core_js" | grep 'Bundle\.module' | head -1 | cut -d: -f1)"
if code_lines "$locator" | grep -q 'Bundle\.module'; then
  fail "the locator uses Bundle.module"
elif [[ -z "$module_line" ]]; then
  ok "no Bundle.module use in the script lookup"
elif [[ -n "$locate_line" && "$module_line" -gt "$locate_line" ]]; then
  ok "Bundle.module is only a last resort after the locator (CoreJS.swift:$module_line, locator call at :$locate_line)"
else
  fail "Bundle.module is reached before the locator in CoreJS.swift"
fi
# The locator's relative path, taken from its source, must exist under Contents/Resources.
rel="$(grep -E 'static let bundleName' "$locator" | sed -E 's/.*"([^"]+)".*/\1/')"
if [[ -n "$rel" && -f "$APP/Contents/Resources/$rel/Resources/husrevity-core.js" ]]; then
  ok "locator path <Contents/Resources>/$rel/Resources/husrevity-core.js exists in the app"
else
  fail "locator path ($rel) does not match the shipped layout"
fi
# Runtime proof, headless: a relocated copy of the app must find its JS inside its own bundle.
tmp_app_dir="$(mktemp -d)"
cp -R "$APP" "$tmp_app_dir/"
relocated="$tmp_app_dir/$(basename "$APP")/Contents/MacOS/$(ls "$APP/Contents/MacOS" | head -1)"
if check_json="$("$relocated" --check-resources 2>&1)" && echo "$check_json" | grep -q '"ok":true' \
   && echo "$check_json" | grep -q '"viaAppBundle":true'; then
  ok "relocated app loads its JS from its own Contents/Resources ($check_json)"
else
  fail "relocated app cannot load its JS from its own bundle: $check_json"
fi
rm -rf "$tmp_app_dir"

echo
echo "==> $failures failure(s), $warnings warning(s)"
if [[ $failures -gt 0 ]]; then exit 1; fi
if [[ $warnings -gt 0 && "${STRICT_RESOURCES:-0}" == "1" ]]; then exit 1; fi
exit 0
