const { adbExec } = require('./helpers');

/**
 * Fetch detailed device information (model, brand, battery, etc.)
 * @param {object} state - Mutable connection state (writes to state.deviceInfo)
 */
async function fetchDeviceInfo(state) {
    try {
        const [model, brand, androidVersion, sdk, battery, resolution, serialNo] = await Promise.all([
            adbExec('shell getprop ro.product.model', state).catch(() => 'Unknown'),
            adbExec('shell getprop ro.product.brand', state).catch(() => 'Unknown'),
            adbExec('shell getprop ro.build.version.release', state).catch(() => 'Unknown'),
            adbExec('shell getprop ro.build.version.sdk', state).catch(() => 'Unknown'),
            adbExec('shell dumpsys battery', state).catch(() => ''),
            adbExec('shell wm size', state).catch(() => ''),
            adbExec('get-serialno', state).catch(() => 'Unknown')
        ]);

        // Parse battery level
        let batteryLevel = 'N/A';
        const batteryMatch = battery.match(/level:\s*(\d+)/);
        if (batteryMatch) batteryLevel = batteryMatch[1] + '%';

        // Parse resolution
        let res = 'N/A';
        const resMatch = resolution.match(/Physical size:\s*(.+)/);
        if (resMatch) res = resMatch[1];

        state.deviceInfo = {
            model: model,
            brand: brand.charAt(0).toUpperCase() + brand.slice(1),
            androidVersion: androidVersion,
            sdkLevel: sdk,
            battery: batteryLevel,
            resolution: res,
            serial: serialNo,
            ip: state.currentIp,
            connectionType: state.connectionType
        };
    } catch (err) {
        state.deviceInfo = { model: 'Unknown Device', brand: 'Unknown', ip: state.currentIp, connectionType: state.connectionType };
    }
}

/**
 * List installed packages on the device.
 */
async function listPackages(state, filter = '') {
    try {
        const cmd = filter ? `shell pm list packages | findstr ${filter}` : 'shell pm list packages -3';
        const result = await adbExec(cmd, state);
        return result.split('\n').map(l => l.replace('package:', '').trim()).filter(Boolean);
    } catch (err) {
        return [];
    }
}

/**
 * Get storage info from the device.
 */
async function getStorageInfo(state) {
    try {
        const result = await adbExec('shell df /data', state);
        return result;
    } catch (err) {
        return 'N/A';
    }
}

module.exports = {
    fetchDeviceInfo,
    listPackages,
    getStorageInfo
};
