/**
 * npm scripts 树视图数据源：扫描工作区 package.json，按包分组展示 scripts。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  clearPackageManagerCacheForTest,
  detectPackageManager,
  resolvePackageManager,
} from './packageManager';
import { getPackageManagerSettings } from './packageManagerConfig';
import { resolveRegistryUrl } from './registryConfig';
import {
  PackageGroup,
  PackageGroupItem,
  PackageManagerActionItem,
  PackageManagerGroupItem,
  PackageManagerSettingItem,
  RegistrySettingItem,
  ScriptTreeItem,
} from './types';

type TreeElement =
  | PackageGroupItem
  | PackageManagerGroupItem
  | PackageManagerSettingItem
  | RegistrySettingItem
  | PackageManagerActionItem
  | ScriptTreeItem;

const LOCKFILE_PATTERNS = [
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/bun.lockb',
  '**/bun.lock',
  '**/package-lock.json',
];

export class NpmScriptsProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private groups: PackageGroup[] = [];
  private readonly watchers: vscode.Disposable[] = [];
  private readonly workspaceFolderListener: vscode.Disposable;
  private readonly configListener: vscode.Disposable;

  constructor() {
    void this.scanScripts();

    const packageJsonWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
    packageJsonWatcher.onDidChange(() => void this.scanScripts());
    packageJsonWatcher.onDidCreate(() => void this.scanScripts());
    packageJsonWatcher.onDidDelete(() => void this.scanScripts());
    this.watchers.push(packageJsonWatcher);

    for (const pattern of LOCKFILE_PATTERNS) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => void this.scanScripts());
      watcher.onDidCreate(() => void this.scanScripts());
      watcher.onDidDelete(() => void this.scanScripts());
      this.watchers.push(watcher);
    }

    const nodeModulesWatcher = vscode.workspace.createFileSystemWatcher('**/node_modules');
    nodeModulesWatcher.onDidCreate(() => void this.scanScripts());
    nodeModulesWatcher.onDidDelete(() => void this.scanScripts());
    this.watchers.push(nodeModulesWatcher);

    this.workspaceFolderListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void this.scanScripts();
    });

    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('jsRunner.packageManager') ||
        event.affectsConfiguration('jsRunner.packageManagerSettings')
      ) {
        clearPackageManagerCacheForTest();
        void this.scanScripts();
      }
    });
  }

  refresh(): void {
    clearPackageManagerCacheForTest();
    void this.scanScripts();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      return this.groups.map((group) => new PackageGroupItem(group));
    }

    if (element instanceof PackageGroupItem) {
      return [
        new PackageManagerGroupItem(element.group),
        ...element.group.scripts.map((script) => new ScriptTreeItem(script)),
      ];
    }

    if (element instanceof PackageManagerGroupItem) {
      return [
        new PackageManagerSettingItem(element.group),
        new RegistrySettingItem(element.group),
        new PackageManagerActionItem(element.group, 'install'),
        new PackageManagerActionItem(element.group, 'view'),
      ];
    }

    return [];
  }

  dispose(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.workspaceFolderListener.dispose();
    this.configListener.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /** 扫描工作区所有 package.json，解析 scripts 字段并分组 */
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

        const settings = getPackageManagerSettings(file.fsPath);
        const detectedManager = detectPackageManager(file.fsPath);
        const resolvedManager = resolvePackageManager(file.fsPath);
        const workspaceRoot = vscode.workspace.getWorkspaceFolder(file)?.uri.fsPath;
        const registryUrl = resolveRegistryUrl(
          file.fsPath,
          settings.registry,
          workspaceRoot,
        );
        const packageDir = path.dirname(file.fsPath);

        const scripts = Object.entries(pkg.scripts).map(([name, command]) => ({
          name,
          command,
          packageJsonPath: file.fsPath,
          packageManager: resolvedManager,
        }));

        scripts.sort((a, b) => a.name.localeCompare(b.name));

        const relativePath = this.getRelativePackageLabel(file.fsPath);
        groupsByPath.set(file.fsPath, {
          packageJsonPath: file.fsPath,
          label: relativePath,
          scripts,
          resolvedManager,
          detectedManager,
          managerSetting: settings.manager,
          registrySetting: settings.registry,
          registryUrl,
          hasNodeModules: fs.existsSync(path.join(packageDir, 'node_modules')),
        });
      } catch {
        // 忽略格式错误的 package.json
      }
    }

    this.groups = [...groupsByPath.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    this._onDidChangeTreeData.fire(undefined);
  }

  /** 生成树节点显示标签，如 "my-app" 或 "my-app/packages/core" */
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

export { clearPackageManagerCacheForTest };
