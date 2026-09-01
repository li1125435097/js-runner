import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  PackageGroup,
  PackageGroupItem,
  ScriptTreeItem,
} from './types';

type TreeElement = PackageGroupItem | ScriptTreeItem;

export class NpmScriptsProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private groups: PackageGroup[] = [];
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly workspaceFolderListener: vscode.Disposable;

  constructor() {
    void this.scanScripts();

    this.watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    this.watcher.onDidChange(() => void this.scanScripts());
    this.watcher.onDidCreate(() => void this.scanScripts());
    this.watcher.onDidDelete(() => void this.scanScripts());

    this.workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void this.scanScripts();
    });
  }

  refresh(): void {
    void this.scanScripts();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      return this.groups.map((group) => new PackageGroupItem(group));
    }

    if (element.contextValue === 'packageGroup') {
      return (element as PackageGroupItem).group.scripts.map((script) => new ScriptTreeItem(script));
    }

    return [];
  }

  dispose(): void {
    this.watcher.dispose();
    this.workspaceFolderListener.dispose();
    this._onDidChangeTreeData.dispose();
  }

  private async scanScripts(): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      this.groups = [];
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    const groupsByPath = new Map<string, PackageGroup>();

    for (const file of files) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        const pkg = JSON.parse(content) as { name?: string; scripts?: Record<string, string> };
        if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) {
          continue;
        }

        const scripts = Object.entries(pkg.scripts).map(([name, command]) => ({
          name,
          command,
          packageJsonPath: file.fsPath,
        }));

        scripts.sort((a, b) => a.name.localeCompare(b.name));

        const relativePath = this.getRelativePackageLabel(file.fsPath);
        groupsByPath.set(file.fsPath, {
          packageJsonPath: file.fsPath,
          label: relativePath,
          scripts,
        });
      } catch {
        // Ignore invalid package.json files.
      }
    }

    this.groups = [...groupsByPath.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    this._onDidChangeTreeData.fire(undefined);
  }

  private getRelativePackageLabel(packageJsonPath: string): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(packageJsonPath));
    if (workspaceFolder) {
      const relative = path.relative(workspaceFolder.uri.fsPath, path.dirname(packageJsonPath));
      if (!relative || relative === '.') {
        return workspaceFolder.name;
      }
      return `${workspaceFolder.name}/${relative}`;
    }

    return path.dirname(packageJsonPath);
  }
}
