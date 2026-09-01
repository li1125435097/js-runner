import * as path from 'path';
import * as vscode from 'vscode';
import { RunMode, RunningScript } from './types';

let nextTerminalId = 1;

export class TerminalManager implements vscode.Disposable {
  private readonly runningScripts = new Map<string, RunningScript>();
  private readonly filePathToTerminalIds = new Map<string, Set<string>>();
  private readonly _onDidChangeRunningScripts = new vscode.EventEmitter<void>();
  readonly onDidChangeRunningScripts = this._onDidChangeRunningScripts.event;
  private readonly closeTerminalListener: vscode.Disposable;

  constructor() {
    this.closeTerminalListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
      for (const [id, script] of this.runningScripts) {
        if (script.terminal === closedTerminal) {
          this.removeRunningScript(id);
          break;
        }
      }
    });
  }

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
