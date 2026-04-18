# EAS (Expo Application Services) Guide

## Overview
EAS is Expo's cloud services for building, updating, and managing your app.

---

## Account Info
- **Owner**: `@chongtech`
- **Project ID**: `97153317-40af-4bc5-be4b-2a9f02f999fd`
- **Dashboard**: https://expo.dev

---

## Essential CLI Commands

### Authentication
```bash
# Check current logged in account
npx eas-cli whoami

# Login to Expo account
npx eas-cli login

# Logout
npx eas-cli logout
```

### Project Management
```bash
# Initialize EAS in a project (one-time) if not exists
npx eas-cli init

# View project info
npx eas-cli project:info
```

### Building APK/IPA
```bash
# Build Android APK (development)
npx eas-cli build --platform android --profile development 
(we need )
npx expo start --dev-client --tunnel

# Build Android APK (preview)--direct from expo
npx eas-cli build --platform android --profile preview


# Build Android APK (production)
npx eas-cli build --platform android --profile production

# Build iOS IPA
npx eas-cli build --platform ios --profile production

# Check build status
npx eas-cli build:list
```

### Over-the-Air Updates
```bash
# Publish an update (no new build needed)
npx eas-cli update --branch production --message "Bug fix"

# List updates
npx eas-cli update:list
```

### Push Notifications
> **Note:** There are two separate Firebase credentials — both are required:
> - `google-services.json` → needed for the **Gradle build** (see "Firebase Android Setup" section below)
> - FCM service account key → needed for **push delivery** at runtime (configured here)

```bash
# Upload FCM V1 service account key (required for Android push delivery)
eas credentials --platform android
# → Select "Google Service Account"
# → Provide path to Firebase service account JSON
# (Download from Firebase Console → Project Settings → Service Accounts → Generate new private key)

# Send test push notification
npx eas-cli push:send --message "Test notification" --to <EXPO_PUSH_TOKEN>
```

---

## Firebase Android Setup (google-services.json)

The `google-services.json` file is required for the **Gradle build** — the Google Services plugin
validates that the app's package name matches an entry in this file. Without it (or with a
mismatched package name), the build fails at the `run-gradlew` step.

### One-time setup / whenever the package name changes

1. Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Android apps
2. Add an Android app with the correct package name (e.g. `chongtechnologies.com.entryflow.resident`)
3. Download `google-services.json`
4. Upload it to EAS as a file secret:
   ```bash
   eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
   ```
5. Trigger a new build — EAS places the file at the path declared in `app.json` (`"googleServicesFile": "./google-services.json"`)

### Updating the secret (e.g. package name changed)

```bash
eas secret:delete --name GOOGLE_SERVICES_JSON
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```

---

## Package Name Change Checklist

Whenever `android.package` in `app.json` is changed, update all of the following:

- [ ] `app.json` → `android.package`
- [ ] Firebase Console → register new package name, download new `google-services.json`
- [ ] EAS → delete old `GOOGLE_SERVICES_JSON` secret and upload new one (see above)
- [ ] Google Play Console → package name is **immutable** after first publish; must match from the start

---

## Configuration Files

### eas.json (Build profiles)
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

### app.json (Project config)
Key EAS-related fields:
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    },
    "owner": "your-username"
  }
}
```

---

## Push Notification Flow

1. **EAS Project ID** → Enables push tokens in Expo Go
2. **FCM V1 credentials** → Upload Firebase service account JSON to EAS (one-time setup, required)
3. **Login on device** → App gets Expo Push Token, saved to `resident_devices` table
4. **App startup** → Token refreshed automatically (stale token prevention)
5. **Guard registers visit** → Supabase webhook triggers Edge Function
6. **Edge Function** → Sends push via Expo API → FCM → Device

---

## Useful Links

- [EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [EAS Update Docs](https://docs.expo.dev/eas-update/introduction/)
- [Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Expo Dashboard](https://expo.dev)
