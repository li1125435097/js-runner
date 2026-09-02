/**
 * VS Code 扩展入口：注册命令、树视图，并协调 TerminalManager 与各 Provider。
 */
import * as vscode from 'vscode';
import { NpmScriptsProvider } from './npmScriptsProvider';
import { RunningScriptsProvider } from './runningScriptsProvider';
import { NpmScriptInfo, RunningScriptTreeItem, ScriptTreeItem } from './types';
import { TerminalManager } from './terminalManager';

/** 命令参数可能是 TreeItem 或原始数据，统一解析为 NpmScriptInfo */
function resolveNpmScript(scriptOrItem: NpmScriptInfo | ScriptTreeItem): NpmScriptInfo {
  return scriptOrItem instanceof ScriptTreeItem ? scriptOrItem.script : scriptOrItem;
}

/** 命令参数可能是终端 ID 或 TreeItem，统一解析为 ID 字符串 */
function resolveTerminalId(idOrItem: string | RunningScriptTreeItem): string {
  return typeof idOrItem === 'string' ? idOrItem : idOrItem.runningScript.id;
}

/** 设置 jsRunner.active 上下文，用于 package.json 中 when 子句控制菜单/视图可见性 */
function markExtensionActive(): void {
  void vscode.commands.executeCommand('setContext', 'jsRunner.active', true);
}

export function activate(context: vscode.ExtensionContext): void {
  markExtensionActive();
  const terminalManager = new TerminalManager();
  const npmScriptsProvider = new NpmScriptsProvider();
  const runningScriptsProvider = new RunningScriptsProvider(terminalManager);

  const npmScriptsView = vscode.window.createTreeView('npmScriptsView', {
    treeDataProvider: npmScriptsProvider,
    showCollapseAll: true,
  });
  const runningScriptsView = vscode.window.createTreeView('runningScriptsView', {
    treeDataProvider: runningScriptsProvider,
  });

  npmScriptsProvider.refresh();

  context.subscriptions.push(
    // 切换编辑器时重新标记扩展为激活状态
    vscode.window.onDidChangeActiveTextEditor(() => {
      markExtensionActive();
    }),
    terminalManager,
    npmScriptsProvider,
    runningScriptsProvider,
    npmScriptsView,
    runningScriptsView,
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
  );
}

export function deactivate(): void {
  void vscode.commands.executeCommand('setContext', 'jsRunner.active', false);
}
