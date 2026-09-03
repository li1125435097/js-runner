/**
 * npm scripts 树视图数据源：扫描工作区 package.json，按包分组展示 scripts。
 * 默认只展开第一个包；刷新时只重绘已展开节点，避免 Next.js 等项目安装依赖时卡顿。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  clearPackageManagerCacheForTest,
  detectPackageManager,
  resolvePackageManager,
} from '../packageManager/packageManager';
import {
  getPackageManagerSettings,
  getRelativePackageKey,
} from '../packageManager/packageManagerConfig';
import { resolveRegistryUrl } from '../packageManager/registryConfig';
import {
  NpmScriptInfo,
  PackageGroup,
  PackageGroupItem,
  PackageManagerActionItem,
  PackageManagerGroupItem,
  PackageManagerSettingItem,
  RegistrySettingItem,
  ScriptSearchItem,
  ScriptTreeItem,
} from '../common/types';

type TreeElement =
  | ScriptSearchItem
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

const SCAN_DEBOUNCE_MS = 300;
const PINNED_SCRIPTS_KEY = 'jsRunner.pinnedScripts';
const PINNED_PACKAGES_KEY = 'jsRunner.pinnedPackages';

export function isInsideNodeModules(fsPath: string): boolean {
  return fsPath.split(path.sep).includes('node_modules');
}

function normalizePathQuery(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

export function matchesPackagePath(
  group: Pick<PackageGroup, 'packageJsonPath' | 'label'>,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }
  const needle = normalizePathQuery(trimmed);
  const candidates = [
    group.packageJsonPath,
    group.label,
    getRelativePackageKey(group.packageJsonPath),
  ];
  return candidates.some((value) => normalizePathQuery(value).includes(needle));
}

export function pinnedPackageKey(packageJsonPath: string): string {
  return getRelativePackageKey(packageJsonPath);
}

export function pinnedScriptKey(packageJsonPath: string, scriptName: string): string {
  return `${getRelativePackageKey(packageJsonPath)}::${scriptName}`;
}

export function sortPackagesWithPins(
  groups: PackageGroup[],
  pinnedKeys: string[],
): PackageGroup[] {
  const pinnedSet = new Set(pinnedKeys);
  const pinned: PackageGroup[] = [];
  const unpinned: PackageGroup[] = [];

  for (const group of groups) {
    if (pinnedSet.has(pinnedPackageKey(group.packageJsonPath))) {
      pinned.push(group);
    } else {
      unpinned.push(group);
    }
  }

  pinned.sort(
    (a, b) =>
      pinnedKeys.indexOf(pinnedPackageKey(a.packageJsonPath)) -
      pinnedKeys.indexOf(pinnedPackageKey(b.packageJsonPath)),
  );

  return [...pinned, ...unpinned];
}

export function sortScriptsWithPins(
  scripts: NpmScriptInfo[],
  pinnedKeys: string[],
): NpmScriptInfo[] {
  const pinnedSet = new Set(pinnedKeys);
  const pinned: NpmScriptInfo[] = [];
  const unpinned: NpmScriptInfo[] = [];

  for (const script of scripts) {
    if (pinnedSet.has(pinnedScriptKey(script.packageJsonPath, script.name))) {
      pinned.push(script);
    } else {
      unpinned.push(script);
    }
  }

  pinned.sort(
    (a, b) =>
      pinnedKeys.indexOf(pinnedScriptKey(a.packageJsonPath, a.name)) -
      pinnedKeys.indexOf(pinnedScriptKey(b.packageJsonPath, b.name)),
  );

  return [...pinned, ...unpinned];
}

export class NpmScriptsProvider implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private groups: PackageGroup[] = [];
  private readonly watchers: vscode.Disposable[] = [];
  private readonly workspaceFolderListener: vscode.Disposable;
  private readonly configListener: vscode.Disposable;
  private readonly groupItems = new Map<string, PackageGroupItem>();
  private readonly expandedPackagePaths = new Set<string>();
  private readonly workspaceState?: vscode.Memento;
  private hasInitializedExpansion = false;
  private scanTimer: ReturnType<typeof setTimeout> | undefined;
  private scanning = false;
  private scanQueued = false;
  private filterQuery = '';
  private pinnedKeys: string[] = [];
  private pinnedPackageKeys: string[] = [];

  constructor(workspaceState?: vscode.Memento) {
    this.workspaceState = workspaceState;
    this.pinnedKeys = [...(workspaceState?.get<string[]>(PINNED_SCRIPTS_KEY, []) ?? [])];
    this.pinnedPackageKeys = [...(workspaceState?.get<string[]>(PINNED_PACKAGES_KEY, []) ?? [])];
    void this.scanScripts();

    this.subscribeWatcher(
      vscode.workspace.createFileSystemWatcher('**/package.json'),
      (uri) => this.onWatchedFileEvent(uri),
    );

    for (const pattern of LOCKFILE_PATTERNS) {
      this.subscribeWatcher(
        vscode.workspace.createFileSystemWatcher(pattern),
        (uri) => this.onWatchedFileEvent(uri),
      );
    }

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
      if (event.affectsConfiguration('jsRunner.pinnedForeground')) {
        this._onDidChangeTreeData.fire(undefined);
      }
    });
  }

  attachTreeView(view: vscode.TreeView<TreeElement>): void {
    this.watchers.push(
      view.onDidExpandElement((event) => {
        if (this.isFilterActive()) {
          return;
        }
        if (event.element instanceof PackageGroupItem) {
          this.setGroupExpanded(event.element.group.packageJsonPath, true);
        }
      }),
      view.onDidCollapseElement((event) => {
        if (this.isFilterActive()) {
          return;
        }
        if (event.element instanceof PackageGroupItem) {
          this.setGroupExpanded(event.element.group.packageJsonPath, false);
        }
      }),
    );
  }

  setGroupExpanded(packageJsonPath: string, expanded: boolean): void {
    if (expanded) {
      this.expandedPackagePaths.add(packageJsonPath);
    } else {
      this.expandedPackagePaths.delete(packageJsonPath);
    }
  }

  setFilter(query: string): void {
    this.filterQuery = query.trim();
    void vscode.commands.executeCommand(
      'setContext',
      'jsRunner.npmScriptsFiltered',
      this.isFilterActive(),
    );
    this.groupItems.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  async promptFilter(): Promise<void> {
    const value = await vscode.window.showInputBox({
      title: 'Search Package Path',
      prompt: 'Search packages by package.json path',
      placeHolder: 'e.g. nested/pkg',
      value: this.filterQuery,
    });
    if (value === undefined) {
      return;
    }
    this.setFilter(value);
  }

  async pinNpmScript(script: NpmScriptInfo): Promise<void> {
    const key = pinnedScriptKey(script.packageJsonPath, script.name);
    this.pinnedKeys = [key, ...this.pinnedKeys.filter((item) => item !== key)];
    await this.workspaceState?.update(PINNED_SCRIPTS_KEY, this.pinnedKeys);
    this._onDidChangeTreeData.fire(undefined);
  }

  async unpinNpmScript(script: NpmScriptInfo): Promise<void> {
    const key = pinnedScriptKey(script.packageJsonPath, script.name);
    this.pinnedKeys = this.pinnedKeys.filter((item) => item !== key);
    await this.workspaceState?.update(PINNED_SCRIPTS_KEY, this.pinnedKeys);
    this._onDidChangeTreeData.fire(undefined);
  }

  async pinNpmPackage(packageJsonPath: string): Promise<void> {
    const key = pinnedPackageKey(packageJsonPath);
    this.pinnedPackageKeys = [key, ...this.pinnedPackageKeys.filter((item) => item !== key)];
    await this.workspaceState?.update(PINNED_PACKAGES_KEY, this.pinnedPackageKeys);
    this.groupItems.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  async unpinNpmPackage(packageJsonPath: string): Promise<void> {
    const key = pinnedPackageKey(packageJsonPath);
    this.pinnedPackageKeys = this.pinnedPackageKeys.filter((item) => item !== key);
    await this.workspaceState?.update(PINNED_PACKAGES_KEY, this.pinnedPackageKeys);
    this.groupItems.clear();
    this._onDidChangeTreeData.fire(undefined);
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
      const search = new ScriptSearchItem(this.filterQuery);
      const groups = this.visibleGroups().map((group) => {
        const item = new PackageGroupItem(
          group,
          this.isGroupExpanded(group.packageJsonPath),
          this.isPackagePinned(group.packageJsonPath),
        );
        this.groupItems.set(group.packageJsonPath, item);
        return item;
      });
      return [search, ...groups];
    }

    if (element instanceof PackageGroupItem) {
      const group = this.findGroup(element.group.packageJsonPath);
      if (!group) {
        return [];
      }
      this.hydrateGroupDetails(group);
      const scripts = sortScriptsWithPins(group.scripts, this.pinnedKeys).map(
        (script) => new ScriptTreeItem(script, this.isPinned(script)),
      );
      return [new PackageManagerGroupItem(group), ...scripts];
    }

    if (element instanceof PackageManagerGroupItem) {
      const group = this.findGroup(element.group.packageJsonPath) ?? element.group;
      this.hydrateGroupDetails(group);
      return [
        new PackageManagerSettingItem(group),
        new RegistrySettingItem(group),
        new PackageManagerActionItem(group, 'install'),
        new PackageManagerActionItem(group, 'view'),
      ];
    }

    return [];
  }

  dispose(): void {
    if (this.scanTimer !== undefined) {
      clearTimeout(this.scanTimer);
      this.scanTimer = undefined;
    }
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.workspaceFolderListener.dispose();
    this.configListener.dispose();
    this._onDidChangeTreeData.dispose();
  }

  /** 扫描工作区所有 package.json，解析 scripts 字段并分组 */
  private async scanScripts(): Promise<void> {
    if (this.scanning) {
      this.scanQueued = true;
      return;
    }

    this.scanning = true;
    try {
      do {
        this.scanQueued = false;
        await this.performScan();
      } while (this.scanQueued);
    } finally {
      this.scanning = false;
    }
  }

  private async performScan(): Promise<void> {
    const previousSignature = this.groupsSignature(this.groups);

    if (!vscode.workspace.workspaceFolders?.length) {
      this.groups = [];
      this.groupItems.clear();
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    const groupsByPath = new Map<string, PackageGroup>();

    for (const file of files) {
      if (isInsideNodeModules(file.fsPath)) {
        continue;
      }

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
          packageManager: '',
        }));

        scripts.sort((a, b) => a.name.localeCompare(b.name));

        groupsByPath.set(file.fsPath, {
          packageJsonPath: file.fsPath,
          label: this.getRelativePackageLabel(file.fsPath),
          scripts,
          resolvedManager: '',
          detectedManager: 'npm',
          managerSetting: 'auto',
          registrySetting: 'auto',
          registryUrl: '',
        });
      } catch {
        // 忽略格式错误的 package.json
      }
    }

    this.groups = [...groupsByPath.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    this.syncExpansionState();
    this.emitTreeDataChange(previousSignature);
  }

  private hydrateGroupDetails(group: PackageGroup): void {
    const settings = getPackageManagerSettings(group.packageJsonPath);
    const detectedManager = detectPackageManager(group.packageJsonPath);
    const resolvedManager = resolvePackageManager(group.packageJsonPath);
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(group.packageJsonPath),
    )?.uri.fsPath;
    const registryUrl = resolveRegistryUrl(
      group.packageJsonPath,
      settings.registry,
      workspaceRoot,
    );

    group.resolvedManager = resolvedManager;
    group.detectedManager = detectedManager;
    group.managerSetting = settings.manager;
    group.registrySetting = settings.registry;
    group.registryUrl = registryUrl;
    for (const script of group.scripts) {
      script.packageManager = resolvedManager;
    }
  }

  private findGroup(packageJsonPath: string): PackageGroup | undefined {
    return this.groups.find((group) => group.packageJsonPath === packageJsonPath);
  }

  private visibleGroups(): PackageGroup[] {
    const groups = this.isFilterActive()
      ? this.groups.filter((group) => matchesPackagePath(group, this.filterQuery))
      : this.groups;
    return sortPackagesWithPins(groups, this.pinnedPackageKeys);
  }

  private isPinned(script: NpmScriptInfo): boolean {
    return this.pinnedKeys.includes(pinnedScriptKey(script.packageJsonPath, script.name));
  }

  private isPackagePinned(packageJsonPath: string): boolean {
    return this.pinnedPackageKeys.includes(pinnedPackageKey(packageJsonPath));
  }

  private isFilterActive(): boolean {
    return this.filterQuery.length > 0;
  }

  private isGroupExpanded(packageJsonPath: string): boolean {
    if (this.isFilterActive()) {
      return true;
    }
    return this.expandedPackagePaths.has(packageJsonPath);
  }

  private syncExpansionState(): void {
    const currentPaths = new Set(this.groups.map((group) => group.packageJsonPath));
    for (const packageJsonPath of [...this.expandedPackagePaths]) {
      if (!currentPaths.has(packageJsonPath)) {
        this.expandedPackagePaths.delete(packageJsonPath);
      }
    }

    if (!this.hasInitializedExpansion && this.groups.length > 0) {
      this.expandedPackagePaths.add(this.groups[0].packageJsonPath);
      this.hasInitializedExpansion = true;
    }
  }

  private emitTreeDataChange(previousSignature: string): void {
    const nextSignature = this.groupsSignature(this.groups);
    if (
      this.isFilterActive() ||
      nextSignature !== previousSignature ||
      this.groupItems.size === 0
    ) {
      this.groupItems.clear();
      this._onDidChangeTreeData.fire(undefined);
      return;
    }

    for (const group of this.groups) {
      if (!this.expandedPackagePaths.has(group.packageJsonPath)) {
        continue;
      }
      const item = this.groupItems.get(group.packageJsonPath);
      if (!item) {
        this._onDidChangeTreeData.fire(undefined);
        return;
      }
      this._onDidChangeTreeData.fire(item);
    }
  }

  private groupsSignature(groups: PackageGroup[]): string {
    return groups.map((group) => group.packageJsonPath).join('\0');
  }

  private subscribeWatcher(
    watcher: vscode.FileSystemWatcher,
    handler: (uri: vscode.Uri) => void,
  ): void {
    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
    watcher.onDidDelete(handler);
    this.watchers.push(watcher);
  }

  private onWatchedFileEvent(uri: vscode.Uri): void {
    if (isInsideNodeModules(uri.fsPath)) {
      return;
    }
    this.scheduleScan();
  }

  private scheduleScan(): void {
    if (this.scanTimer !== undefined) {
      clearTimeout(this.scanTimer);
    }
    this.scanTimer = setTimeout(() => {
      this.scanTimer = undefined;
      void this.scanScripts();
    }, SCAN_DEBOUNCE_MS);
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

export { clearPackageManagerCacheForTest, SCAN_DEBOUNCE_MS };
