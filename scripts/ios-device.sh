#!/usr/bin/env bash
# Build a Release copy of the app with Xcode and install it on a connected iPhone.
# No EAS, no Expo Go, no Metro. Usage: npm run ios:device [-- <device name or id>]
#
# Needs APPLE_TEAM_ID in .env (see docs/development.md). Xcode must be signed in to the
# Apple account for that team (Xcode → Settings → Accounts) so it can create profiles.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # Load .env so app.config.ts sees APPLE_TEAM_ID during prebuild.
  set -a; source .env; set +a
fi
if [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "APPLE_TEAM_ID is not set. Add it to .env (developer.apple.com → Membership details)." >&2
  exit 1
fi

# Generate the native project when missing, or re-sync it with app.json / app.config.ts
# (team ID, Info.plist keys that depend on .env, plugins). Non-clean prebuild is quick.
if [ ! -d ios ]; then
  echo "› Generating ios/ (expo prebuild)…"
  CI=1 npx expo prebuild --platform ios --clean --no-install
else
  CI=1 npx expo prebuild --platform ios --no-install >/dev/null
fi
if [ ! -d ios/Pods ] || [ ios/Podfile.lock -nt ios/Pods/Manifest.lock ] 2>/dev/null; then
  echo "› Installing pods…"
  # Use Xcode's macOS SDK: some Command Line Tools ship an SDK newer than Xcode's linker.
  (cd ios && SDKROOT="$(xcrun --sdk macosx --show-sdk-path)" pod install)
fi

# Pick the device: argument, else the first connected iPhone.
WANT="${1:-}"
DEVICE_JSON="$(mktemp)"
xcrun devicectl list devices --json-output "$DEVICE_JSON" >/dev/null
read -r DEVICE_ID UDID NAME < <(python3 - "$DEVICE_JSON" "$WANT" <<'PY'
import json, sys
devices = json.load(open(sys.argv[1]))["result"]["devices"]
want = sys.argv[2].lower()
unavailable = []
for d in devices:
    hw, props = d.get("hardwareProperties", {}), d.get("deviceProperties", {})
    name = props.get("name", "")
    # Physical iPhones only: newer Xcode also lists simulators here.
    if hw.get("deviceType") != "iPhone" or hw.get("reality") == "simulated" or d.get("visibilityClass") == "simulators":
        continue
    if want and want not in (name.lower(), d["identifier"].lower(), hw.get("udid", "").lower()):
        continue
    if d.get("connectionProperties", {}).get("tunnelState") == "unavailable" or not hw.get("udid"):
        unavailable.append(name)
        continue
    print(d["identifier"], hw["udid"], name.replace(" ", "_"))
    break
else:
    if unavailable:
        print("Found but not reachable: " + ", ".join(unavailable) + ". Unlock the phone, keep it on the "
              "same Wi-Fi or plug it in, and check it appears in Xcode → Window → Devices.", file=sys.stderr)
PY
)
rm -f "$DEVICE_JSON"
if [ -z "${DEVICE_ID:-}" ]; then
  echo "No connected iPhone found. Plug it in, unlock it, and trust this Mac." >&2
  exit 1
fi
echo "› Building for ${NAME//_/ }…"

WORKSPACE="$(ls -d ios/*.xcworkspace | head -1)"
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"
# -allowProvisioningUpdates lets Xcode register the App ID and a profile that includes
# the app's capabilities (push notifications). Without it Xcode falls back to the
# wildcard team profile, which can't sign push.
# Full output goes to a log; on failure only the real errors are shown.
LOG="ios/build/ios-device.log"
mkdir -p ios/build
if ! xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination "id=$UDID" -derivedDataPath ios/build -allowProvisioningUpdates \
  build >"$LOG" 2>&1; then
  echo "✗ Build failed. Errors (full log: $LOG):" >&2
  grep -E "error:|❌" "$LOG" | grep -v "produced no further output" | sort -u | head -20 >&2
  if grep -q "this SDK is not supported by the compiler" "$LOG"; then
    echo "Hint: Xcode's Swift doesn't match prebuilt modules. Run: rm -rf ios && npm run ios:device (docs/decisions.md D-028)." >&2
  elif grep -qE "Provisioning Profile|Signing for|requires a development team" "$LOG"; then
    echo "Hint: signing. Check APPLE_TEAM_ID in .env and that Xcode → Settings → Accounts is signed in." >&2
  fi
  exit 1
fi

APP="ios/build/Build/Products/Release-iphoneos/$SCHEME.app"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
echo "› Installing on ${NAME//_/ }…"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP" >/dev/null
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" >/dev/null || \
  echo "Installed. If it doesn't open, trust the developer in Settings → General → VPN & Device Management."
echo "✓ Done."
