import * as vscode from 'vscode';
import { RunningScriptTreeItem } from './types';
import { TerminalManager } from './terminalManager';

export class RunningScriptsProvider implements vscode.TreeDataProvider<RunningScriptTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<RunningScriptTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly changeListener: vscode.Disposable;

  constructor(private readonly terminalManager: TerminalManager) {
    this.changeListener = this.terminalManager.onDidChangeRunningScripts(() => {
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  getTreeItem(element: RunningScriptTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): RunningScriptTreeItem[] {
    return this.terminalManager
      .getRunningScripts()
      .map((script) => new RunningScriptTreeItem(script));
  }

  dispose(): void {
    this.changeListener.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
