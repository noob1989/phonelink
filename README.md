# PhoneLink 📱

Connect to your Android phone via ADB WiFi or USB — right from VS Code. Manage your device, take screenshots, record your screen, install APKs, control power settings, and more, all without leaving your editor.

## Features

- **📱 Status Bar Icon** — Shows connection status at a glance (green when connected)
- **Sidebar Panel** — Beautiful webview UI for managing your phone connection
- **⚡ USB & WiFi** — Connect via USB instantly or wirelessly via IP
- **Device Info** — See model, Android version, battery level, and resolution
- **📸 Screenshot** — Capture screenshots with one click
- **🎥 Screen Record** — Record your phone screen (up to 180 seconds)
- **☀️ Wake / Unlock** — Remotely wake and unlock your device screen
- **🔋 Stay Awake** — Toggle keeping your screen on while plugged in
- **📋 Logcat** — Open a live logcat terminal for debugging
- **💻 ADB Shell** — Open an interactive ADB shell
- **📦 Install APK** — Install APKs directly from your file explorer

## Installation

PhoneLink is not yet on the VS Code Marketplace. You can install it manually:

### From `.vsix` file

1. Download the latest `.vsix` from [Releases](https://github.com/noob1989/phonelink/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`)
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix` file

### From source

```bash
git clone https://github.com/noob1989/phonelink.git
cd phonelink
npm install
```

Then press `F5` in VS Code to launch the Extension Development Host with PhoneLink loaded.

## Prerequisites

1. **ADB** must be installed and available in your PATH (or set the path in extension settings)
2. **USB Debugging** must be enabled on your phone ([how to enable](https://developer.android.com/studio/debug/dev-options))
3. Your phone and PC must be on the **same WiFi network**

## Quick Start

1. Open the **PhoneLink** panel from the sidebar (phone icon)
2. **USB:** Plug in your phone and click **Scan for Devices**
3. **WiFi:** Connect via USB once, run `adb tcpip 5555`, unplug, and enter your IP
4. You're in! Use the panel buttons for screenshots, recording, shell, and more.

> **Android 11+**: You can skip the USB step entirely — use the built-in **Wireless Debugging** feature in Developer Options.

If you've connected before, just enter your phone's IP!

## Settings

Configure via `File > Preferences > Settings` and search for "PhoneLink":

| Setting | Default | Description |
|---------|---------|-------------|
| `phonelink.defaultIp` | `""` | Default phone IP for quick connect |
| `phonelink.defaultPort` | `5555` | Default ADB TCP port |
| `phonelink.adbPath` | `"adb"` | Path to ADB executable if not in PATH |

## Commands

All commands available via `Ctrl+Shift+P`:

| Command | Description |
|---------|-------------|
| `PhoneLink: Connect to Phone` | Connect to your device via saved IP |
| `PhoneLink: Disconnect Phone` | Disconnect the current device |
| `PhoneLink: Open Panel` | Focus the PhoneLink sidebar panel |
| `PhoneLink: Take Screenshot` | Capture a screenshot from your device |
| `PhoneLink: Screen Record` | Record the screen (1–180 seconds) |
| `PhoneLink: Open Logcat` | Open a live logcat terminal |
| `PhoneLink: Open ADB Shell` | Open an interactive shell session |
| `PhoneLink: Install APK` | Browse and install an APK file |

## Troubleshooting

### "ADB not found"
Make sure ADB is installed and in your system PATH. You can also set the full path in settings via `phonelink.adbPath`.
- **Windows**: ADB comes with [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools). Download, extract, and add the folder to your PATH.
- **macOS/Linux**: `brew install android-platform-tools` or download from the link above.

### Connection times out
- Make sure your phone and PC are on the **same WiFi network**
- Check if your firewall is blocking port `5555`
- Try re-running `adb tcpip 5555` with your phone connected via USB

### Device disconnects randomly
- WiFi ADB can drop when the phone goes to sleep — use the new **Stay Awake** toggle in the panel to prevent this!
- Reconnect using the sidebar panel or `PhoneLink: Connect to Phone`

### "Device unauthorized"
- Check your phone for an **"Allow USB debugging?"** popup and tap **Allow**
- If the popup doesn't appear, revoke USB debugging authorizations in Developer Options and reconnect

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an [issue](https://github.com/noob1989/phonelink/issues) or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).
