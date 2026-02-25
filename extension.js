const vscode = require('vscode');
const AdbManager = require('./src/adb/index');
const PhoneLinkViewProvider = require('./src/views/phoneLinkViewProvider');

/** @type {AdbManager} */
let adbManager;
/** @type {vscode.StatusBarItem} */
let statusBarItem;
/** @type {PhoneLinkViewProvider} */
let viewProvider;
/** @type {NodeJS.Timer|undefined} */
let pollingInterval;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('PhoneLink extension activated');

    // Initialize ADB manager
    adbManager = new AdbManager();

    // Create status bar item (phone icon, right side)
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    statusBarItem.command = 'phonelink.showPanel';
    updateStatusBar(false);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the webview view provider for the sidebar
    viewProvider = new PhoneLinkViewProvider(context.extensionUri, adbManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('phonelink.panel', viewProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Listen for connection status changes to update status bar
    adbManager.onStatusChanged((status) => {
        updateStatusBar(status.connected, status.deviceInfo);
    });

    // Check if device is already connected (survives editor restart)
    setTimeout(async () => {
        const config = vscode.workspace.getConfiguration('phonelink');
        const savedIp = config.get('defaultIp');
        if (savedIp) {
            try {
                const status = await adbManager.checkConnection();
                // checkConnection checks adb devices — if our IP is there, we're still connected
                if (status.devices && status.devices.some(d => d.includes(savedIp))) {
                    // Device still connected from before, pick up the session
                    adbManager._currentIp = savedIp;
                    // Extract port from the device line (ip:port)
                    const deviceLine = status.devices.find(d => d.includes(savedIp));
                    const portMatch = deviceLine.match(new RegExp(savedIp.replace(/\./g, '\\.') + ':(\\d+)'));
                    adbManager._currentPort = portMatch ? parseInt(portMatch[1]) : 5555;
                    adbManager._connected = true;
                    await adbManager._fetchDeviceInfo();
                    adbManager._onStatusChanged.fire({ connected: true, deviceInfo: adbManager.deviceInfo });
                }
            } catch (e) {
                // silently ignore
            }
        }
    }, 1500);

    // Register commands
    context.subscriptions.push(
        // Quick connect — uses saved IP instantly, no prompts
        vscode.commands.registerCommand('phonelink.connect', async () => {
            const config = vscode.workspace.getConfiguration('phonelink');
            const savedIp = config.get('defaultIp');
            const savedPort = config.get('defaultPort') || 5555;

            if (savedIp) {
                // Instant connect with saved IP
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `📱 Connecting to ${savedIp}...`
                }, async () => {
                    const result = await adbManager.connect(savedIp, savedPort);
                    if (result.success) {
                        vscode.window.showInformationMessage(`📱 Connected to ${savedIp}`);
                    } else {
                        vscode.window.showErrorMessage(`Failed to connect: ${result.message}`);
                    }
                });
            } else {
                // No saved IP — ask for one
                const ip = await vscode.window.showInputBox({
                    prompt: 'Enter phone IP address',
                    placeHolder: '192.168.1.xxx',
                    validateInput: (value) => {
                        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) {
                            return 'Invalid IP address format';
                        }
                        return null;
                    }
                });
                if (ip) {
                    await config.update('defaultIp', ip, vscode.ConfigurationTarget.Global);
                    const result = await adbManager.connect(ip, savedPort);
                    if (result.success) {
                        vscode.window.showInformationMessage(`📱 Connected to ${ip}`);
                    } else {
                        vscode.window.showErrorMessage(`Failed to connect: ${result.message}`);
                    }
                }
            }
        }),

        vscode.commands.registerCommand('phonelink.disconnect', async () => {
            await adbManager.disconnect();
            vscode.window.showInformationMessage('📱 Phone disconnected');
        }),

        vscode.commands.registerCommand('phonelink.showPanel', async () => {
            // Focus the sidebar panel
            await vscode.commands.executeCommand('phonelink.panel.focus');
        }),

        vscode.commands.registerCommand('phonelink.logcat', () => {
            if (!adbManager.connected) {
                vscode.window.showWarningMessage('Not connected to any device');
                return;
            }
            adbManager.openLogcat();
        }),

        vscode.commands.registerCommand('phonelink.screenshot', async () => {
            if (!adbManager.connected) {
                vscode.window.showWarningMessage('Not connected to any device');
                return;
            }
            const result = await adbManager.takeScreenshot();
            if (result.success) {
                vscode.window.showInformationMessage(`📸 Screenshot saved: ${result.path}`);
            } else {
                vscode.window.showErrorMessage(`Screenshot failed: ${result.message}`);
            }
        }),

        vscode.commands.registerCommand('phonelink.shell', () => {
            if (!adbManager.connected) {
                vscode.window.showWarningMessage('Not connected to any device');
                return;
            }
            adbManager.openShell();
        }),

        vscode.commands.registerCommand('phonelink.installApk', async () => {
            if (!adbManager.connected) {
                vscode.window.showWarningMessage('Not connected to any device');
                return;
            }
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'APK Files': ['apk'] },
                title: 'Select APK to install'
            });
            if (uris && uris[0]) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Installing APK...'
                }, async () => {
                    const result = await adbManager.installApk(uris[0].fsPath);
                    if (result.success) {
                        vscode.window.showInformationMessage('📦 APK installed successfully!');
                    } else {
                        vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                    }
                });
            }
        }),

        vscode.commands.registerCommand('phonelink.screenRecord', async () => {
            if (!adbManager.connected) {
                vscode.window.showWarningMessage('Not connected to any device');
                return;
            }
            const duration = await vscode.window.showInputBox({
                prompt: 'Recording duration in seconds',
                value: '30',
                validateInput: (v) => {
                    const n = parseInt(v);
                    if (isNaN(n) || n < 1 || n > 180) return 'Enter 1-180 seconds';
                    return null;
                }
            });
            if (duration) {
                adbManager.startScreenRecord(parseInt(duration));
            }
        })
    );

    // Poll connection status every 10 seconds
    pollingInterval = setInterval(async () => {
        if (adbManager.currentIp || adbManager.connectionType) {
            await adbManager.checkConnection();
        }
    }, 10000);

    context.subscriptions.push({
        dispose: () => {
            if (pollingInterval) clearInterval(pollingInterval);
            adbManager.dispose();
        }
    });
}

function updateStatusBar(connected, deviceInfo) {
    if (connected) {
        const name = deviceInfo?.model || 'Phone';
        statusBarItem.text = '$(device-mobile) ' + name;
        statusBarItem.tooltip = `PhoneLink: Connected to ${deviceInfo?.brand || ''} ${name}\nClick to open panel`;
        statusBarItem.backgroundColor = undefined;
        statusBarItem.color = '#00e676';
    } else {
        statusBarItem.text = '$(device-mobile)';
        statusBarItem.tooltip = 'PhoneLink: Not connected\nClick to open panel';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.color = undefined;
    }
}

function deactivate() {
    if (pollingInterval) clearInterval(pollingInterval);
    if (adbManager) adbManager.dispose();
}

module.exports = { activate, deactivate };
