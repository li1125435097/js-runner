/**
 * VS Code 扩展入口：注册命令、树视图，并协调 TerminalManager 与各 Provider。
 */
import * as vscode from 'vscode';
import { getInterpreterForLanguage } from './interpreterConfig';
import { viewInstalledPackages } from './installedPackagesPanel';
import { LanguageInterpretersProvider } from './languageInterpretersProvider';
import { NpmScriptsProvider } from './npmScriptsProvider';
import {
  installDependencies,
  selectPackageManager,
  selectRegistry,
} from './packageManagerUi';
import { RunningScriptsProvider } from './runningScriptsProvider';
import {
  LanguageInterpreterTreeItem,
  NpmScriptInfo,
  RunningScriptTreeItem,
  ScriptTreeItem,
} from './types';
import { TerminalManager } from './terminalManager';

/** 命令参数可能是 TreeItem 或原始数据，统一解析为 NpmScriptInfo */
function resolveNpmScript(scriptOrItem: NpmScriptInfo | ScriptTreeItem): NpmScriptInfo {
  return scriptOrItem instanceof ScriptTreeItem ? scriptOrItem.script : scriptOrItem;
}

/** 命令参数可能是终端 ID 或 TreeItem，统一解析为 ID 字符串 */
function resolveTerminalId(idOrItem: string | RunningScriptTreeItem): string {
  return typeof idOrItem === 'string' ? idOrItem : idOrItem.runningScript.id;
}

/** 命令参数可能是 TreeItem 或原始数据，统一解析为 LanguageInterpreterTreeItem */
function resolveInterpreterItem(
  item: LanguageInterpreterTreeItem,
): LanguageInterpreterTreeItem {
  return item;
}

/** 命令参数可能是 packageJsonPath 字符串或 TreeItem */
function resolvePackageJsonPath(pathOrItem: string | { packageJsonPath: string }): string {
  return typeof pathOrItem === 'string' ? pathOrItem : pathOrItem.packageJsonPath;
}

/** 设置 jsRunner.active 上下文，用于 package.json 中 when 子句控制菜单/视图可见性 */
function markExtensionActive(): void {
  void vscode.commands.executeCommand('setContext', 'jsRunner.active', true);
}

/** 根据当前编辑器语言是否已配置解释器，更新运行按钮可见性 */
function updateRunContext(editor: vscode.TextEditor | undefined): void {
  const canRun = editor ? Boolean(getInterpreterForLanguage(editor.document.languageId)) : false;
  void vscode.commands.executeCommand('setContext', 'jsRunner.canRunCurrentFile', canRun);
}

export function activate(context: vscode.ExtensionContext): void {
  markExtensionActive();
  updateRunContext(vscode.window.activeTextEditor);

  const terminalManager = new TerminalManager();
  const npmScriptsProvider = new NpmScriptsProvider();
  const runningScriptsProvider = new RunningScriptsProvider(terminalManager);
  const languageInterpretersProvider = new LanguageInterpretersProvider();

  const npmScriptsView = vscode.window.createTreeView('npmScriptsView', {
    treeDataProvider: npmScriptsProvider,
    showCollapseAll: true,
  });
  const runningScriptsView = vscode.window.createTreeView('runningScriptsView', {
    treeDataProvider: runningScriptsProvider,
  });
  const languageInterpretersView = vscode.window.createTreeView('languageInterpretersView', {
    treeDataProvider: languageInterpretersProvider,
  });

  npmScriptsProvider.refresh();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      markExtensionActive();
      updateRunContext(editor);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('jsRunner.interpreters') ||
        event.affectsConfiguration('jsRunner.packageManager') ||
        event.affectsConfiguration('jsRunner.packageManagerSettings')
      ) {
        updateRunContext(vscode.window.activeTextEditor);
      }
    }),
    terminalManager,
    npmScriptsProvider,
    runningScriptsProvider,
    languageInterpretersProvider,
    npmScriptsView,
    runningScriptsView,
    languageInterpretersView,
    vscode.commands.registerCommand('jsRunner.runCurrentFile', () => {
      terminalManager.runCurrentFile('replace');
    }),
    vscode.commands.registerCommand('jsRunner.runCurrentFileNewTerminal', () => {
      terminalManager.runCurrentFile('new');
    }),
    vscode.commands.registerCommand('jsRunner.stopAll', () => {
      terminalManager.stopAll();
    }),
    vscode.commands.registerCommand(
      'jsRunner.stopTerminal',
      (idOrItem: string | RunningScriptTreeItem) => {
        terminalManager.stopTerminal(resolveTerminalId(idOrItem));
      },
    ),
    vscode.commands.registerCommand('jsRunner.focusRunningTerminal', (terminalId: string) => {
      const script = terminalManager.getRunningScripts().find((item) => item.id === terminalId);
      script?.terminal.show();
    }),
    vscode.commands.registerCommand('jsRunner.refreshScripts', () => {
      npmScriptsProvider.refresh();
    }),
    vscode.commands.registerCommand(
      'jsRunner.runNpmScript',
      (scriptOrItem: NpmScriptInfo | ScriptTreeItem) => {
        const script = resolveNpmScript(scriptOrItem);
        terminalManager.runNpmScript(script.name, script.packageJsonPath);
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.debugNpmScript',
      (scriptOrItem: NpmScriptInfo | ScriptTreeItem) => {
        const script = resolveNpmScript(scriptOrItem);
        void terminalManager.debugNpmScript(script.name, script.packageJsonPath, script.command);
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.selectPackageManager',
      (pathOrItem: string | { packageJsonPath: string }) => {
        void selectPackageManager(pathOrItem, () => npmScriptsProvider.refresh());
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.selectRegistry',
      (pathOrItem: string | { packageJsonPath: string }) => {
        void selectRegistry(pathOrItem, () => npmScriptsProvider.refresh());
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.installDependencies',
      (pathOrItem: string | { packageJsonPath: string }) => {
        void installDependencies(pathOrItem, () => npmScriptsProvider.refresh());
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.viewInstalledPackages',
      (pathOrItem: string | { packageJsonPath: string }) => {
        viewInstalledPackages(resolvePackageJsonPath(pathOrItem), context);
      },
    ),
    vscode.commands.registerCommand('jsRunner.addInterpreter', () => {
      void languageInterpretersProvider.addInterpreter();
    }),
    vscode.commands.registerCommand(
      'jsRunner.editInterpreter',
      (item: LanguageInterpreterTreeItem) => {
        void languageInterpretersProvider.editInterpreter(resolveInterpreterItem(item));
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.removeInterpreter',
      (item: LanguageInterpreterTreeItem) => {
        void languageInterpretersProvider.removeInterpreter(resolveInterpreterItem(item));
      },
    ),
  );
}

export function deactivate(): void {
  void vscode.commands.executeCommand('setContext', 'jsRunner.active', false);
  void vscode.commands.executeCommand('setContext', 'jsRunner.canRunCurrentFile', false);
}
