const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { adbExec, getAdbPath, getDeviceArgs, getMediaDir, detectAppPackage } = require('./helpers');

/**
 * Open a live logcat terminal.
 */
function openLogcat(state, terminals, filter = '') {
    if (terminals.logcat) {
        terminals.logcat.dispose();
    }
    const adb = getAdbPath();
    const deviceArgs = getDeviceArgs(state);
    terminals.logcat = vscode.window.createTerminal({
        name: '📱 Logcat',
        shellPath: adb,
        shellArgs: [...deviceArgs, 'logcat', ...(filter ? ['-s', filter] : [])]
    });
    terminals.logcat.show();
}

/**
 * Open an interactive ADB shell terminal.
 */
function openShell(state, terminals) {
    if (terminals.shell) {
        terminals.shell.dispose();
    }
    const adb = getAdbPath();
    const deviceArgs = getDeviceArgs(state);
    terminals.shell = vscode.window.createTerminal({
        name: '📱 ADB Shell',
        shellPath: adb,
        shellArgs: [...deviceArgs, 'shell']
    });
    terminals.shell.show();
}

/**
 * Save logcat dump to file (all logs, last buffer).
 */
async function saveLogcat(state) {
    try {
        const saveDir = getMediaDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `logcat_${timestamp}.txt`;
        const localPath = path.join(saveDir, filename);

        // -d = dump and exit, -v threadtime = detailed format
        const result = await adbExec('logcat -d -v threadtime', state);

        // Keep last ~2000 lines to avoid huge files
        const lines = result.split('\n');
        const trimmed = lines.slice(Math.max(0, lines.length - 2000)).join('\n');

        fs.writeFileSync(localPath, trimmed, 'utf8');

        // Open in editor
        const uri = vscode.Uri.file(localPath);
        await vscode.commands.executeCommand('vscode.open', uri);

        return { success: true, path: localPath, lineCount: lines.length };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Save only error/fatal logcat entries to file.
 */
async function saveLogcatErrors(state) {
    try {
        const saveDir = getMediaDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `logcat_errors_${timestamp}.txt`;
        const localPath = path.join(saveDir, filename);

        // *:E = only Error and Fatal level
        const result = await adbExec('logcat -d -v threadtime *:E', state);

        const lines = result.split('\n');
        const trimmed = lines.slice(Math.max(0, lines.length - 2000)).join('\n');

        fs.writeFileSync(localPath, trimmed, 'utf8');

        const uri = vscode.Uri.file(localPath);
        await vscode.commands.executeCommand('vscode.open', uri);

        return { success: true, path: localPath, lineCount: lines.length };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Save logcat filtered by app package.
 */
async function saveLogcatApp(state) {
    try {
        const packageName = detectAppPackage();
        if (!packageName) {
            return { success: false, message: 'Could not detect app package. Make sure you have a Gradle project open.' };
        }

        const saveDir = getMediaDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `logcat_${packageName.split('.').pop()}_${timestamp}.txt`;
        const localPath = path.join(saveDir, filename);

        // Get PID of the app
        let pid;
        try {
            pid = await adbExec(`shell pidof ${packageName}`, state);
            pid = pid.trim();
        } catch (e) {
            // App might not be running
        }

        let result;
        if (pid) {
            // Filter by PID
            result = await adbExec(`logcat -d -v threadtime --pid=${pid}`, state);
        } else {
            // Fallback: grep for package name in full logcat
            const fullLog = await adbExec('logcat -d -v threadtime', state);
            const lines = fullLog.split('\n').filter(l => l.includes(packageName));
            result = lines.join('\n');
        }

        const lines = result.split('\n');
        const trimmed = lines.slice(Math.max(0, lines.length - 2000)).join('\n');

        const header = `# Logcat for: ${packageName}\n# PID: ${pid || 'not running'}\n# Captured: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
        fs.writeFileSync(localPath, header + trimmed, 'utf8');

        const uri = vscode.Uri.file(localPath);
        await vscode.commands.executeCommand('vscode.open', uri);

        return { success: true, path: localPath, lineCount: lines.length, packageName };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

module.exports = {
    openLogcat,
    openShell,
    saveLogcat,
    saveLogcatErrors,
    saveLogcatApp
};
