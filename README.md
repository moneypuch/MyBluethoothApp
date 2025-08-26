# SmartPhysioApp - Frontend Mobile

Applicazione React Native per l'acquisizione in tempo reale di dati biomedici da sensori sEMG e IMU via Bluetooth.

## 🚀 Requisiti di Sistema

### Software Richiesto

- **Node.js**: versione 18.x o superiore
- **npm** o **yarn**: gestore pacchetti
- **Java JDK**: versione 17 (richiesto per build Android)
- **Android Studio** (per build Android)
- **Git**: per clonare il repository

### Requisiti per Build Android APK

Per generare l'APK con `./gradlew assembleRelease` è necessario:

1. **Android Studio** con:
   - Android SDK (API Level 31 o superiore)
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools

2. **Variabili d'ambiente** (configurare nel sistema):
   ```bash
   ANDROID_HOME = C:\Users\[USERNAME]\AppData\Local\Android\Sdk
   PATH += %ANDROID_HOME%\tools
   PATH += %ANDROID_HOME%\platform-tools
   ```

3. **Java JDK 17** (Gradle richiede questa versione):
   ```bash
   JAVA_HOME = C:\Program Files\Java\jdk-17
   PATH += %JAVA_HOME%\bin
   ```

## 📦 Installazione

```bash
npm install
npm run start
```

To make things work on your local simulator, or on your phone, you need first to [run `eas build`](https://github.com/infinitered/ignite/blob/master/docs/expo/EAS.md). We have many shortcuts on `package.json` to make it easier:

```bash
npm run build:ios:sim # build for ios simulator
npm run build:ios:dev # build for ios device
npm run build:ios:prod # build for ios device
npm run build:android:sim # build for android emulator
npm run build:android:dev # build for android device
```

**Alternative - Direct Expo Run (Recommended for Development):**
```bash
npx expo run:android  # Build and run on Android (faster for development)
npx expo run:ios      # Build and run on iOS (faster for development)
```

> **Note:** Use `npx expo run:android` for faster development builds. Use `npm run build:android:dev` for production-ready EAS builds.

## ⚠️ Important: Native File Changes

**When native files are modified (AndroidManifest.xml, Info.plist, etc.), you MUST rebuild the app:**

```bash
# After git pull with native changes
git pull origin main

# Rebuild completely - choose one:
npx expo run:android    # Recommended for development
npm run build:android:dev  # For EAS builds
```

**Files that require rebuild:**
- `android/app/src/main/AndroidManifest.xml` (permissions, app config)
- `ios/MyBluethoothApp/Info.plist` (iOS permissions, config)
- `app.json` / `expo.json` (native configuration)
- Any file in `android/` or `ios/` directories

**Hot reload will NOT work** for these changes - full rebuild required.

## 🚀 Local Development Setup

### Prerequisites
1. **Install ngrok globally:**
   ```bash
   npm install -g ngrok
   ```

2. **Configure ngrok with auth token:**
   ```bash
   ngrok config add-authtoken 30he6lxFou7e1qIAy5usyH2VxZP_6oirBJ9u2X9xJZ2wwne5d
   ```

### Development Workflow

1. **Start your backend server locally** (on port 3000)

2. **Expose backend via ngrok:**
   ```bash
   ngrok http --url=raccoon-advanced-cod.ngrok-free.app 3000
   ```

3. **Build and install Android APK manually:**
   ```bash
   # Navigate to android folder
   cd android
   
   # Build release APK
   ./gradlew assembleRelease
   
   # Install on connected device
   adb install app/build/outputs/apk/release/app-release.apk
   ```

### Alternative: Quick Development Build
```bash
# For faster development (debug build)
npx expo run:android
```

> **Note:** The production ngrok URL (`raccoon-advanced-cod.ngrok-free.app`) is configured in `app/services/api/api.ts`. Make sure ngrok is running with this URL before testing the app.

### `./assets` directory

This directory is designed to organize and store various assets, making it easy for you to manage and use them in your application. The assets are further categorized into subdirectories, including `icons` and `images`:

```tree
assets
├── icons
└── images
```

**icons**
This is where your icon assets will live. These icons can be used for buttons, navigation elements, or any other UI components. The recommended format for icons is PNG, but other formats can be used as well.

Ignite comes with a built-in `Icon` component. You can find detailed usage instructions in the [docs](https://github.com/infinitered/ignite/blob/master/docs/boilerplate/app/components/Icon.md).

**images**
This is where your images will live, such as background images, logos, or any other graphics. You can use various formats such as PNG, JPEG, or GIF for your images.

Another valuable built-in component within Ignite is the `AutoImage` component. You can find detailed usage instructions in the [docs](https://github.com/infinitered/ignite/blob/master/docs/Components-AutoImage.md).

How to use your `icon` or `image` assets:

```typescript
import { Image } from 'react-native';

const MyComponent = () => {
  return (
    <Image source={require('../assets/images/my_image.png')} />
  );
};
```

## Running Maestro end-to-end tests

Follow our [Maestro Setup](https://ignitecookbook.com/docs/recipes/MaestroSetup) recipe.

## Next Steps

### Ignite Cookbook

[Ignite Cookbook](https://ignitecookbook.com/) is an easy way for developers to browse and share code snippets (or “recipes”) that actually work.

### Upgrade Ignite boilerplate

Read our [Upgrade Guide](https://ignitecookbook.com/docs/recipes/UpdatingIgnite) to learn how to upgrade your Ignite project.

## Community

⭐️ Help us out by [starring on GitHub](https://github.com/infinitered/ignite), filing bug reports in [issues](https://github.com/infinitered/ignite/issues) or [ask questions](https://github.com/infinitered/ignite/discussions).

💬 Join us on [Slack](https://join.slack.com/t/infiniteredcommunity/shared_invite/zt-1f137np4h-zPTq_CbaRFUOR_glUFs2UA) to discuss.

📰 Make our Editor-in-chief happy by [reading the React Native Newsletter](https://reactnativenewsletter.com/).
