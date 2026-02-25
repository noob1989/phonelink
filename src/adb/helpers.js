const { exec } = require('child_process');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

/**
 * Get the configured ADB executable path.
 */
function getAdbPath() {
    const config = vscode.workspace.getConfiguration('phonelink');
    return config.get('adbPath') || 'adb';
}

/**
 * Build a `-s <device>` argument string for ADB commands.
 * @param {object} state - Connection state with connectionType, deviceSerial, currentIp, currentPort
 * @returns {string}
 */
function getDeviceArg(state) {
    if (state.connectionType === 'usb' && state.deviceSerial) {
        return `-s ${state.deviceSerial}`;
    }
    if (state.currentIp && state.currentPort) {
        return `-s ${state.currentIp}:${state.currentPort}`;
    }
    return '';
}

/**
 * Build a device args array for spawn-based commands.
 * @param {object} state - Connection state
 * @returns {string[]}
 */
function getDeviceArgs(state) {
    if (state.connectionType === 'usb' && state.deviceSerial) {
        return ['-s', state.deviceSerial];
    }
    if (state.currentIp) {
        return ['-s', `${state.currentIp}:${state.currentPort}`];
    }
    return [];
}

/**
 * Execute an ADB command and return the trimmed stdout.
 * @param {string} command - ADB sub-command (e.g. 'shell getprop ...')
 * @param {object} state - Connection state
 * @param {{ useDevice?: boolean }} options
 * @returns {Promise<string>}
 */
function adbExec(command, state, { useDevice = true } = {}) {
    const adb = getAdbPath();
    const deviceArg = useDevice ? getDeviceArg(state) : '';
    return new Promise((resolve, reject) => {
        exec(`${adb} ${deviceArg} ${command}`.replace(/\s+/g, ' ').trim(), { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

/**
 * Get (and create if needed) the debug media directory.
 * @returns {string}
 */
function getMediaDir() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let root;
    if (workspaceFolders) {
        root = workspaceFolders[0].uri.fsPath;
    } else {
        root = require('os').homedir();
    }
    const mediaDir = path.join(root, 'debugmedia');
    if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
    }
    return mediaDir;
}

/**
 * Detect the app's package name from Gradle build files or AndroidManifest.
 * @returns {string|null}
 */
function detectAppPackage() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Try app/build.gradle or app/build.gradle.kts
    const gradleFiles = [
        path.join(rootPath, 'app', 'build.gradle'),
        path.join(rootPath, 'app', 'build.gradle.kts'),
        path.join(rootPath, 'build.gradle'),
        path.join(rootPath, 'build.gradle.kts'),
    ];

    for (const filePath of gradleFiles) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/applicationId\s*[=]?\s*["']([^"']+)["']/);
            if (match) return match[1];
        } catch (e) {
            // skip
        }
    }

    // Try AndroidManifest.xml
    const manifestPaths = [
        path.join(rootPath, 'app', 'src', 'main', 'AndroidManifest.xml'),
        path.join(rootPath, 'src', 'main', 'AndroidManifest.xml'),
    ];

    for (const filePath of manifestPaths) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/package\s*=\s*["']([^"']+)["']/);
            if (match) return match[1];
        } catch (e) {
            // skip
        }
    }

    return null;
}

module.exports = {
    getAdbPath,
    getDeviceArg,
    getDeviceArgs,
    adbExec,
    getMediaDir,
    detectAppPackage
};
