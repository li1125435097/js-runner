import * as vscode from 'vscode';

export type RunMode = 'replace' | 'new';

export type ScriptType = 'js' | 'npm';

export interface RunningScript {
  id: string;
  terminal: vscode.Terminal;
  name: string;
  type: ScriptType;
  filePath?: string;
  packageJsonPath?: string;
}

export interface NpmScriptInfo {
  name: string;
  command: string;
  packageJsonPath: string;
}

export interface PackageGroup {
  packageJsonPath: string;
  label: string;
  scripts: NpmScriptInfo[];
}

export class PackageGroupItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'packageGroup';
    this.iconPath = new vscode.ThemeIcon('package');
    this.tooltip = group.packageJsonPath;
  }
}

export class ScriptTreeItem extends vscode.TreeItem {
  constructor(public readonly script: NpmScriptInfo) {
    super(script.name, vscode.TreeItemCollapsibleState.None);
    this.description = script.command;
    this.tooltip = `npm run ${script.name}\n${script.command}`;
    this.iconPath = new vscode.ThemeIcon('play');
    this.contextValue = 'npmScript';
    this.command = {
      command: 'jsRunner.runNpmScript',
      title: 'Run Script',
      arguments: [script],
    };
  }
}

export class RunningScriptTreeItem extends vscode.TreeItem {
  constructor(public readonly runningScript: RunningScript) {
    super(runningScript.name, vscode.TreeItemCollapsibleState.None);
    this.description = runningScript.type === 'js' ? 'JS' : 'npm';
    this.iconPath = new vscode.ThemeIcon('terminal');
    this.contextValue = 'runningScript';
    this.command = {
      command: 'jsRunner.focusRunningTerminal',
      title: 'Focus Terminal',
      arguments: [runningScript.id],
    };
  }
}
