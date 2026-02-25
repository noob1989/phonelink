// @ts-nocheck
/* eslint-disable no-undef */
// This script runs inside the VS Code webview context.
// `acquireVsCodeApi` is provided by VS Code's webview runtime.

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

const tabWifi = document.getElementById('tabWifi');
const tabUsb = document.getElementById('tabUsb');
const wifiForm = document.getElementById('wifiForm');
const usbForm = document.getElementById('usbForm');
const usbDeviceList = document.getElementById('usbDeviceList');
const scanBtn = document.getElementById('scanBtn');

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

function switchTab(tab) {
    if (tab === 'wifi') {
        tabWifi.classList.add('active');
        tabUsb.classList.remove('active');
        wifiForm.classList.remove('hidden');
        usbForm.classList.add('hidden');
    } else {
        tabUsb.classList.add('active');
        tabWifi.classList.remove('active');
        usbForm.classList.remove('hidden');
        wifiForm.classList.add('hidden');
        handleScan(); // auto-scan when switching to USB
    }
}

function handleScan() {
    scanBtn.innerHTML = '<span class="loading-spinner"></span> Scanning...';
    scanBtn.disabled = true;
    usbDeviceList.innerHTML = '<div class="usb-empty">Scanning for devices...</div>';
    vscode.postMessage({ command: 'scanDevices' });
}

function connectUsb(serial) {
    vscode.postMessage({ command: 'connectUsb', serial });
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
    const connType = deviceInfo?.connectionType === 'usb' ? 'USB' : 'WiFi';
    statusSubtitle.textContent = deviceInfo?.ip
        ? 'Connected via ' + connType + ' • ' + deviceInfo.ip
        : 'Connected via ' + connType;

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
        document.getElementById('infoIp').textContent = deviceInfo.ip || deviceInfo.serial || 'N/A';
    }
}

function setDisconnected() {
    statusHeader.classList.remove('connected');
    statusTitle.textContent = 'Not Connected';
    statusSubtitle.textContent = 'Enter IP or plug in via USB';

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

function renderUsbDevices(devices) {
    const list = document.getElementById('usbDeviceList');
    if (!devices || devices.length === 0) {
        list.innerHTML = '<div class="usb-empty">No devices found. Ensure USB debugging is on.</div>';
        return;
    }

    let html = '';
    devices.forEach(d => {
        const bg = d.status === 'device' ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 171, 64, 0.2)';
        const color = d.status === 'device' ? 'var(--success)' : 'var(--warning)';
        const name = d.info ? d.info.replace(/model:/g, '').replace(/device:/g, '') : 'Unknown Device';

        html += '<div class="usb-item" onclick="connectUsb(\'' + d.id + '\')">' +
            '<div>' +
            '<div class="usb-item-title">' + name + '</div>' +
            '<div class="usb-item-sub">' + d.id + '</div>' +
            '</div>' +
            '<div class="usb-badge" style="background: ' + bg + '; color: ' + color + '">' +
            d.status +
            '</div>' +
            '</div>';
    });
    list.innerHTML = html;
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
            if (msg.devices) {
                renderUsbDevices(msg.devices);
            }
            break;
        case 'deviceList':
            scanBtn.innerHTML = '🔍 Scan for Devices';
            scanBtn.disabled = false;
            renderUsbDevices(msg.devices);
            break;
        case 'connectingUsb':
            scanBtn.innerHTML = '<span class="loading-spinner"></span> Connecting...';
            scanBtn.disabled = true;
            Array.from(document.querySelectorAll('.usb-item')).forEach(el => el.style.opacity = '0.5');
            break;
        case 'connectResult':
            if (msg.success) {
                showToast('Connected successfully!', 'success');
            } else {
                connectBtn.innerHTML = '⚡ Connect';
                connectBtn.disabled = false;
                scanBtn.innerHTML = '🔍 Scan for Devices';
                scanBtn.disabled = false;
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
