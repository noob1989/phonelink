const vscode = require('vscode');
const path = require('path');

/**
 * Handle messages coming from the webview and dispatch to ADB manager.
 *
 * @param {object} message - The message from the webview
 * @param {import('../adb/index')} adbManager - The ADB manager instance
 * @param {Function} postMessage - Function to send messages back to the webview
 */
async function handleMessage(message, adbManager, postMessage) {
    switch (message.command) {
        case 'connect': {
            const result = await adbManager.connect(message.ip, message.port || 5555);
            postMessage({ command: 'connectResult', ...result });
            if (result.success) {
                postMessage({ command: 'deviceInfo', info: adbManager.deviceInfo });
            }
            break;
        }
        case 'connectUsb': {
            postMessage({ command: 'connectingUsb' });
            const result = await adbManager.connectUsb(message.serial);
            postMessage({ command: 'connectResult', ...result });
            if (result.success) {
                postMessage({ command: 'deviceInfo', info: adbManager.deviceInfo });
            }
            break;
        }
        case 'scanDevices': {
            const devices = await adbManager.getDevices();
            postMessage({ command: 'deviceList', devices });
            break;
        }
        case 'disconnect': {
            await adbManager.disconnect();
            postMessage({ command: 'disconnected' });
            break;
        }
        case 'screenshot': {
            postMessage({ command: 'actionStatus', action: 'screenshot', status: 'running' });
            const result = await adbManager.takeScreenshot();
            postMessage({ command: 'actionStatus', action: 'screenshot', status: result.success ? 'done' : 'error', message: result.message || result.path });
            if (result.success) {
                vscode.window.showInformationMessage(`📸 Screenshot saved!`);
            }
            break;
        }
        case 'screenRecord': {
            adbManager.startScreenRecord(message.duration || 30);
            break;
        }
        case 'wakeScreen': {
            await adbManager.wakeScreen();
            vscode.window.showInformationMessage('☀️ Wake signal sent');
            break;
        }
        case 'toggleStayAwake': {
            const result = await adbManager.toggleStayAwake();
            postMessage({ command: 'actionStatus', action: 'stayAwake', status: result.success ? 'done' : 'error', message: result.message });
            if (result.success) {
                vscode.window.showInformationMessage(`🔋 ${result.message}`);
            }
            break;
        }
        case 'logcat': {
            adbManager.openLogcat(message.filter || '');
            break;
        }
        case 'saveLogcat': {
            postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
            const result = await adbManager.saveLogcat();
            postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
            if (result.success) {
                vscode.window.showInformationMessage(`📋 Logcat saved (${result.lineCount} lines)`);
            }
            break;
        }
        case 'saveLogcatErrors': {
            postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
            const result = await adbManager.saveLogcatErrors();
            postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
            if (result.success) {
                vscode.window.showInformationMessage(`🔴 Error log saved (${result.lineCount} lines)`);
            }
            break;
        }
        case 'saveLogcatApp': {
            postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
            const result = await adbManager.saveLogcatApp();
            postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
            if (result.success) {
                vscode.window.showInformationMessage(`📱 App log saved for ${result.packageName} (${result.lineCount} lines)`);
            } else {
                vscode.window.showErrorMessage(result.message);
            }
            break;
        }
        case 'shell': {
            adbManager.openShell();
            break;
        }
        case 'installApk': {
            // Smart install: find latest debug APK automatically
            postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
            const apkPath = await adbManager.findDebugApk();
            if (apkPath) {
                const result = await adbManager.installApk(apkPath);
                postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
                if (result.success) {
                    const filename = path.basename(apkPath);
                    vscode.window.showInformationMessage(`📦 Installed: ${filename}`);
                } else {
                    vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                }
            } else {
                // Fallback to file picker
                postMessage({ command: 'actionStatus', action: 'install', status: 'error', message: 'No APK found' });
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'APK Files': ['apk'] },
                    title: 'No debug APK found — select manually'
                });
                if (uris && uris[0]) {
                    postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
                    const result = await adbManager.installApk(uris[0].fsPath);
                    postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
                    if (result.success) {
                        vscode.window.showInformationMessage('📦 APK installed successfully!');
                    } else {
                        vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                    }
                }
            }
            break;
        }
        case 'buildAndInstall': {
            postMessage({ command: 'actionStatus', action: 'build', status: 'running' });
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔨 Building & Installing...',
                cancellable: false
            }, async () => {
                const result = await adbManager.buildAndInstall();
                postMessage({ command: 'actionStatus', action: 'build', status: result.success ? 'done' : 'error', message: result.message });
                if (result.success) {
                    vscode.window.showInformationMessage(`🚀 ${result.message}`);
                } else {
                    vscode.window.showErrorMessage(result.message);
                }
            });
            break;
        }
        case 'browseApk': {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'APK Files': ['apk'] },
                title: 'Select APK to install'
            });
            if (uris && uris[0]) {
                postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
                const result = await adbManager.installApk(uris[0].fsPath);
                postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
                if (result.success) {
                    vscode.window.showInformationMessage('📦 APK installed!');
                } else {
                    vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                }
            }
            break;
        }
        case 'pair': {
            postMessage({ command: 'pairStatus', status: 'running' });
            const result = await adbManager.pair(message.ip, message.port, message.code);
            postMessage({ command: 'pairResult', ...result });
            if (result.success) {
                vscode.window.showInformationMessage('🔗 Phone paired successfully!');
            } else {
                vscode.window.showErrorMessage(`Pairing failed: ${result.message}`);
            }
            break;
        }
        case 'refreshInfo': {
            if (adbManager.connected) {
                await adbManager._fetchDeviceInfo();
                postMessage({ command: 'deviceInfo', info: adbManager.deviceInfo });
            }
            break;
        }
        case 'getState': {
            const config = vscode.workspace.getConfiguration('phonelink');
            // Also scan for USB devices on initial load
            const devices = await adbManager.getDevices();
            postMessage({
                command: 'state',
                connected: adbManager.connected,
                deviceInfo: adbManager.deviceInfo,
                savedIp: config.get('defaultIp') || '',
                devices: devices
            });
            break;
        }
        case 'saveIp': {
            const config = vscode.workspace.getConfiguration('phonelink');
            await config.update('defaultIp', message.ip, vscode.ConfigurationTarget.Global);
            break;
        }
        case 'cleanDebugMedia': {
            const confirm = await vscode.window.showWarningMessage(
                '🗑️ Delete all files in debugmedia/?',
                { modal: true },
                'Delete All'
            );
            if (confirm === 'Delete All') {
                const result = adbManager.cleanDebugMedia();
                if (result.success) {
                    postMessage({ command: 'actionStatus', action: 'clean', status: 'done', message: result.message });
                    vscode.window.showInformationMessage(`🗑️ ${result.message}`);
                } else {
                    vscode.window.showErrorMessage(result.message);
                }
            }
            break;
        }
    }
}

module.exports = { handleMessage };
