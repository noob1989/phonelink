const { spawn } = require('child_process');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { adbExec, getAdbPath, getMediaDir } = require('./helpers');

/**
 * Clean the debugmedia directory.
 */
function cleanDebugMedia() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return { success: false, message: 'No workspace open' };

    const mediaDir = path.join(workspaceFolders[0].uri.fsPath, 'debugmedia');
    if (!fs.existsSync(mediaDir)) {
        return { success: true, message: 'Nothing to clean', count: 0 };
    }

    try {
        const files = fs.readdirSync(mediaDir);
        const count = files.length;
        fs.rmSync(mediaDir, { recursive: true, force: true });
        return { success: true, message: `Deleted ${count} files`, count };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Take a screenshot and save it locally.
 */
async function takeScreenshot(state) {
    try {
        const saveDir = getMediaDir();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `screenshot_${timestamp}.png`;
        const remotePath = `/sdcard/${filename}`;
        const localPath = path.join(saveDir, filename);

        await adbExec(`shell screencap -p ${remotePath}`, state);
        await adbExec(`pull ${remotePath} "${localPath}"`, state);
        await adbExec(`shell rm ${remotePath}`, state);

        // Open the screenshot
        const uri = vscode.Uri.file(localPath);
        await vscode.commands.executeCommand('vscode.open', uri);

        return { success: true, path: localPath };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Record the screen for a given duration.
 */
async function startScreenRecord(state, duration = 30) {
    try {
        const saveDir = getMediaDir();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `screenrecord_${timestamp}.mp4`;
        const remotePath = `/sdcard/${filename}`;
        const localPath = path.join(saveDir, filename);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Recording screen (${duration}s)...`,
            cancellable: true
        }, async (progress, token) => {
            const adb = getAdbPath();
            const proc = spawn(adb, ['shell', 'screenrecord', '--time-limit', String(duration), remotePath]);

            token.onCancellationRequested(() => {
                proc.kill('SIGINT');
            });

            await new Promise((resolve) => {
                proc.on('close', resolve);
            });

            // Pull the file
            await adbExec(`pull ${remotePath} "${localPath}"`, state);
            await adbExec(`shell rm ${remotePath}`, state);

            vscode.window.showInformationMessage(`Screen recording saved: ${filename}`, 'Open').then(choice => {
                if (choice === 'Open') {
                    vscode.env.openExternal(vscode.Uri.file(localPath));
                }
            });
        });

        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Send wake + unlock key events to the device.
 */
async function wakeScreen(state) {
    try {
        await adbExec('shell input keyevent 224', state); // KEYCODE_WAKEUP
        // Small delay then unlock (KEYCODE_MENU)
        setTimeout(() => {
            adbExec('shell input keyevent 82', state).catch(() => { });
        }, 300);
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Toggle the stay-awake-while-plugged-in setting.
 */
async function toggleStayAwake(state) {
    try {
        const result = await adbExec('shell settings get global stay_on_while_plugged_in', state);
        const current = parseInt(result.trim());

        if (isNaN(current) || current === 0) {
            // Set to stay awake while charging (AC(1) + USB(2) + Wireless(4) = 7)
            await adbExec('shell settings put global stay_on_while_plugged_in 7', state);
            return { success: true, message: 'Stay awake enabled' };
        } else {
            // Disable
            await adbExec('shell settings put global stay_on_while_plugged_in 0', state);
            return { success: true, message: 'Stay awake disabled' };
        }
    } catch (err) {
        return { success: false, message: err.message };
    }
}

module.exports = {
    cleanDebugMedia,
    takeScreenshot,
    startScreenRecord,
    wakeScreen,
    toggleStayAwake
};
