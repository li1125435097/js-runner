import * as vscode from 'vscode';

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
}

/** 从 package.json 解析出的单个 npm script */
export interface NpmScriptInfo {
  name: string;
  command: string;
  packageJsonPath: string;
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
}

/** npm scripts 树视图中的包分组节点 */
export class PackageGroupItem extends vscode.TreeItem {
  constructor(public readonly group: PackageGroup) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'packageGroup';
    this.iconPath = new vscode.ThemeIcon('package');
    this.tooltip = group.packageJsonPath;
  }
}

/** npm scripts 树视图中的单个 script 节点，点击即可运行 */
export class ScriptTreeItem extends vscode.TreeItem {
  constructor(public readonly script: NpmScriptInfo) {
    super(script.name, vscode.TreeItemCollapsibleState.None);
    this.description = script.command;
    this.tooltip = `npm run ${script.name}\n${script.command}`;
    this.iconPath = new vscode.ThemeIcon('play');
    this.contextValue = isJsNpmScript(script.command) ? 'npmScriptJs' : 'npmScript';
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
