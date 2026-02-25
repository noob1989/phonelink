const { exec } = require('child_process');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { adbExec } = require('./helpers');

/**
 * Install an APK file on the device.
 */
async function installApk(state, apkPath) {
    try {
        const result = await adbExec(`install -r "${apkPath}"`, state);
        return { success: result.includes('Success'), message: result };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Scan workspace for the latest debug APK.
 * @returns {Promise<string|null>}
 */
async function findDebugApk() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;

    let latestApk = null;
    let latestTime = 0;

    for (const folder of workspaceFolders) {
        const rootPath = folder.uri.fsPath;
        // Common Gradle output paths
        const searchPaths = [
            path.join(rootPath, 'app', 'build', 'outputs', 'apk', 'debug'),
            path.join(rootPath, 'app', 'build', 'outputs', 'apk'),
            path.join(rootPath, 'build', 'outputs', 'apk', 'debug'),
            path.join(rootPath, 'build', 'outputs', 'apk'),
        ];

        for (const searchPath of searchPaths) {
            try {
                if (!fs.existsSync(searchPath)) continue;
                const files = fs.readdirSync(searchPath);
                for (const file of files) {
                    if (file.endsWith('.apk')) {
                        const fullPath = path.join(searchPath, file);
                        const stat = fs.statSync(fullPath);
                        if (stat.mtimeMs > latestTime) {
                            latestTime = stat.mtimeMs;
                            latestApk = fullPath;
                        }
                    }
                }
            } catch (e) {
                // skip inaccessible dirs
            }
        }
    }

    return latestApk;
}

/**
 * Run gradlew assembleDebug in the workspace.
 */
async function buildDebugApk() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return { success: false, message: 'No workspace folder open' };
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    // Find gradlew
    const isWindows = process.platform === 'win32';
    const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
    const gradlewPath = path.join(rootPath, gradlew);

    if (!fs.existsSync(gradlewPath)) {
        return { success: false, message: 'gradlew not found in workspace root' };
    }

    return new Promise((resolve) => {
        exec(
            `"${gradlewPath}" assembleDebug`,
            { cwd: rootPath, timeout: 300000, maxBuffer: 1024 * 1024 * 10 },
            (error, stdout, stderr) => {
                if (error) {
                    const output = stderr || stdout || error.message;
                    const lines = output.split('\n');
                    const errorLines = lines.filter(l =>
                        l.includes('ERROR') || l.includes('FAILURE') || l.includes('error:')
                    ).slice(0, 5);
                    resolve({
                        success: false,
                        message: errorLines.length > 0 ? errorLines.join('\n') : 'Build failed. Check terminal for details.'
                    });
                } else {
                    resolve({ success: true, message: 'Build successful' });
                }
            }
        );
    });
}

/**
 * Build then install debug APK.
 */
async function buildAndInstall(state) {
    // Step 1: Build
    const buildResult = await buildDebugApk();
    if (!buildResult.success) {
        return { success: false, message: `Build failed: ${buildResult.message}` };
    }

    // Step 2: Find the APK
    const apkPath = await findDebugApk();
    if (!apkPath) {
        return { success: false, message: 'Build succeeded but APK not found' };
    }

    // Step 3: Install
    const installResult = await installApk(state, apkPath);
    return {
        success: installResult.success,
        message: installResult.success
            ? `Installed: ${path.basename(apkPath)}`
            : installResult.message,
        apkPath
    };
}

module.exports = {
    installApk,
    findDebugApk,
    buildDebugApk,
    buildAndInstall
};
