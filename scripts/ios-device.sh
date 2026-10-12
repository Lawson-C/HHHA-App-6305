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

# Generate the native project when it's missing or was generated without the team.
if [ ! -d ios ] || ! grep -q "DEVELOPMENT_TEAM = $APPLE_TEAM_ID" ios/*.xcodeproj/project.pbxproj 2>/dev/null; then
  echo "› Generating ios/ (expo prebuild)…"
  CI=1 npx expo prebuild --platform ios --clean --no-install
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
for d in devices:
    hw, props = d.get("hardwareProperties", {}), d.get("deviceProperties", {})
    name = props.get("name", "")
    if hw.get("deviceType") != "iPhone":
        continue
    if want and want not in (name.lower(), d["identifier"].lower(), hw.get("udid", "").lower()):
        continue
    if d.get("connectionProperties", {}).get("tunnelState") == "unavailable":
        continue
    print(d["identifier"], hw.get("udid", ""), name.replace(" ", "_"))
    break
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
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination "id=$UDID" -derivedDataPath ios/build -allowProvisioningUpdates \
  -quiet build

APP="ios/build/Build/Products/Release-iphoneos/$SCHEME.app"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
echo "› Installing on ${NAME//_/ }…"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP" >/dev/null
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" >/dev/null || \
  echo "Installed. If it doesn't open, trust the developer in Settings → General → VPN & Device Management."
echo "✓ Done."
