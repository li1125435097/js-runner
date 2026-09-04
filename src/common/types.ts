import * as vscode from 'vscode';
import { getManagerDisplayLabel, KnownPackageManager } from './packageManagerCommands';
import {
  pinnedForegroundThemeColor,
  pinnedPackageIconUri,
  pinnedPackageUri,
  pinnedScriptUri,
} from './pinnedAppearance';
import { getRegistryDisplayLabel } from './registryPresets';

/** 语言与解释器映射配置 */
export interface LanguageInterpreter {
  languageId: string;
  label?: string;
  path: string;
}

/** 运行 JS 文件时的终端模式：replace 替换同文件已有终端，new 始终新建 */
export type RunMode = 'replace' | 'new';

/** 脚本类型：直接运行 JS 文件，或通过 npm script 运行 */
export type ScriptType = 'js' | 'npm';

/** 正在运行的脚本实例，与 VS Code 终端一一对应 */
export interface RunningScript {
  id: string;
  terminal: vscode.Terminal;
  name: string;
  type: ScriptType;
  filePath?: string;
  packageJsonPath?: string;
  packageManager?: string;
}

/** 从 package.json 解析出的单个 npm script */
export interface NpmScriptInfo {
  name: string;
  command: string;
  packageJsonPath: string;
  packageManager: string;
}

/** 判断 npm script 是否可能由 Node/JS 工具链执行，用于显示 debug 按钮 */
export function isJsNpmScript(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (
    /\b(node|nodemon|tsx|ts-node|vite|next|nuxt|jest|mocha|webpack|rollup|esbuild|tsc|babel)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return /\.(js|mjs|cjs|ts|tsx|jsx)(\s|$|'|")/.test(normalized);
}

/** 按 package.json 分组的 npm scripts，用于树视图顶层节点 */
export interface PackageGroup {
  packageJsonPath: string;
  label: string;
  scripts: NpmScriptInfo[];
  resolvedManager: string;
  detectedManager: KnownPackageManager;
  managerSetting: string;
  registrySetting: string;
  registryUrl: string;
}

/** npm scripts 树视图中的包分组节点 */
export class PackageGroupItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup, expanded = false, pinned = false) {
    super(
      group.label,
      expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.id = `package-group:${group.packageJsonPath}`;
    this.contextValue = pinned ? 'packageGroupPinned' : 'packageGroup';
    this.iconPath = pinned
      ? pinnedPackageIconUri()
      : new vscode.ThemeIcon('package');
    if (pinned) {
      this.resourceUri = pinnedPackageUri(group.packageJsonPath);
    }
    this.tooltip = group.packageJsonPath;
  }

  get packageJsonPath(): string {
    return this.group.packageJsonPath;
  }
}

/** Package Manager 折叠区：默认折叠，scripts 保持可见 */
export class PackageManagerGroupItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup) {
    super('Package Manager', vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `package-manager:${group.packageJsonPath}`;
    this.contextValue = 'packageManagerGroup';
    this.iconPath = new vscode.ThemeIcon('settings-gear');
    this.tooltip = `Package manager settings for ${group.label}`;
  }

  get packageJsonPath(): string {
    return this.group.packageJsonPath;
  }
}

/** 包管理器选择行 */
export class PackageManagerSettingItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup) {
    const label = getManagerDisplayLabel(
      group.managerSetting,
      group.detectedManager,
      group.resolvedManager,
    );
    super('Manager', vscode.TreeItemCollapsibleState.None);
    this.id = `package-manager-setting:${group.packageJsonPath}`;
    this.description = label;
    this.tooltip = `Package manager: ${label}\nClick to change`;
    this.iconPath = new vscode.ThemeIcon('terminal');
    this.contextValue = 'packageManagerSetting';
    this.command = {
      command: 'jsRunner.selectPackageManager',
      title: 'Select Package Manager',
      arguments: [group.packageJsonPath],
    };
  }

  get packageJsonPath(): string {
    return this.group.packageJsonPath;
  }
}

/** Registry 选择行 */
export class RegistrySettingItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup) {
    const label = getRegistryDisplayLabel(group.registrySetting, group.registryUrl);
    super('Registry', vscode.TreeItemCollapsibleState.None);
    this.id = `registry-setting:${group.packageJsonPath}`;
    this.description = label;
    this.tooltip = `Registry: ${label}\n${group.registryUrl}\nClick to change`;
    this.iconPath = new vscode.ThemeIcon('cloud-download');
    this.contextValue = 'registrySetting';
    this.command = {
      command: 'jsRunner.selectRegistry',
      title: 'Select Registry',
      arguments: [group.packageJsonPath],
    };
  }

  get packageJsonPath(): string {
    return this.group.packageJsonPath;
  }
}

/** Package Manager 操作行 */
export class PackageManagerActionItem extends vscode.TreeItem {
  constructor(
    public readonly group: PackageGroup,
    action: 'install' | 'view',
  ) {
    const labels = {
      install: 'Install Dependencies',
      view: 'View Installed Packages',
    } as const;
    const icons = {
      install: 'cloud-download',
      view: 'list-unordered',
    } as const;
    const commands = {
      install: 'jsRunner.installDependencies',
      view: 'jsRunner.viewInstalledPackages',
    } as const;
    const contextValues = {
      install: 'packageManagerInstall',
      view: 'packageManagerViewPackages',
    } as const;

    super(labels[action], vscode.TreeItemCollapsibleState.None);
    this.id = `package-manager-action:${action}:${group.packageJsonPath}`;
    this.iconPath = new vscode.ThemeIcon(icons[action]);
    this.contextValue = contextValues[action];
    this.command = {
      command: commands[action],
      title: labels[action],
      arguments: [group.packageJsonPath],
    };
  }

  get packageJsonPath(): string {
    return this.group.packageJsonPath;
  }
}

/** npm scripts 树视图顶部搜索行，点击后输入过滤关键词 */
export class ScriptSearchItem extends vscode.TreeItem {
  constructor(query: string) {
    const trimmed = query.trim();
    super(trimmed || 'Search package path...', vscode.TreeItemCollapsibleState.None);
    this.id = 'npm-scripts-search';
    this.description = trimmed ? 'Click to edit' : undefined;
    this.tooltip = trimmed ? `Filter: ${trimmed}` : 'Search by package.json path';
    this.iconPath = new vscode.ThemeIcon('search');
    this.contextValue = 'npmScriptSearch';
    this.command = {
      command: 'jsRunner.filterNpmScripts',
      title: 'Search Package Path',
    };
  }
}

/** npm scripts 树视图中的单个 script 节点，点击即可运行 */
export class ScriptTreeItem extends vscode.TreeItem {
  constructor(public readonly script: NpmScriptInfo, pinned = false) {
    super(script.name, vscode.TreeItemCollapsibleState.None);
    this.id = `script:${script.packageJsonPath}:${script.name}`;
    this.description = script.command;
    this.tooltip = `${script.packageManager} run ${script.name}\n${script.command}`;
    this.iconPath = new vscode.ThemeIcon(
      'play',
      pinned ? pinnedForegroundThemeColor() : undefined,
    );
    if (pinned) {
      this.resourceUri = pinnedScriptUri(script.packageJsonPath, script.name);
    }
    const isJs = isJsNpmScript(script.command);
    if (pinned) {
      this.contextValue = isJs ? 'npmScriptJsPinned' : 'npmScriptPinned';
    } else {
      this.contextValue = isJs ? 'npmScriptJs' : 'npmScript';
    }
    this.command = {
      command: 'jsRunner.runNpmScript',
      title: 'Run Script',
      arguments: [script],
    };
  }
}

/** 语言解释器树视图节点 */
export class LanguageInterpreterTreeItem extends vscode.TreeItem {
  constructor(public readonly interpreter: LanguageInterpreter) {
    super(interpreter.label ?? interpreter.languageId, vscode.TreeItemCollapsibleState.None);
    this.description = interpreter.path;
    this.tooltip = `${interpreter.languageId}\n${interpreter.path}`;
    this.iconPath = new vscode.ThemeIcon('symbol-method');
    this.contextValue = 'languageInterpreter';
  }
}

/** 运行中脚本树视图节点，点击可聚焦对应终端 */
export class RunningScriptTreeItem extends vscode.TreeItem {
  constructor(public readonly runningScript: RunningScript) {
    super(runningScript.name, vscode.TreeItemCollapsibleState.None);
    this.description =
      runningScript.type === 'js'
        ? 'JS'
        : (runningScript.packageManager ?? 'npm');
    this.iconPath = new vscode.ThemeIcon('terminal');
    this.contextValue = 'runningScript';
    this.command = {
      command: 'jsRunner.focusRunningTerminal',
      title: 'Focus Terminal',
      arguments: [runningScript.id],
    };
  }
}
