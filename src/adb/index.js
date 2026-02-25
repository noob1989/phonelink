const vscode = require('vscode');
const connection = require('./connection');
const deviceInfoModule = require('./deviceInfo');
const mediaCapture = require('./mediaCapture');
const logcat = require('./logcat');
const apkManager = require('./apkManager');

/**
 * AdbManager — orchestrates all ADB functionality.
 *
 * This is a slim facade that delegates to focused sub-modules:
 *   - connection.js   — connect, disconnect, pair, device listing
 *   - deviceInfo.js   — device info, packages, storage
 *   - mediaCapture.js — screenshot, screen record, wake, stay-awake
 *   - logcat.js       — logcat terminals + file saves
 *   - apkManager.js   — APK install, find, build
 */
class AdbManager {
    constructor() {
        // Shared mutable state — passed by reference to all sub-modules
        this._state = {
            connected: false,
            deviceInfo: null,
            currentIp: '',
            currentPort: 5555,
            deviceSerial: '',
            connectionType: '',
        };

        this._onStatusChanged = new vscode.EventEmitter();
        this.onStatusChanged = this._onStatusChanged.event;

        // Terminal references for logcat/shell
        this._terminals = {
            logcat: null,
            shell: null
        };
    }

    // ── Getters (preserve original API) ──────────────────────────

    get connected() { return this._state.connected; }
    get deviceInfo() { return this._state.deviceInfo; }
    get currentIp() { return this._state.currentIp; }
    get connectionType() { return this._state.connectionType; }

    // Expose state setters for extension.js reconnect logic
    set _connected(v) { this._state.connected = v; }
    set _currentIp(v) { this._state.currentIp = v; }
    set _currentPort(v) { this._state.currentPort = v; }
    set _deviceSerial(v) { this._state.deviceSerial = v; }
    set _connectionType(v) { this._state.connectionType = v; }

    // ── Connection ───────────────────────────────────────────────

    connect(ip, port = 5555) {
        return connection.connect(ip, port, this._state,
            () => this._fetchDeviceInfo(),
            (s) => this._onStatusChanged.fire(s)
        );
    }

    connectUsb(serial) {
        return connection.connectUsb(serial, this._state,
            () => this.getDevices(),
            () => this._fetchDeviceInfo(),
            (s) => this._onStatusChanged.fire(s)
        );
    }

    pair(ip, port, code) {
        return connection.pair(ip, port, code, this._state);
    }

    disconnect() {
        return connection.disconnect(this._state, (s) => this._onStatusChanged.fire(s));
    }

    checkConnection() {
        return connection.checkConnection(this._state,
            () => this._fetchDeviceInfo(),
            (s) => this._onStatusChanged.fire(s)
        );
    }

    getDevices() {
        return connection.getDevices(this._state);
    }

    // ── Device Info ──────────────────────────────────────────────

    _fetchDeviceInfo() {
        return deviceInfoModule.fetchDeviceInfo(this._state);
    }

    listPackages(filter = '') {
        return deviceInfoModule.listPackages(this._state, filter);
    }

    getStorageInfo() {
        return deviceInfoModule.getStorageInfo(this._state);
    }

    // ── Media Capture ────────────────────────────────────────────

    cleanDebugMedia() {
        return mediaCapture.cleanDebugMedia();
    }

    takeScreenshot() {
        return mediaCapture.takeScreenshot(this._state);
    }

    startScreenRecord(duration = 30) {
        return mediaCapture.startScreenRecord(this._state, duration);
    }

    wakeScreen() {
        return mediaCapture.wakeScreen(this._state);
    }

    toggleStayAwake() {
        return mediaCapture.toggleStayAwake(this._state);
    }

    // ── Logcat & Shell ───────────────────────────────────────────

    openLogcat(filter = '') {
        logcat.openLogcat(this._state, this._terminals, filter);
    }

    openShell() {
        logcat.openShell(this._state, this._terminals);
    }

    saveLogcat() {
        return logcat.saveLogcat(this._state);
    }

    saveLogcatErrors() {
        return logcat.saveLogcatErrors(this._state);
    }

    saveLogcatApp() {
        return logcat.saveLogcatApp(this._state);
    }

    // ── APK Management ───────────────────────────────────────────

    installApk(apkPath) {
        return apkManager.installApk(this._state, apkPath);
    }

    findDebugApk() {
        return apkManager.findDebugApk();
    }

    buildDebugApk() {
        return apkManager.buildDebugApk();
    }

    buildAndInstall() {
        return apkManager.buildAndInstall(this._state);
    }

    // ── Lifecycle ────────────────────────────────────────────────

    dispose() {
        if (this._terminals.logcat) this._terminals.logcat.dispose();
        if (this._terminals.shell) this._terminals.shell.dispose();
        this._onStatusChanged.dispose();
    }
}

module.exports = AdbManager;
