const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./messageHandler');

class PhoneLinkViewProvider {
    constructor(extensionUri, adbManager) {
        this._extensionUri = extensionUri;
        this._adbManager = adbManager;
        this._view = null;
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Handle messages from webview — delegated to messageHandler
        webviewView.webview.onDidReceiveMessage(
            (message) => handleMessage(message, this._adbManager, (msg) => this._postMessage(msg))
        );

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

    /**
     * Build the webview HTML by loading external files and injecting webview URIs.
     */
    _getHtml(webview) {
        const webviewDir = path.join(this._extensionUri.fsPath, 'src', 'views', 'webview');

        // Create webview URIs for CSS and JS
        const stylesUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewDir, 'styles.css'))
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewDir, 'main.js'))
        );

        // Read the HTML template
        const htmlPath = path.join(webviewDir, 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Replace placeholders with actual webview URIs
        html = html.replace('{{stylesUri}}', stylesUri.toString());
        html = html.replace('{{scriptUri}}', scriptUri.toString());

        return html;
    }
}

module.exports = PhoneLinkViewProvider;
