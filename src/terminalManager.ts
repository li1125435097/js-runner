/**
 * 终端生命周期管理：创建/停止终端、追踪运行中的脚本，并通知 UI 刷新。
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { RunMode, RunningScript } from './types';

let nextTerminalId = 1;

export class TerminalManager implements vscode.Disposable {
  /** 所有运行中脚本，key 为自增终端 ID */
  private readonly runningScripts = new Map<string, RunningScript>();
  /** 同一 JS 文件可能对应多个终端（new 模式），用于 replace 模式批量停止 */
  private readonly filePathToTerminalIds = new Map<string, Set<string>>();
  private readonly _onDidChangeRunningScripts = new vscode.EventEmitter<void>();
  readonly onDidChangeRunningScripts = this._onDidChangeRunningScripts.event;
  private readonly closeTerminalListener: vscode.Disposable;

  constructor() {
    // 用户手动关闭终端时，同步清理内部追踪状态
    this.closeTerminalListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
      for (const [id, script] of this.runningScripts) {
        if (script.terminal === closedTerminal) {
          this.removeRunningScript(id);
          break;
        }
      }
    });
  }

  /** 运行当前编辑器中的 JS/JSX 文件 */
  runCurrentFile(mode: RunMode): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const { document } = editor;
    if (document.languageId !== 'javascript' && document.languageId !== 'javascriptreact') {
      void vscode.window.showWarningMessage('JS Runner only supports JavaScript files.');
      return;
    }

    this.runJsFile(document.fileName, mode);
  }

  /** 在终端中执行 node 命令运行指定 JS 文件 */
  runJsFile(filePath: string, mode: RunMode): void {
    if (mode === 'replace') {
      this.stopTerminalsForFile(filePath);
    }

    const fileName = path.basename(filePath);
    const dir = path.dirname(filePath);
    const terminal = vscode.window.createTerminal({
      name: `JS: ${fileName}`,
      cwd: dir,
    });

    terminal.show();
    terminal.sendText(`node "${filePath}"`);

    this.trackRunningScript({
      terminal,
      name: fileName,
      type: 'js',
      filePath,
    });
  }

  /** 在 package.json 所在目录执行 npm run */
  runNpmScript(name: string, packageJsonPath: string): void {
    const dir = path.dirname(packageJsonPath);
    const terminal = vscode.window.createTerminal({
      name: `npm: ${name}`,
      cwd: dir,
    });

    terminal.show();
    terminal.sendText(`npm run ${name}`);

    this.trackRunningScript({
      terminal,
      name,
      type: 'npm',
      packageJsonPath,
    });
  }

  stopAll(): void {
    for (const script of this.runningScripts.values()) {
      script.terminal.dispose();
    }
    this.runningScripts.clear();
    this.filePathToTerminalIds.clear();
    this._onDidChangeRunningScripts.fire();
  }

  stopTerminal(terminalId: string): void {
    const script = this.runningScripts.get(terminalId);
    if (!script) {
      return;
    }

    script.terminal.dispose();
    this.removeRunningScript(terminalId);
  }

  getRunningScripts(): RunningScript[] {
    return Array.from(this.runningScripts.values());
  }

  dispose(): void {
    this.closeTerminalListener.dispose();
    this._onDidChangeRunningScripts.dispose();
  }

  /** 登记新终端并触发运行列表更新 */
  private trackRunningScript(
    params: Omit<RunningScript, 'id'>,
  ): void {
    const id = String(nextTerminalId++);
    const runningScript: RunningScript = { id, ...params };
    this.runningScripts.set(id, runningScript);

    if (params.filePath) {
      const ids = this.filePathToTerminalIds.get(params.filePath) ?? new Set<string>();
      ids.add(id);
      this.filePathToTerminalIds.set(params.filePath, ids);
    }

    this._onDidChangeRunningScripts.fire();
  }

  /** replace 模式：停止同一文件的所有已有终端 */
  private stopTerminalsForFile(filePath: string): void {
    const ids = this.filePathToTerminalIds.get(filePath);
    if (!ids) {
      return;
    }

    for (const id of [...ids]) {
      this.stopTerminal(id);
    }
  }

  private removeRunningScript(id: string): void {
    const script = this.runningScripts.get(id);
    if (!script) {
      return;
    }

    this.runningScripts.delete(id);

    if (script.filePath) {
      const ids = this.filePathToTerminalIds.get(script.filePath);
      ids?.delete(id);
      if (ids?.size === 0) {
        this.filePathToTerminalIds.delete(script.filePath);
      }
    }

    this._onDidChangeRunningScripts.fire();
  }
}
