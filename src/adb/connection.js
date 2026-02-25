const { adbExec } = require('./helpers');

/**
 * Connect to a device over WiFi.
 * @param {string} ip
 * @param {number} port
 * @param {object} state - Mutable connection state
 * @param {Function} fetchDeviceInfo - Callback to fetch device info after connection
 * @param {Function} fireStatusChanged - Callback to fire status change event
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function connect(ip, port, state, fetchDeviceInfo, fireStatusChanged) {
    try {
        state.currentIp = ip;
        state.currentPort = port;
        state.deviceSerial = '';
        state.connectionType = 'wifi';

        const result = await adbExec(`connect ${ip}:${port}`, state, { useDevice: false });

        if (result.includes('connected') || result.includes('already connected')) {
            state.connected = true;
            await fetchDeviceInfo();
            fireStatusChanged({ connected: true, deviceInfo: state.deviceInfo });
            return { success: true, message: result };
        } else {
            return { success: false, message: result };
        }
    } catch (err) {
        return { success: false, message: err.message };
    }
}

/**
 * Connect to a USB device by serial number.
 */
async function connectUsb(serial, state, getDevices, fetchDeviceInfo, fireStatusChanged) {
    try {
        state.deviceSerial = serial;
        state.currentIp = '';
        state.currentPort = 5555;
        state.connectionType = 'usb';

        const devices = await getDevices();
        const found = devices.find(d => d.id === serial && d.status === 'device');

        if (found) {
            state.connected = true;
            await fetchDeviceInfo();
            fireStatusChanged({ connected: true, deviceInfo: state.deviceInfo });
            return { success: true, message: `Connected to ${serial} via USB` };
        } else {
            state.deviceSerial = '';
            state.connectionType = '';
            return { success: false, message: `Device ${serial} not found or not authorized` };
        }
    } catch (err) {
        state.deviceSerial = '';
        state.connectionType = '';
        return { success: false, message: err.message };
    }
}

/**
 * Pair with a device using a pairing code.
 */
async function pair(ip, port, code, state) {
    try {
        const { exec } = require('child_process');
        const { getAdbPath } = require('./helpers');
        const adb = getAdbPath();

        return new Promise((resolve) => {
            exec(`${adb} pair ${ip}:${port} ${code}`, { timeout: 30000 }, (error, stdout, stderr) => {
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

/**
 * Disconnect from the current device.
 */
async function disconnect(state, fireStatusChanged) {
    try {
        if (state.connectionType === 'wifi' && state.currentIp) {
            await adbExec(`disconnect ${state.currentIp}:${state.currentPort}`, state, { useDevice: false });
        }
    } catch (err) {
        // swallow — we still want to reset state
    }
    state.connected = false;
    state.deviceInfo = null;
    state.deviceSerial = '';
    state.connectionType = '';
    fireStatusChanged({ connected: false });
    return { success: true, message: 'Disconnected' };
}

/**
 * Check whether the current device is still connected.
 */
async function checkConnection(state, fetchDeviceInfo, fireStatusChanged) {
    try {
        const result = await adbExec('devices', state, { useDevice: false });
        const lines = result.split('\n').filter(l => l.includes('device') && !l.includes('List'));

        const identifier = state.connectionType === 'usb' ? state.deviceSerial : state.currentIp;
        if (lines.length > 0 && identifier) {
            const isConnected = lines.some(l => l.includes(identifier));
            if (isConnected !== state.connected) {
                state.connected = isConnected;
                if (isConnected) {
                    await fetchDeviceInfo();
                } else {
                    state.deviceInfo = null;
                }
                fireStatusChanged({ connected: isConnected, deviceInfo: state.deviceInfo });
            }
        }

        return { connected: state.connected, devices: lines };
    } catch (err) {
        return { connected: false, devices: [] };
    }
}

/**
 * List all attached ADB devices.
 */
async function getDevices(state) {
    try {
        const result = await adbExec('devices -l', state, { useDevice: false });
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

module.exports = {
    connect,
    connectUsb,
    pair,
    disconnect,
    checkConnection,
    getDevices
};
