#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-$HOME/.local/opt/jdk17}"
ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/opt/android-sdk}"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 17 not found at $JAVA_HOME. Set JAVA_HOME." >&2
  exit 1
fi
if [ ! -x "$ANDROID_HOME/platform-tools/adb" ]; then
  echo "Android SDK not found at $ANDROID_HOME. Set ANDROID_HOME." >&2
  exit 1
fi

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/apps/android/local.properties"
cd "$ROOT/apps/android"

if [ -f keystore.properties ]; then
  JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew assembleRelease --no-daemon
  mkdir -p "$ROOT/dist"
  cp app/build/outputs/apk/release/app-release.apk "$ROOT/dist/DineSense.apk"
  echo "Wrote $ROOT/dist/DineSense.apk"
else
  JAVA_HOME="$JAVA_HOME" ANDROID_HOME="$ANDROID_HOME" ./gradlew assembleDebug --no-daemon
  mkdir -p "$ROOT/dist"
  cp app/build/outputs/apk/debug/app-debug.apk "$ROOT/dist/DineSense-debug.apk"
  echo "No keystore.properties; wrote $ROOT/dist/DineSense-debug.apk"
fi
