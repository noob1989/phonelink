const { exec, spawn } = require('child_process');
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class AdbManager {
    constructor() {
        this._connected = false;
        this._deviceInfo = null;
        this._currentIp = '';
        this._currentPort = 5555;
        this._onStatusChanged = new vscode.EventEmitter();
        this.onStatusChanged = this._onStatusChanged.event;
        this._logcatTerminal = null;
        this._shellTerminal = null;
    }

    get connected() { return this._connected; }
    get deviceInfo() { return this._deviceInfo; }
    get currentIp() { return this._currentIp; }

    _getAdbPath() {
        const config = vscode.workspace.getConfiguration('phonelink');
        return config.get('adbPath') || 'adb';
    }

    _getDeviceArg() {
        if (this._currentIp && this._currentPort) {
            return `-s ${this._currentIp}:${this._currentPort}`;
        }
        return '';
    }

    _exec(command, { useDevice = true } = {}) {
        const adb = this._getAdbPath();
        const deviceArg = useDevice ? this._getDeviceArg() : '';
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

    async connect(ip, port = 5555) {
        try {
            this._currentIp = ip;
            this._currentPort = port;

            const result = await this._exec(`connect ${ip}:${port}`, { useDevice: false });

            if (result.includes('connected') || result.includes('already connected')) {
                this._connected = true;
                await this._fetchDeviceInfo();
                this._onStatusChanged.fire({ connected: true, deviceInfo: this._deviceInfo });
                return { success: true, message: result };
            } else {
                return { success: false, message: result };
            }
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async pair(ip, port, code) {
        try {
            const adb = this._getAdbPath();
            return new Promise((resolve, reject) => {
                const proc = exec(`${adb} pair ${ip}:${port} ${code}`, { timeout: 30000 }, (error, stdout, stderr) => {
                    const output = (stdout || '') + (stderr || '');
                    if (output.includes('Successfully paired') || output.includes('success')) {
                        resolve({ success: true, message: output.trim() });
                    } else if (error) {
                        resolve({ success: false, message: output.trim() || error.message });
                    } else {
                        resolve({ success: false, message: output.trim() || 'Pairing failed' });
                    }
                });
            });
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async disconnect() {
        try {
            if (this._currentIp) {
                await this._exec(`disconnect ${this._currentIp}:${this._currentPort}`, { useDevice: false });
            }
            this._connected = false;
            this._deviceInfo = null;
            this._onStatusChanged.fire({ connected: false });
            return { success: true, message: 'Disconnected' };
        } catch (err) {
            this._connected = false;
            this._deviceInfo = null;
            this._onStatusChanged.fire({ connected: false });
            return { success: true, message: 'Disconnected' };
        }
    }

    async checkConnection() {
        try {
            const result = await this._exec('devices', { useDevice: false });
            const lines = result.split('\n').filter(l => l.includes('device') && !l.includes('List'));

            if (lines.length > 0 && this._currentIp) {
                const isConnected = lines.some(l => l.includes(this._currentIp));
                if (isConnected !== this._connected) {
                    this._connected = isConnected;
                    if (isConnected) {
                        await this._fetchDeviceInfo();
                    } else {
                        this._deviceInfo = null;
                    }
                    this._onStatusChanged.fire({ connected: isConnected, deviceInfo: this._deviceInfo });
                }
            }

            return { connected: this._connected, devices: lines };
        } catch (err) {
            return { connected: false, devices: [] };
        }
    }

    async getDevices() {
        try {
            const result = await this._exec('devices -l', { useDevice: false });
            const lines = result.split('\n').filter(l => l.trim() && !l.includes('List of'));
            return lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    id: parts[0],
                    status: parts[1],
                    info: parts.slice(2).join(' ')
                };
            });
        } catch (err) {
            return [];
        }
    }

    async _fetchDeviceInfo() {
        try {
            const [model, brand, androidVersion, sdk, battery, resolution, serialNo] = await Promise.all([
                this._exec('shell getprop ro.product.model').catch(() => 'Unknown'),
                this._exec('shell getprop ro.product.brand').catch(() => 'Unknown'),
                this._exec('shell getprop ro.build.version.release').catch(() => 'Unknown'),
                this._exec('shell getprop ro.build.version.sdk').catch(() => 'Unknown'),
                this._exec('shell dumpsys battery').catch(() => ''),
                this._exec('shell wm size').catch(() => ''),
                this._exec('get-serialno').catch(() => 'Unknown')
            ]);

            // Parse battery level
            let batteryLevel = 'N/A';
            const batteryMatch = battery.match(/level:\s*(\d+)/);
            if (batteryMatch) batteryLevel = batteryMatch[1] + '%';

            // Parse resolution
            let res = 'N/A';
            const resMatch = resolution.match(/Physical size:\s*(.+)/);
            if (resMatch) res = resMatch[1];

            this._deviceInfo = {
                model: model,
                brand: brand.charAt(0).toUpperCase() + brand.slice(1),
                androidVersion: androidVersion,
                sdkLevel: sdk,
                battery: batteryLevel,
                resolution: res,
                serial: serialNo,
                ip: this._currentIp
            };
        } catch (err) {
            this._deviceInfo = { model: 'Unknown Device', brand: 'Unknown', ip: this._currentIp };
        }
    }

    _getMediaDir() {
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

    cleanDebugMedia() {
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

    async takeScreenshot() {
        try {
            const saveDir = this._getMediaDir();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `screenshot_${timestamp}.png`;
            const remotePath = `/sdcard/${filename}`;
            const localPath = path.join(saveDir, filename);

            await this._exec(`shell screencap -p ${remotePath}`);
            await this._exec(`pull ${remotePath} "${localPath}"`);
            await this._exec(`shell rm ${remotePath}`);

            // Open the screenshot
            const uri = vscode.Uri.file(localPath);
            await vscode.commands.executeCommand('vscode.open', uri);

            return { success: true, path: localPath };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    async startScreenRecord(duration = 30) {
        try {
            const saveDir = this._getMediaDir();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `screenrecord_${timestamp}.mp4`;
            const remotePath = `/sdcard/${filename}`;
            const localPath = path.join(saveDir, filename);

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Recording screen (${duration}s)...`,
                cancellable: true
            }, async (progress, token) => {
                const adb = this._getAdbPath();
                const proc = spawn(adb, ['shell', 'screenrecord', '--time-limit', String(duration), remotePath]);

                token.onCancellationRequested(() => {
                    proc.kill('SIGINT');
                });

                await new Promise((resolve) => {
                    proc.on('close', resolve);
                });

                // Pull the file
                await this._exec(`pull ${remotePath} "${localPath}"`);
                await this._exec(`shell rm ${remotePath}`);

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

    openLogcat(filter = '') {
        if (this._logcatTerminal) {
            this._logcatTerminal.dispose();
        }
        const adb = this._getAdbPath();
        const deviceArgs = this._currentIp ? ['-s', `${this._currentIp}:${this._currentPort}`] : [];
        this._logcatTerminal = vscode.window.createTerminal({
            name: '📱 Logcat',
            shellPath: adb,
            shellArgs: [...deviceArgs, 'logcat', ...(filter ? ['-s', filter] : [])]
        });
        this._logcatTerminal.show();
    }

    openShell() {
        if (this._shellTerminal) {
            this._shellTerminal.dispose();
        }
        const adb = this._getAdbPath();
        const deviceArgs = this._currentIp ? ['-s', `${this._currentIp}:${this._currentPort}`] : [];
        this._shellTerminal = vscode.window.createTerminal({
            name: '📱 ADB Shell',
            shellPath: adb,
            shellArgs: [...deviceArgs, 'shell']
        });
        this._shellTerminal.show();
    }

    /**
     * Detect the app's package name from Gradle build files
     */
    _detectAppPackage() {
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
                // Match applicationId "com.example.app" or applicationId = "com.example.app"
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

    /**
     * Save logcat dump to file (all logs, last buffer)
     */
    async saveLogcat() {
        try {
            const saveDir = this._getMediaDir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `logcat_${timestamp}.txt`;
            const localPath = path.join(saveDir, filename);

            // -d = dump and exit, -v threadtime = detailed format
            const result = await this._exec('logcat -d -v threadtime');

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
     * Save only error/fatal logcat entries to file
     */
    async saveLogcatErrors() {
        try {
            const saveDir = this._getMediaDir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `logcat_errors_${timestamp}.txt`;
            const localPath = path.join(saveDir, filename);

            // *:E = only Error and Fatal level
            const result = await this._exec('logcat -d -v threadtime *:E');

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
     * Save logcat filtered by app package
     */
    async saveLogcatApp() {
        try {
            const packageName = this._detectAppPackage();
            if (!packageName) {
                return { success: false, message: 'Could not detect app package. Make sure you have a Gradle project open.' };
            }

            const saveDir = this._getMediaDir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `logcat_${packageName.split('.').pop()}_${timestamp}.txt`;
            const localPath = path.join(saveDir, filename);

            // Get PID of the app
            let pid;
            try {
                pid = await this._exec(`shell pidof ${packageName}`);
                pid = pid.trim();
            } catch (e) {
                // App might not be running
            }

            let result;
            if (pid) {
                // Filter by PID
                result = await this._exec(`logcat -d -v threadtime --pid=${pid}`);
            } else {
                // Fallback: grep for package name in full logcat
                const fullLog = await this._exec('logcat -d -v threadtime');
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

    async installApk(apkPath) {
        try {
            const result = await this._exec(`install -r "${apkPath}"`);
            return { success: result.includes('Success'), message: result };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /**
     * Scan workspace for the latest debug APK
     */
    async findDebugApk() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return null;

        const glob = require('path');
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
     * Run gradlew assembleDebug in the workspace
     */
    async buildDebugApk() {
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
            const proc = exec(
                `"${gradlewPath}" assembleDebug`,
                { cwd: rootPath, timeout: 300000, maxBuffer: 1024 * 1024 * 10 },
                (error, stdout, stderr) => {
                    if (error) {
                        // Extract the most useful part of the error
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
     * Build then install debug APK
     */
    async buildAndInstall() {
        // Step 1: Build
        const buildResult = await this.buildDebugApk();
        if (!buildResult.success) {
            return { success: false, message: `Build failed: ${buildResult.message}` };
        }

        // Step 2: Find the APK
        const apkPath = await this.findDebugApk();
        if (!apkPath) {
            return { success: false, message: 'Build succeeded but APK not found' };
        }

        // Step 3: Install
        const installResult = await this.installApk(apkPath);
        return {
            success: installResult.success,
            message: installResult.success
                ? `Installed: ${path.basename(apkPath)}`
                : installResult.message,
            apkPath
        };
    }

    async listPackages(filter = '') {
        try {
            const cmd = filter ? `shell pm list packages | findstr ${filter}` : 'shell pm list packages -3';
            const result = await this._exec(cmd);
            return result.split('\n').map(l => l.replace('package:', '').trim()).filter(Boolean);
        } catch (err) {
            return [];
        }
    }

    async getStorageInfo() {
        try {
            const result = await this._exec('shell df /data');
            return result;
        } catch (err) {
            return 'N/A';
        }
    }

    dispose() {
        if (this._logcatTerminal) this._logcatTerminal.dispose();
        if (this._shellTerminal) this._shellTerminal.dispose();
        this._onStatusChanged.dispose();
    }
}

module.exports = AdbManager;
