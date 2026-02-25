const vscode = require('vscode');

class PhoneLinkViewProvider {
    constructor(extensionUri, adbManager) {
        this._extensionUri = extensionUri;
        this._adbManager = adbManager;
        this._view = null;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true
        };

        webviewView.webview.html = this._getHtml();

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'connect': {
                    const result = await this._adbManager.connect(message.ip, message.port || 5555);
                    this._postMessage({ command: 'connectResult', ...result });
                    if (result.success) {
                        this._postMessage({ command: 'deviceInfo', info: this._adbManager.deviceInfo });
                    }
                    break;
                }
                case 'disconnect': {
                    await this._adbManager.disconnect();
                    this._postMessage({ command: 'disconnected' });
                    break;
                }
                case 'screenshot': {
                    this._postMessage({ command: 'actionStatus', action: 'screenshot', status: 'running' });
                    const result = await this._adbManager.takeScreenshot();
                    this._postMessage({ command: 'actionStatus', action: 'screenshot', status: result.success ? 'done' : 'error', message: result.message || result.path });
                    if (result.success) {
                        vscode.window.showInformationMessage(`📸 Screenshot saved!`);
                    }
                    break;
                }
                case 'screenRecord': {
                    this._adbManager.startScreenRecord(message.duration || 30);
                    break;
                }
                case 'logcat': {
                    this._adbManager.openLogcat(message.filter || '');
                    break;
                }
                case 'saveLogcat': {
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
                    const result = await this._adbManager.saveLogcat();
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
                    if (result.success) {
                        vscode.window.showInformationMessage(`📋 Logcat saved (${result.lineCount} lines)`);
                    }
                    break;
                }
                case 'saveLogcatErrors': {
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
                    const result = await this._adbManager.saveLogcatErrors();
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
                    if (result.success) {
                        vscode.window.showInformationMessage(`🔴 Error log saved (${result.lineCount} lines)`);
                    }
                    break;
                }
                case 'saveLogcatApp': {
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: 'running' });
                    const result = await this._adbManager.saveLogcatApp();
                    this._postMessage({ command: 'actionStatus', action: 'logcat', status: result.success ? 'done' : 'error', message: result.message });
                    if (result.success) {
                        vscode.window.showInformationMessage(`📱 App log saved for ${result.packageName} (${result.lineCount} lines)`);
                    } else {
                        vscode.window.showErrorMessage(result.message);
                    }
                    break;
                }
                case 'shell': {
                    this._adbManager.openShell();
                    break;
                }
                case 'installApk': {
                    // Smart install: find latest debug APK automatically
                    this._postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
                    const apkPath = await this._adbManager.findDebugApk();
                    if (apkPath) {
                        const result = await this._adbManager.installApk(apkPath);
                        this._postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
                        if (result.success) {
                            const filename = require('path').basename(apkPath);
                            vscode.window.showInformationMessage(`📦 Installed: ${filename}`);
                        } else {
                            vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                        }
                    } else {
                        // Fallback to file picker
                        this._postMessage({ command: 'actionStatus', action: 'install', status: 'error', message: 'No APK found' });
                        const uris = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            filters: { 'APK Files': ['apk'] },
                            title: 'No debug APK found — select manually'
                        });
                        if (uris && uris[0]) {
                            this._postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
                            const result = await this._adbManager.installApk(uris[0].fsPath);
                            this._postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
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
                    this._postMessage({ command: 'actionStatus', action: 'build', status: 'running' });
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: '🔨 Building & Installing...',
                        cancellable: false
                    }, async () => {
                        const result = await this._adbManager.buildAndInstall();
                        this._postMessage({ command: 'actionStatus', action: 'build', status: result.success ? 'done' : 'error', message: result.message });
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
                        this._postMessage({ command: 'actionStatus', action: 'install', status: 'running' });
                        const result = await this._adbManager.installApk(uris[0].fsPath);
                        this._postMessage({ command: 'actionStatus', action: 'install', status: result.success ? 'done' : 'error', message: result.message });
                        if (result.success) {
                            vscode.window.showInformationMessage('📦 APK installed!');
                        } else {
                            vscode.window.showErrorMessage(`Install failed: ${result.message}`);
                        }
                    }
                    break;
                }
                case 'pair': {
                    this._postMessage({ command: 'pairStatus', status: 'running' });
                    const result = await this._adbManager.pair(message.ip, message.port, message.code);
                    this._postMessage({ command: 'pairResult', ...result });
                    if (result.success) {
                        vscode.window.showInformationMessage('🔗 Phone paired successfully!');
                    } else {
                        vscode.window.showErrorMessage(`Pairing failed: ${result.message}`);
                    }
                    break;
                }
                case 'refreshInfo': {
                    if (this._adbManager.connected) {
                        await this._adbManager._fetchDeviceInfo();
                        this._postMessage({ command: 'deviceInfo', info: this._adbManager.deviceInfo });
                    }
                    break;
                }
                case 'getState': {
                    const config = vscode.workspace.getConfiguration('phonelink');
                    this._postMessage({
                        command: 'state',
                        connected: this._adbManager.connected,
                        deviceInfo: this._adbManager.deviceInfo,
                        savedIp: config.get('defaultIp') || ''
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
                        const result = this._adbManager.cleanDebugMedia();
                        if (result.success) {
                            this._postMessage({ command: 'actionStatus', action: 'clean', status: 'done', message: result.message });
                            vscode.window.showInformationMessage(`🗑️ ${result.message}`);
                        } else {
                            vscode.window.showErrorMessage(result.message);
                        }
                    }
                    break;
                }
            }
        });

        // Listen for status changes
        this._adbManager.onStatusChanged((status) => {
            if (status.connected) {
                this._postMessage({ command: 'connected', deviceInfo: status.deviceInfo });
            } else {
                this._postMessage({ command: 'disconnected' });
            }
        });
    }

    _postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    updateStatus(connected, deviceInfo) {
        if (connected) {
            this._postMessage({ command: 'connected', deviceInfo });
        } else {
            this._postMessage({ command: 'disconnected' });
        }
    }

    _getHtml() {
        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PhoneLink</title>
    <style>
        :root {
            --accent: #7c4dff;
            --accent-hover: #651fff;
            --accent-glow: rgba(124, 77, 255, 0.3);
            --success: #00e676;
            --success-bg: rgba(0, 230, 118, 0.1);
            --error: #ff5252;
            --error-bg: rgba(255, 82, 82, 0.1);
            --warning: #ffab40;
            --surface: var(--vscode-editor-background);
            --surface-hover: var(--vscode-list-hoverBackground);
            --text: var(--vscode-foreground);
            --text-dim: var(--vscode-descriptionForeground);
            --border: var(--vscode-widget-border, rgba(255,255,255,0.08));
            --input-bg: var(--vscode-input-background);
            --input-border: var(--vscode-input-border, rgba(255,255,255,0.1));
            --btn-bg: var(--vscode-button-background);
            --btn-fg: var(--vscode-button-foreground);
            --btn-hover: var(--vscode-button-hoverBackground);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            font-size: 13px;
            color: var(--text);
            background: transparent;
            padding: 0;
            overflow-x: hidden;
        }

        /* ============ STATUS HEADER ============ */
        .status-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px 16px;
            background: linear-gradient(135deg, rgba(124, 77, 255, 0.08), rgba(124, 77, 255, 0.02));
            border-bottom: 1px solid var(--border);
            position: relative;
            overflow: hidden;
        }

        .status-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
            opacity: 0;
            transition: opacity 0.3s;
        }

        .status-header.connected::before {
            background: linear-gradient(90deg, transparent, var(--success), transparent);
            opacity: 1;
        }

        .phone-icon {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            background: rgba(124, 77, 255, 0.15);
            border: 1px solid rgba(124, 77, 255, 0.2);
            position: relative;
            flex-shrink: 0;
            transition: all 0.3s;
        }

        .connected .phone-icon {
            background: rgba(0, 230, 118, 0.15);
            border-color: rgba(0, 230, 118, 0.3);
            box-shadow: 0 0 12px rgba(0, 230, 118, 0.2);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--text-dim);
            position: absolute;
            bottom: -1px;
            right: -1px;
            border: 2px solid var(--surface);
            transition: all 0.3s;
        }

        .connected .status-dot {
            background: var(--success);
            box-shadow: 0 0 6px var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 6px rgba(0, 230, 118, 0.4); }
            50% { box-shadow: 0 0 12px rgba(0, 230, 118, 0.8); }
        }

        .status-text {
            flex: 1;
            min-width: 0;
        }

        .status-title {
            font-weight: 600;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .status-subtitle {
            font-size: 11px;
            color: var(--text-dim);
            margin-top: 2px;
        }

        /* ============ CONNECT SECTION ============ */
        .section {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border);
        }

        .section-title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            color: var(--text-dim);
            margin-bottom: 10px;
        }

        .connect-form {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .input-row {
            display: flex;
            gap: 8px;
        }

        .input-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .input-group.port {
            max-width: 80px;
        }

        .input-group label {
            font-size: 11px;
            color: var(--text-dim);
            font-weight: 500;
        }

        input {
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            color: var(--text);
            padding: 7px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            width: 100%;
        }

        input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px var(--accent-glow);
        }

        input::placeholder {
            color: var(--text-dim);
            opacity: 0.5;
        }

        .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 14px;
            border-radius: 6px;
            border: none;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }

        .btn-primary {
            background: var(--accent);
            color: white;
        }

        .btn-primary:hover {
            background: var(--accent-hover);
            box-shadow: 0 2px 8px var(--accent-glow);
            transform: translateY(-1px);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .btn-danger {
            background: rgba(255, 82, 82, 0.15);
            color: var(--error);
            border: 1px solid rgba(255, 82, 82, 0.2);
        }

        .btn-danger:hover {
            background: rgba(255, 82, 82, 0.25);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        .btn-full {
            width: 100%;
        }

        /* ============ DEVICE INFO ============ */
        .device-info {
            display: none;
        }

        .device-info.visible {
            display: block;
        }

        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .info-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px;
            transition: background 0.2s;
        }

        .info-card:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .info-card.full {
            grid-column: 1 / -1;
        }

        .info-label {
            font-size: 10px;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 4px;
        }

        .info-value {
            font-size: 13px;
            font-weight: 600;
            font-family: var(--vscode-editor-font-family, monospace);
        }

        /* ============ QUICK ACTIONS ============ */
        .actions-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .action-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 14px 8px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text);
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
        }

        .action-btn:hover {
            background: rgba(124, 77, 255, 0.1);
            border-color: rgba(124, 77, 255, 0.3);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .action-btn:active {
            transform: translateY(0);
        }

        .action-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            transform: none !important;
            box-shadow: none !important;
        }

        .action-icon {
            font-size: 22px;
            line-height: 1;
        }

        .action-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-dim);
        }

        /* ============ TOAST ============ */
        .toast {
            position: fixed;
            bottom: 16px;
            left: 16px;
            right: 16px;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 100;
        }

        .toast.visible {
            transform: translateY(0);
            opacity: 1;
        }

        .toast.success {
            background: var(--success-bg);
            border: 1px solid rgba(0, 230, 118, 0.3);
            color: var(--success);
        }

        .toast.error {
            background: var(--error-bg);
            border: 1px solid rgba(255, 82, 82, 0.3);
            color: var(--error);
        }

        /* ============ LOADING ============ */
        .loading-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .hidden { display: none !important; }

        /* ============ PAIR SECTION ============ */
        .section-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            padding: 4px 0;
            margin-bottom: 0;
        }

        .section-title-row:hover .collapse-icon {
            color: var(--accent);
        }

        .collapse-icon {
            font-size: 12px;
            color: var(--text-dim);
            transition: color 0.2s;
        }

        .pair-area {
            margin-top: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .pair-hint {
            font-size: 11px;
            color: var(--text-dim);
            line-height: 1.5;
            padding: 8px 10px;
            background: rgba(124, 77, 255, 0.06);
            border: 1px solid rgba(124, 77, 255, 0.15);
            border-radius: 6px;
        }

        /* ============ SCROLL ============ */
        ::-webkit-scrollbar {
            width: 6px;
        }

        ::-webkit-scrollbar-track {
            background: transparent;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>
    <!-- STATUS HEADER -->
    <div class="status-header" id="statusHeader">
        <div class="phone-icon">
            📱
            <div class="status-dot"></div>
        </div>
        <div class="status-text">
            <div class="status-title" id="statusTitle">Not Connected</div>
            <div class="status-subtitle" id="statusSubtitle">Enter port from Wireless Debugging</div>
        </div>
    </div>

    <!-- CONNECT SECTION -->
    <div class="section" id="connectSection">
        <div class="section-title">Connection</div>
        <div class="connect-form">
            <div class="input-row">
                <div class="input-group">
                    <label>IP Address</label>
                    <input type="text" id="ipInput" placeholder="192.168.1.xxx" spellcheck="false" value="192.168.1.108" />
                </div>
                <div class="input-group port">
                    <label>Port</label>
                    <input type="text" id="portInput" placeholder="xxxxx" value="" />
                </div>
            </div>
            <button class="btn btn-primary btn-full" id="connectBtn" onclick="handleConnect()">
                ⚡ Connect
            </button>
            <button class="btn btn-danger btn-full hidden" id="disconnectBtn" onclick="handleDisconnect()">
                Disconnect
            </button>
        </div>
    </div>

    <!-- PAIR SECTION (collapsible) -->
    <div class="section" id="pairSection">
        <div class="section-title-row" onclick="togglePair()">
            <div class="section-title" style="margin-bottom:0">� Pair New Device</div>
            <span class="collapse-icon" id="pairCollapseIcon">▸</span>
        </div>
        <div class="pair-area hidden" id="pairArea">
            <div class="pair-hint">From your phone: Developer Options → Wireless Debugging → Pair device with pairing code</div>
            <div class="input-row">
                <div class="input-group">
                    <label>Pairing Code</label>
                    <input type="text" id="pairCodeInput" placeholder="123456" spellcheck="false" />
                </div>
                <div class="input-group port">
                    <label>Port</label>
                    <input type="text" id="pairPortInput" placeholder="xxxxx" />
                </div>
            </div>
            <button class="btn btn-primary btn-full" id="pairBtn" onclick="handlePair()">
                Pair
            </button>
        </div>
    </div>

    <!-- DEVICE INFO -->
    <div class="section device-info" id="deviceInfoSection">
        <div class="section-title">Device</div>
        <div class="info-grid">
            <div class="info-card full">
                <div class="info-label">Model</div>
                <div class="info-value" id="infoModel">—</div>
            </div>
            <div class="info-card">
                <div class="info-label">Android</div>
                <div class="info-value" id="infoAndroid">—</div>
            </div>
            <div class="info-card">
                <div class="info-label">Battery</div>
                <div class="info-value" id="infoBattery">—</div>
            </div>
            <div class="info-card">
                <div class="info-label">Resolution</div>
                <div class="info-value" id="infoResolution">—</div>
            </div>
            <div class="info-card">
                <div class="info-label">IP</div>
                <div class="info-value" id="infoIp">—</div>
            </div>
        </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div class="section device-info" id="actionsSection">
        <div class="section-title">Media</div>
        <div class="actions-grid">
            <button class="action-btn" onclick="handleAction('screenshot')" id="btnScreenshot">
                <span class="action-icon">📸</span>
                <span class="action-label">Screenshot</span>
            </button>
            <button class="action-btn" onclick="handleAction('screenRecord')" id="btnRecord">
                <span class="action-icon">🎬</span>
                <span class="action-label">Record</span>
            </button>
        </div>

        <div class="section-title" style="margin-top:14px">Logs</div>
        <div class="actions-grid">
            <button class="action-btn" onclick="handleAction('logcat')">
                <span class="action-icon">📋</span>
                <span class="action-label">Live Logcat</span>
            </button>
            <button class="action-btn" onclick="handleAction('shell')">
                <span class="action-icon">💻</span>
                <span class="action-label">Shell</span>
            </button>
            <button class="action-btn" onclick="handleAction('saveLogcatErrors')">
                <span class="action-icon">🔴</span>
                <span class="action-label">Save Errors</span>
            </button>
            <button class="action-btn" onclick="handleAction('saveLogcatApp')">
                <span class="action-icon">📱</span>
                <span class="action-label">Save App Log</span>
            </button>
            <button class="action-btn" onclick="handleAction('saveLogcat')" style="grid-column: 1 / -1;">
                <span class="action-icon">💾</span>
                <span class="action-label">Save Full Logcat</span>
            </button>
        </div>

        <div class="section-title" style="margin-top:14px">Deploy</div>
        <div class="actions-grid">
            <button class="action-btn" onclick="handleAction('installApk')" id="btnInstall">
                <span class="action-icon">📦</span>
                <span class="action-label">Install APK</span>
            </button>
            <button class="action-btn" onclick="handleAction('buildAndInstall')" id="btnBuild">
                <span class="action-icon">🔨</span>
                <span class="action-label">Build & Install</span>
            </button>
            <button class="action-btn" onclick="handleAction('browseApk')" id="btnBrowse" style="grid-column: 1 / -1;">
                <span class="action-icon">📂</span>
                <span class="action-label">Browse APK</span>
            </button>
        </div>

        <div style="margin-top:14px">
            <button class="btn btn-danger btn-full" onclick="handleAction('cleanDebugMedia')" style="font-size:11px; padding:6px 10px;">
                🗑️ Clean Debug Media
            </button>
        </div>
    </div>

    <!-- TOAST -->
    <div class="toast" id="toast"></div>

    <script>
        const vscode = acquireVsCodeApi();
        
        const ipInput = document.getElementById('ipInput');
        const portInput = document.getElementById('portInput');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const statusHeader = document.getElementById('statusHeader');
        const statusTitle = document.getElementById('statusTitle');
        const statusSubtitle = document.getElementById('statusSubtitle');
        const deviceInfoSection = document.getElementById('deviceInfoSection');
        const actionsSection = document.getElementById('actionsSection');
        const pairArea = document.getElementById('pairArea');
        const pairCollapseIcon = document.getElementById('pairCollapseIcon');
        const pairBtn = document.getElementById('pairBtn');
        const pairCodeInput = document.getElementById('pairCodeInput');
        const pairPortInput = document.getElementById('pairPortInput');
        const pairSection = document.getElementById('pairSection');

        // Request initial state
        vscode.postMessage({ command: 'getState' });

        // Handle Enter key on port input to connect
        portInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleConnect();
        });

        // Auto-focus port field since IP is already filled
        setTimeout(() => { portInput.focus(); }, 300);

        function togglePair() {
            pairArea.classList.toggle('hidden');
            pairCollapseIcon.textContent = pairArea.classList.contains('hidden') ? '▸' : '▾';
            if (!pairArea.classList.contains('hidden')) {
                pairCodeInput.focus();
            }
        }

        function handleConnect() {
            const ip = ipInput.value.trim() || '192.168.1.108';
            const port = portInput.value.trim();

            if (!port) {
                showToast('Enter the port from Wireless Debugging', 'error');
                portInput.focus();
                return;
            }

            connectBtn.innerHTML = '<span class="loading-spinner"></span> Connecting...';
            connectBtn.disabled = true;

            // Save the IP (port changes every time, no point saving)
            vscode.postMessage({ command: 'saveIp', ip });
            vscode.postMessage({ command: 'connect', ip, port: parseInt(port) });
        }

        function handlePair() {
            const ip = ipInput.value.trim() || '192.168.1.108';
            const pairPort = pairPortInput.value.trim();
            const pairCode = pairCodeInput.value.trim();

            if (!pairPort || !pairCode) {
                showToast('Enter pairing port and code from your phone', 'error');
                if (!pairCode) pairCodeInput.focus();
                else pairPortInput.focus();
                return;
            }

            pairBtn.innerHTML = '<span class="loading-spinner"></span> Pairing...';
            pairBtn.disabled = true;

            vscode.postMessage({ command: 'pair', ip, port: parseInt(pairPort), code: pairCode });
        }

        function handleDisconnect() {
            vscode.postMessage({ command: 'disconnect' });
        }

        function handleAction(action) {
            if (action === 'screenRecord') {
                vscode.postMessage({ command: 'screenRecord', duration: 30 });
            } else {
                vscode.postMessage({ command: action });
            }
        }

        function setConnected(deviceInfo) {
            statusHeader.classList.add('connected');
            statusTitle.textContent = deviceInfo?.brand ? deviceInfo.brand + ' ' + (deviceInfo.model || '') : 'Connected';
            statusSubtitle.textContent = deviceInfo?.ip ? 'Connected • ' + deviceInfo.ip : 'Connected via WiFi';
            
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            connectBtn.innerHTML = '⚡ Connect';
            connectBtn.disabled = false;
            pairSection.classList.add('hidden');
            
            deviceInfoSection.classList.add('visible');
            actionsSection.classList.add('visible');
            
            if (deviceInfo) {
                document.getElementById('infoModel').textContent = (deviceInfo.brand || '') + ' ' + (deviceInfo.model || 'Unknown');
                document.getElementById('infoAndroid').textContent = 'v' + (deviceInfo.androidVersion || '?') + ' (SDK ' + (deviceInfo.sdkLevel || '?') + ')';
                document.getElementById('infoBattery').textContent = deviceInfo.battery || 'N/A';
                document.getElementById('infoResolution').textContent = deviceInfo.resolution || 'N/A';
                document.getElementById('infoIp').textContent = deviceInfo.ip || 'N/A';
            }
        }

        function setDisconnected() {
            statusHeader.classList.remove('connected');
            statusTitle.textContent = 'Not Connected';
            statusSubtitle.textContent = 'Enter port from Wireless Debugging';
            
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            connectBtn.innerHTML = '⚡ Connect';
            connectBtn.disabled = false;
            pairSection.classList.remove('hidden');
            
            deviceInfoSection.classList.remove('visible');
            actionsSection.classList.remove('visible');

            // Clear port field for next session (it changes every time)
            portInput.value = '';
            portInput.focus();
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type + ' visible';
            setTimeout(() => {
                toast.classList.remove('visible');
            }, 3000);
        }

        // Handle messages from extension
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.command) {
                case 'state':
                    if (msg.savedIp) {
                        ipInput.value = msg.savedIp;
                    }
                    if (msg.connected) {
                        setConnected(msg.deviceInfo);
                    }
                    break;
                case 'connectResult':
                    if (msg.success) {
                        showToast('Connected successfully!', 'success');
                    } else {
                        connectBtn.innerHTML = '⚡ Connect';
                        connectBtn.disabled = false;
                        showToast(msg.message || 'Connection failed', 'error');
                    }
                    break;
                case 'pairResult':
                    pairBtn.innerHTML = 'Pair';
                    pairBtn.disabled = false;
                    if (msg.success) {
                        showToast('Paired successfully! Now connect.', 'success');
                        pairCodeInput.value = '';
                        pairPortInput.value = '';
                        // Auto-collapse pair section after success
                        pairArea.classList.add('hidden');
                        pairCollapseIcon.textContent = '▸';
                        portInput.focus();
                    } else {
                        showToast(msg.message || 'Pairing failed', 'error');
                    }
                    break;
                case 'connected':
                    setConnected(msg.deviceInfo);
                    break;
                case 'deviceInfo':
                    setConnected(msg.info);
                    break;
                case 'disconnected':
                    setDisconnected();
                    showToast('Disconnected', 'success');
                    break;
                case 'actionStatus':
                    if (msg.status === 'done') {
                        showToast(msg.action + ' completed!', 'success');
                    } else if (msg.status === 'error') {
                        showToast(msg.message || 'Action failed', 'error');
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

module.exports = PhoneLinkViewProvider;
