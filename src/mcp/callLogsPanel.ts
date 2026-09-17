/**
 * 编辑器区 MCP 调用记录面板。
 */
import * as vscode from 'vscode';
import { CallLogPage, CallLogStore, McpCallLog } from './callLogStore';
import { escapeHtml, summarizeJson } from './html';

const PAGE_SIZE = 100;
const PANEL_ID = 'jsRunnerMcpCallLogs';

let openPanel: vscode.WebviewPanel | undefined;

export function showMcpCallLogs(
  callLogStore: CallLogStore,
  context: vscode.ExtensionContext,
): void {
  if (openPanel) {
    openPanel.reveal(vscode.ViewColumn.Active);
    return;
  }

  let offset = 0;
  let toolFilter = '';

  const panel = vscode.window.createWebviewPanel(
    PANEL_ID,
    'MCP Call Logs',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const render = (): void => {
    const page = callLogStore.list({
      offset,
      limit: PAGE_SIZE,
      tool: toolFilter || undefined,
    });
    panel.webview.html = renderHtml(page, toolFilter);
  };

  render();
  openPanel = panel;

  const changeListener = callLogStore.onDidChange(() => render());
  panel.onDidDispose(() => {
    changeListener.dispose();
    openPanel = undefined;
  });

  panel.webview.onDidReceiveMessage((message: { type?: string; offset?: number; tool?: string }) => {
    if (message.type === 'page' && typeof message.offset === 'number') {
      offset = Math.max(0, message.offset);
      render();
      return;
    }
    if (message.type === 'filter') {
      toolFilter = typeof message.tool === 'string' ? message.tool.trim() : '';
      offset = 0;
      render();
    }
  });

  context.subscriptions.push(panel);
}

function renderRows(entries: McpCallLog[]): string {
  if (entries.length === 0) {
    return '<tr><td colspan="6" class="empty">No call records yet.</td></tr>';
  }
  return entries
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleString();
      const statusClass = entry.status === 'ok' ? 'ok' : 'error';
      const detail = entry.status === 'ok' ? summarizeJson(entry.result) : entry.error ?? '';
      return `<tr>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(entry.tool)}</td>
        <td class="${statusClass}">${escapeHtml(entry.status)}</td>
        <td>${entry.durationMs}ms</td>
        <td><code>${escapeHtml(summarizeJson(entry.arguments))}</code></td>
        <td><code>${escapeHtml(detail)}</code></td>
      </tr>`;
    })
    .join('');
}

function renderHtml(page: CallLogPage, toolFilter: string): string {
  const prevOffset = Math.max(0, page.offset - page.limit);
  const nextOffset = page.offset + page.limit;
  const canPrev = page.offset > 0;
  const canNext = nextOffset < page.total;
  const rangeStart = page.total === 0 ? 0 : page.offset + 1;
  const rangeEnd = Math.min(page.offset + page.entries.length, page.total);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MCP Call Logs</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
    }
    h1 { font-size: 1.2rem; margin: 0 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
    .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    input {
      font-family: inherit;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      padding: 4px 8px;
    }
    button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
      padding: 4px 8px;
      cursor: pointer;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; }
    code { font-size: 11px; word-break: break-all; }
    .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
    .error { color: var(--vscode-errorForeground); }
    .empty { color: var(--vscode-descriptionForeground); padding: 24px 0; }
  </style>
</head>
<body>
  <h1>MCP Call Logs</h1>
  <div class="meta">Showing ${rangeStart}–${rangeEnd} of ${page.total}. Records are kept in memory and cleared when the extension reloads.</div>
  <div class="toolbar">
    <label>Tool <input id="toolFilter" value="${escapeHtml(toolFilter)}" placeholder="jsRunner_runNpmScript" /></label>
    <button id="applyFilter">Filter</button>
    <button id="prev" ${canPrev ? '' : 'disabled'}>Previous</button>
    <button id="next" ${canNext ? '' : 'disabled'}>Next</button>
  </div>
  <table>
    <thead>
      <tr><th>Time</th><th>Tool</th><th>Status</th><th>Duration</th><th>Arguments</th><th>Result</th></tr>
    </thead>
    <tbody>${renderRows(page.entries)}</tbody>
  </table>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('applyFilter').addEventListener('click', () => {
      vscode.postMessage({ type: 'filter', tool: document.getElementById('toolFilter').value });
    });
    document.getElementById('toolFilter').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        vscode.postMessage({ type: 'filter', tool: event.target.value });
      }
    });
    document.getElementById('prev').addEventListener('click', () => {
      vscode.postMessage({ type: 'page', offset: ${prevOffset} });
    });
    document.getElementById('next').addEventListener('click', () => {
      vscode.postMessage({ type: 'page', offset: ${nextOffset} });
    });
  </script>
</body>
</html>`;
}
