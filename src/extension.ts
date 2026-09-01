import * as vscode from 'vscode';
import { NpmScriptsProvider } from './npmScriptsProvider';
import { RunningScriptsProvider } from './runningScriptsProvider';
import { NpmScriptInfo, ScriptTreeItem } from './types';
import { TerminalManager } from './terminalManager';

function resolveNpmScript(scriptOrItem: NpmScriptInfo | ScriptTreeItem): NpmScriptInfo {
  return scriptOrItem instanceof ScriptTreeItem ? scriptOrItem.script : scriptOrItem;
}

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
    vscode.commands.registerCommand('jsRunner.stopTerminal', (terminalId: string) => {
      terminalManager.stopTerminal(terminalId);
    }),
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
