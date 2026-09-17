/**
 * 侧边栏 MCP Server 配置 Webview：状态、开关、端口、API Key、记录上限。
 */
import * as vscode from 'vscode';
import { escapeHtml } from '../mcp/html';
import { buildMcpClientConfigJson, DEFAULT_MCP_PORT } from '../mcp/mcpConfig';
import { McpServerController, McpServerStatus } from '../mcp/mcpServerController';

function configJsonFromStatus(status: McpServerStatus): string {
  return buildMcpClientConfigJson(status.port ?? status.preferredPort ?? DEFAULT_MCP_PORT, status.apiKey);
}

export class McpServerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'mcpServerView';

  private view: vscode.WebviewView | undefined;
  private readonly statusListener: vscode.Disposable;
  private readonly messageListener: vscode.Disposable[] = [];

  constructor(
    private readonly controller: McpServerController,
    private readonly onViewLogs: () => void,
  ) {
    this.statusListener = controller.onDidChangeStatus((status) => this.postState(status));
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = renderHtml(this.controller.getStatus());

    const listener = webviewView.webview.onDidReceiveMessage(
      (message: { type?: string; value?: unknown }) => {
        void this.onMessage(message);
      },
    );
    this.messageListener.push(listener);
    this.messageListener.push(
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
    );
  }

  dispose(): void {
    this.statusListener.dispose();
    for (const item of this.messageListener) {
      item.dispose();
    }
  }

  private postState(status: McpServerStatus): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({ type: 'state', state: status });
  }

  private async onMessage(message: { type?: string; value?: unknown }): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.postState(this.controller.getStatus());
        return;
      case 'setEnabled':
        await this.controller.setEnabled(message.value === true);
        return;
      case 'setPort':
        if (typeof message.value === 'number') {
          await this.controller.setPort(message.value);
        }
        return;
      case 'setApiKey':
        if (typeof message.value === 'string') {
          await this.controller.setApiKey(message.value);
        }
        return;
      case 'generateApiKey':
        await this.controller.generateApiKey();
        return;
      case 'setMaxLogEntries':
        if (typeof message.value === 'number') {
          await this.controller.setMaxLogEntries(message.value);
        }
        return;
      case 'viewLogs':
        this.onViewLogs();
        return;
      case 'copyEndpoint': {
        const endpoint = this.controller.getStatus().endpoint;
        const clipboard = (vscode.env as { clipboard?: { writeText(value: string): Thenable<void> } }).clipboard;
        if (endpoint && clipboard) {
          await clipboard.writeText(endpoint);
        }
        return;
      }
      case 'copyConfig': {
        const clipboard = (vscode.env as { clipboard?: { writeText(value: string): Thenable<void> } }).clipboard;
        if (clipboard) {
          await clipboard.writeText(configJsonFromStatus(this.controller.getStatus()));
        }
        return;
      }
      default:
        return;
    }
  }
}

function renderHtml(initial: McpServerStatus): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: transparent;
      margin: 0;
      padding: 10px 12px 16px;
      font-size: 12px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .label { color: var(--vscode-descriptionForeground); }
    .status { font-weight: 600; }
    .status.running { color: var(--vscode-testing-iconPassed, #3fb950); }
    .status.stop { color: var(--vscode-errorForeground); }
    .endpoint {
      color: var(--vscode-textLink-foreground);
      word-break: break-all;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    .reason { color: var(--vscode-descriptionForeground); margin: -4px 0 10px; }
    input[type="number"], input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      font-family: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      padding: 4px 6px;
    }
    .field { margin-bottom: 10px; }
    .field label { display: block; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
    .key-row { display: flex; gap: 6px; }
    .key-row input { flex: 1; }
    button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    button.primary {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 8px;
      margin-top: 4px;
    }
    .config-json {
      margin: 0;
      padding: 8px;
      overflow: auto;
      max-height: 180px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      line-height: 1.4;
      white-space: pre;
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-editor-foreground);
    }
    .switch {
      position: relative;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      inset: 0;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      cursor: pointer;
    }
    .slider:before {
      content: '';
      position: absolute;
      height: 14px;
      width: 14px;
      left: 2px;
      top: 2px;
      background: var(--vscode-foreground);
      border-radius: 50%;
    }
    .switch input:checked + .slider {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }
    .switch input:checked + .slider:before {
      transform: translateX(16px);
      background: var(--vscode-button-foreground);
    }
  </style>
</head>
<body>
  <div class="row">
    <span class="label">Status</span>
    <span id="status" class="status ${escapeHtml(initial.status)}">${escapeHtml(initial.status)}</span>
  </div>
  <div id="endpoint" class="endpoint">${escapeHtml(initial.endpoint ?? '')}</div>
  <div id="reason" class="reason">${escapeHtml(initial.reason ?? '')}</div>
  <div class="row">
    <span class="label">Enable MCP Server</span>
    <label class="switch">
      <input id="enabled" type="checkbox" ${initial.enabled ? 'checked' : ''} />
      <span class="slider"></span>
    </label>
  </div>
  <div class="field">
    <label for="port">Port</label>
    <input id="port" type="number" min="1" max="65535" value="${initial.preferredPort}" />
  </div>
  <div class="field">
    <label for="apiKey">API Key (empty = no auth)</label>
    <div class="key-row">
      <input id="apiKey" type="text" spellcheck="false" value="${escapeHtml(initial.apiKey)}" />
      <button id="generate" title="Generate a random 32-character key">Generate</button>
    </div>
  </div>
  <div class="field">
    <label for="maxLogEntries">Call log limit</label>
    <input id="maxLogEntries" type="number" min="1" value="${initial.maxLogEntries}" />
  </div>
  <div class="field">
    <div class="row">
      <span class="label">MCP config</span>
      <button id="copyConfig" type="button">Copy</button>
    </div>
    <pre id="mcpConfig" class="config-json">${escapeHtml(configJsonFromStatus(initial))}</pre>
  </div>
  <button class="primary" id="viewLogs">View call logs</button>
  <script>
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');
    const endpointEl = document.getElementById('endpoint');
    const reasonEl = document.getElementById('reason');
    const enabledEl = document.getElementById('enabled');
    const portEl = document.getElementById('port');
    const apiKeyEl = document.getElementById('apiKey');
    const maxEl = document.getElementById('maxLogEntries');
    const mcpConfigEl = document.getElementById('mcpConfig');
    const copyConfigEl = document.getElementById('copyConfig');

    function buildConfigJson(state) {
      const port = state.port || state.preferredPort || ${DEFAULT_MCP_PORT};
      return JSON.stringify({
        js_runner_kit: {
          url: 'http://127.0.0.1:' + port + '/mcp',
          headers: {
            'api-key': state.apiKey || ''
          }
        }
      }, null, 4);
    }

    function applyState(state) {
      statusEl.textContent = state.status;
      statusEl.className = 'status ' + state.status;
      endpointEl.textContent = state.endpoint || '';
      reasonEl.textContent = state.reason || '';
      enabledEl.checked = Boolean(state.enabled);
      if (document.activeElement !== portEl) {
        portEl.value = state.preferredPort;
      }
      if (document.activeElement !== apiKeyEl) {
        apiKeyEl.value = state.apiKey || '';
      }
      if (document.activeElement !== maxEl) {
        maxEl.value = state.maxLogEntries;
      }
      mcpConfigEl.textContent = buildConfigJson(state);
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'state') {
        applyState(event.data.state);
      }
    });

    enabledEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'setEnabled', value: enabledEl.checked });
    });
    function commitPort() {
      const port = Number(portEl.value);
      if (Number.isFinite(port)) {
        vscode.postMessage({ type: 'setPort', value: port });
      }
    }
    portEl.addEventListener('change', commitPort);
    portEl.addEventListener('blur', commitPort);
    apiKeyEl.addEventListener('change', () => {
      vscode.postMessage({ type: 'setApiKey', value: apiKeyEl.value });
    });
    document.getElementById('generate').addEventListener('click', () => {
      vscode.postMessage({ type: 'generateApiKey' });
    });
    function commitMax() {
      const value = Number(maxEl.value);
      if (Number.isFinite(value)) {
        vscode.postMessage({ type: 'setMaxLogEntries', value });
      }
    }
    maxEl.addEventListener('change', commitMax);
    maxEl.addEventListener('blur', commitMax);
    document.getElementById('viewLogs').addEventListener('click', () => {
      vscode.postMessage({ type: 'viewLogs' });
    });
    endpointEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyEndpoint' });
    });
    copyConfigEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyConfig' });
      const previous = copyConfigEl.textContent;
      copyConfigEl.textContent = 'Copied';
      setTimeout(() => {
        copyConfigEl.textContent = previous;
      }, 1200);
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
