# ADB Debug Guide — Capturing Native Crashes on the Guard Tablet

> Use this when the app crashes, hangs on the splash screen, or misbehaves on the physical tablet and **nothing useful shows up in Sentry**. ADB (Android Debug Bridge) gives you the raw system log from the device, including native crashes that happen before JavaScript even starts.

---

## When to use ADB

| Symptom | Why Sentry won't help | Why ADB will |
|---|---|---|
| App hangs on splash screen | `initSentry()` never runs if JS bundle didn't load | `adb logcat` shows native crash before JS |
| App closes immediately on launch | Native crash → Sentry queues report for *next* launch, which never happens | Live device log captures it immediately |
| Unknown freezes / black screen | React `ErrorBoundary` only catches render errors | `adb logcat` captures JNI, TurboModule, JSI errors |
| Supabase/network issues you can't reproduce on emulator | Emulator network ≠ tablet network | Real device logs show real TLS/DNS failures |

---

## One-time setup

### 1. Install ADB on your Windows PC

Easiest — use winget (built into Windows 11):

```bash
winget install Google.PlatformTools
```

Or manual install:
1. Download Platform Tools: https://developer.android.com/tools/releases/platform-tools
2. Extract the zip to `C:\platform-tools`
3. Add `C:\platform-tools` to your system **PATH** environment variable
4. Open a new terminal and verify:

```bash
adb --version
```

Expected output: `Android Debug Bridge version 1.0.xx ...`

### 2. Enable USB debugging on the tablet

Do this **once per tablet**:

1. On the tablet open **Settings → About tablet** (or **About phone** on some MIUI builds)
2. Tap **Build number** exactly **7 times** until a toast says *"You are now a developer"*
3. Go back to **Settings → System → Developer options** (or **Additional settings → Developer options** on MIUI)
4. Turn ON **USB debugging**
5. Connect the tablet to the PC via USB cable (use a **data** cable, not a charge-only cable)
6. On the tablet, a popup appears: *"Allow USB debugging from this computer?"* — tap **Allow** (tick "Always allow" so you don't repeat this)

### 3. Verify the PC sees the tablet

```bash
adb devices
```

Expected:
```
List of devices attached
ABC1234567    device
```

Troubleshooting:
- **Empty list** → bad cable or missing driver. On some MIUI tablets, install the Xiaomi USB driver (`https://xiaomiusbdriver.com/`) then reconnect.
- **`unauthorized`** → re-tap "Allow" on the tablet. Run `adb kill-server && adb start-server` if it stays stuck.
- **`offline`** → unplug and replug; on the tablet revoke USB debugging authorizations (Developer options → Revoke) and re-authorize.

---

## Capturing a crash

### Option A — Save to a file (recommended for sharing)

```bash
# Wipe old log buffer
adb logcat -c

# Start capture (runs until Ctrl+C)
adb logcat *:E ReactNativeJS:V ReactNative:V AndroidRuntime:V > crash.log
```

Now **launch the EntryFlow Guard APK on the tablet** and reproduce the bug. Once the crash/hang happens, wait ~15 seconds, then press **Ctrl+C** in the terminal to stop the capture.

Read the tail of the log:

```bash
tail -200 crash.log
```

### Option B — Watch live in the terminal

```bash
adb logcat -c && adb logcat *:E ReactNativeJS:V AndroidRuntime:V
```

Launch the app. Errors scroll by in real time. Copy what you see.

### Option C — Filter by the app only (cleaner, less noise)

```bash
# Find the running process ID
adb shell pidof chongtechnologies.com.entryflowguard

# Tail logs for that PID only
adb logcat --pid=<PID-from-above>
```

---

## What to look for in the log

### `FATAL EXCEPTION: main`
A native Java/Kotlin crash. The next ~20 lines are the stack trace. **This is the root cause.** Example:

```
FATAL EXCEPTION: main
Process: chongtechnologies.com.entryflowguard, PID: 12345
java.lang.UnsatisfiedLinkError: couldn't find DSO to load: libreanimated.so
  at com.swmansion.reanimated.NativeProxy.<init>(NativeProxy.java:42)
  ...
```
→ Points to a specific native module failing to load (here: `reanimated`). Usually means `newArchEnabled` mismatch or an out-of-date native binary.

### `ReactNativeJS: ...error`
A JavaScript error during boot — the React Native bridge caught it. The message + stack gives you the JS file and line.

### `TurboModule` / `Fabric` errors
New Architecture failure. Try setting `"newArchEnabled": false` in [app.json](../app.json) and rebuilding the preview APK to isolate the problem.

### No output after `Running application "main"`
Silent hang — JS bundle loaded but something is blocking the main thread (deadlock, infinite loop, stuck async init). Look at the last few lines before silence. Check the in-app `boot:splash-stuck` Sentry message for the state snapshot.

### `Sentry: ... disabled` or `DSN not set`
Sentry got disabled at runtime — verify `EXPO_PUBLIC_SENTRY_DSN` is in the EAS env for the profile you built with, and visibility is **Plain text** or **Sensitive** (not **Secret**).

---

## Useful one-liners

```bash
# All fatal-level logs only (very compact)
adb logcat *:F

# Reset the app and watch startup
adb shell am force-stop chongtechnologies.com.entryflowguard && adb logcat -c && adb logcat

# Dump the last 500 log lines without tailing live
adb logcat -d | tail -500

# Install a local APK build (without Play / EAS submit)
adb install -r path/to/entryflowguard.apk

# Uninstall cleanly (wipes all app data including SQLite)
adb uninstall chongtechnologies.com.entryflowguard

# Pull the app's SQLite file from a debug build for inspection
adb shell run-as chongtechnologies.com.entryflowguard cat databases/AccesControlDB.db > AccesControlDB.db

# See the app's current memory / CPU
adb shell dumpsys meminfo chongtechnologies.com.entryflowguard
```

> **Note:** `run-as` only works on debug/internal builds. Production builds disable this for security.

---

## Wireless ADB (no USB cable)

Handy when the tablet is mounted in the kiosk frame:

1. Plug in USB once, enable USB debugging, then:
   ```bash
   adb tcpip 5555
   ```
2. Find the tablet IP: **Settings → About → Status → IP address** (e.g. `192.168.1.42`)
3. Unplug the cable.
4. Connect over Wi-Fi:
   ```bash
   adb connect 192.168.1.42:5555
   adb devices
   ```
5. Use `adb logcat` exactly as before.

PC and tablet must be on the **same Wi-Fi network**. Re-pair after the tablet reboots (`adb tcpip 5555` again).

---

## Sharing logs with the team

When filing a bug about a device crash, include:

1. **Tablet model + Android version** — `adb shell getprop ro.product.model` and `adb shell getprop ro.build.version.release`
2. **App version** — the `version` in [app.json](../app.json) + the EAS build number
3. **Last 200 lines of `crash.log`** covering the launch and crash
4. **Reproduction steps** — exactly what you tapped / what state the app was in
5. **Screenshot** — `adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png`

---

## Related docs

- [CLAUDE.md](../CLAUDE.md) — project overview, env vars, architecture
- [config/sentry.ts](../config/sentry.ts) — Sentry initialization + PII scrubbing
- [components/AppContent.tsx](../components/AppContent.tsx) — boot watchdog that catches splash hangs and reports `boot:splash-stuck` to Sentry
