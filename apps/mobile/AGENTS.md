# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# react-native-bare-kit is PINNED to 0.14.5 — do not bump blindly

`react-native-bare-kit@0.15.0` ships a prebuilt `libbare-kit.so` that SIGSEGVs
in `bare_kit__on_thread_enter` the moment `Worklet.start()` runs on Android
API 35 (arm64 emulator, RN 0.85) — it kills the app before the Hyperswarm room
can open. 0.14.5's prebuilt works. If you upgrade, rebuild BOTH APKs and
re-test the Match Room join (P2P room over the DHT) before shipping.

# Emulator gotcha (API 35)

After every `adb install`, copy `libnativehelper.so` from the ART APEX into the
app's native lib dir (`adb root`, then `cp /apex/com.android.art@*/lib64/libnativehelper.so <legacyNativeLibraryDir>/arm64/`)
or the app aborts on boot with a `PlatformConstants` TurboModule error.
