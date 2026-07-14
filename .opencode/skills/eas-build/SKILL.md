---
name: eas-build
description: EAS Build, submission, and OTA updates for LikhArtisan mobile app
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: eas
---

## What I do
- Guide EAS Build configuration for iOS and Android
- Handle app store submission (App Store Connect, Google Play)
- Manage OTA updates with EAS Update
- Configure build profiles and environment variables

## When to use me
Use this when building, submitting, or updating the mobile app.

## Prerequisites
- Expo account (expo.dev)
- Apple Developer account (iOS)
- Google Play Developer account (Android)

## eas.json configuration
```json
{
  "cli": { "version": ">= 15.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "@supabase-url",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
        "EXPO_PUBLIC_API_URL": "@api-url"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "@supabase-url-prod",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key-prod",
        "EXPO_PUBLIC_API_URL": "@api-url-prod"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id",
        "ascAppId": "your-app-store-connect-app-id",
        "appleTeamId": "your-team-id"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

## Build commands
```bash
# Development build (for testing on device)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (internal testing)
eas build --profile preview --platform all

# Production build (app store)
eas build --profile production --platform all

# Check build status
eas build:list
```

## Environment variables
Store secrets in EAS (not in eas.json):
```bash
eas secret:create --name SUPABASE_URL --value "https://xxx.supabase.co"
eas secret:create --name SUPABASE_ANON_KEY --value "eyJ..."
eas secret:create --name API_URL --value "https://api.likhartisan.com"
```

## App store submission
```bash
# Submit to App Store Connect
eas submit --platform ios --profile production

# Submit to Google Play
eas submit --platform android --profile production

# Or submit after build
eas build --profile production --platform ios --auto-submit
```

## OTA updates
```bash
# Push update to existing builds
eas update --branch production --message "Bug fix for checkout"

# Roll back an update
eas update --branch production --message "Rollback" --roll-back
```

## Update groups
- `development` — Dev client, hot reload
- `preview` — Internal testing, OTA updates
- `production` — App store builds, OTA updates

## Deep linking scheme
Set in app.json:
```json
{
  "expo": {
    "scheme": "likhartisan"
  }
}
```
URL format: `likhartisan://product/123`

## Common issues
1. **Build fails** — Run `eas build:configure` to regenerate
2. **Env vars missing** — Check `eas secret:list`
3. **iOS provisioning** — Run `eas credentials` to manage
4. **Android keystore** — EAS manages it automatically
