# PhoneLink 📱

Connect to your Android phone via ADB WiFi — right from VS Code.

## Features

- **📱 Status Bar Icon** — Shows connection status at a glance (green when connected)
- **Sidebar Panel** — Beautiful UI for managing your phone connection
- **Quick Connect** — Enter your phone's IP and connect instantly
- **Device Info** — See model, Android version, battery level, resolution
- **Screenshot** — Capture screenshots with one click
- **Screen Record** — Record your phone screen (up to 180 seconds)
- **Logcat** — Open a live logcat terminal
- **ADB Shell** — Open an interactive ADB shell
- **Install APK** — Drag and drop APK installation

## Prerequisites

1. **ADB** must be installed and available in your PATH (or set the path in settings)
2. **USB Debugging** must be enabled on your phone
3. Your phone and PC must be on the **same WiFi network**

## First-Time Setup

If you've never connected via WiFi before:

1. Connect your phone via USB
2. Run `adb tcpip 5555` in a terminal
3. Unplug USB
4. Use PhoneLink to connect via IP

If you've connected before (like you have), just enter your phone's IP!

> **Android 11+**: You can also use the built-in Wireless Debugging feature in Developer Options — no USB needed.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `phonelink.defaultIp` | `""` | Default phone IP for quick connect |
| `phonelink.defaultPort` | `5555` | Default ADB TCP port |
| `phonelink.adbPath` | `"adb"` | Path to ADB if not in PATH |
| `phonelink.screenshotDir` | `""` | Where to save screenshots (defaults to workspace) |

## Commands

All commands available via `Ctrl+Shift+P`:

- `PhoneLink: Connect to Phone`
- `PhoneLink: Disconnect Phone`
- `PhoneLink: Open Panel`
- `PhoneLink: Take Screenshot`
- `PhoneLink: Screen Record`
- `PhoneLink: Open Logcat`
- `PhoneLink: Open ADB Shell`
- `PhoneLink: Install APK`
