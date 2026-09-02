// Use your computer's IP when running on a physical device so the app can reach your backend.
// Run: set EXPO_PUBLIC_API_HOST=192.168.1.5  (then npx expo start)
// Or create .env with EXPO_PUBLIC_API_HOST=192.168.1.5
const host = process.env.EXPO_PUBLIC_API_HOST || null;

export default {
  expo: {
    name: 'GGFIX Employee',
    slug: 'ggfix-app',
    // EAS account/organization that owns the project (from your Expo dashboard).
    // Verify this matches expo.dev → your account. Change if different.
    owner: 'globogreen-system-and-technology-private-limited',
    version: '1.0.0',
    platforms: ['ios', 'android', 'web'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    jsEngine: 'hermes',
    icon: './assets/logo.png',
    splash: { image: './assets/logo.png', resizeMode: 'contain', backgroundColor: '#202124' },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.ggfix.employeeapp',
      infoPlist: {
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      },
    },
    android: { package: 'com.ggfix.employeeapp', adaptiveIcon: { foregroundImage: './assets/logo.png', backgroundColor: '#202124' } },
    plugins: [
      // Keychain/Keystore-backed storage for the auth token (see src/auth/session.js).
      'expo-secure-store',
      ['expo-local-authentication', { faceIDPermission: 'Use Face ID to unlock GGFIX.' }],
      // Live camera for scanning ticket QR slips (Home header scan icon).
      ['expo-camera', { cameraPermission: 'We use your camera to scan ticket QR slips and open the job.' }],
      // The bare `android.usesCleartextTraffic` key is NOT read by Expo prebuild —
      // cleartext HTTP must be enabled via expo-build-properties or the release APK blocks it.
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
            // Ship native libraries for real phones only (arm64-v8a). This drops the
            // emulator-only ABIs (x86/x86_64) and old 32-bit devices (armeabi-v7a),
            // shrinking the universal APK from ~114MB to ~50MB. buildArchs writes
            // `reactNativeArchitectures` into gradle.properties.
            buildArchs: ['arm64-v8a'],
          },
        },
      ],
    ],
    extra: {
      API_HOST: host,
      // Required for EAS builds. Get this value by running `npx eas init`
      // (it prints the ID), or copy it from expo.dev → your project → settings.
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID ||
          '52db54d3-65c5-4efd-bab2-6718f0e3a686',
      },
    },
  },
};
