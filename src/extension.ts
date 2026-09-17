/**
 * VS Code 扩展入口：注册命令、树视图，并协调 TerminalManager 与各 Provider。
 */
import * as vscode from 'vscode';
import { getInterpreterForLanguage } from './interpreter/interpreterConfig';
import { CallLogStore } from './mcp/callLogStore';
import { showMcpCallLogs } from './mcp/callLogsPanel';
import { getMcpServerSettings } from './mcp/mcpConfig';
import { McpClientRegistration } from './mcp/mcpClientRegistration';
import { registerJsRunnerMcpServerDefinitionProvider } from './mcp/mcpServerDefinitionProvider';
import { McpServerController, McpServerStatus } from './mcp/mcpServerController';
import { getRelativePackageKey } from './packageManager/packageManagerConfig';
import { promptSetNpmScriptShortcut } from './shortcuts/scriptShortcutPicker';
import { ScriptShortcutStore } from './shortcuts/scriptShortcutStore';
import { viewInstalledPackages } from './packageManager/installedPackagesPanel';
import { LanguageInterpretersProvider } from './providers/languageInterpretersProvider';
import { McpServerViewProvider } from './providers/mcpServerViewProvider';
import { NpmScriptsProvider } from './providers/npmScriptsProvider';
import {
  installDependencies,
  selectPackageManager,
  selectRegistry,
} from './packageManager/packageManagerUi';
import { RunningScriptsProvider } from './providers/runningScriptsProvider';
import {
  PinnedDecorationProvider,
  setPinnedListSelectionForeground,
  syncPinnedForegroundColorCustomization,
} from './common/pinnedAppearance';
import {
  LanguageInterpreterTreeItem,
  NpmScriptInfo,
  PackageGroupItem,
  RunningScriptTreeItem,
  ScriptTreeItem,
} from './common/types';
import { TerminalManager } from './terminal/terminalManager';

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

function isPinnedPackageSelected(view: vscode.TreeView<unknown>): boolean {
  return view.selection.some(
    (item) => item instanceof PackageGroupItem && item.contextValue === 'packageGroupPinned',
  );
}

function syncPinnedPackageLabelColor(view: vscode.TreeView<unknown>): void {
  void setPinnedListSelectionForeground(view.visible && isPinnedPackageSelected(view));
}

/** 根据当前编辑器语言是否已配置解释器，更新运行按钮可见性 */
function updateRunContext(editor: vscode.TextEditor | undefined): void {
  const canRun = editor ? Boolean(getInterpreterForLanguage(editor.document.languageId)) : false;
  void vscode.commands.executeCommand('setContext', 'jsRunner.canRunCurrentFile', canRun);
}

export interface JsRunnerExtensionApi {
  getMcpStatus(): McpServerStatus;
}

export function activate(context: vscode.ExtensionContext): JsRunnerExtensionApi {
  markExtensionActive();
  updateRunContext(vscode.window.activeTextEditor);

  const terminalManager = new TerminalManager();
  const shortcutStore = new ScriptShortcutStore(context.workspaceState);
  const npmScriptsProvider = new NpmScriptsProvider(context.workspaceState);
  void shortcutStore.activate();
  const runningScriptsProvider = new RunningScriptsProvider(terminalManager);
  const languageInterpretersProvider = new LanguageInterpretersProvider();
  const callLogStore = new CallLogStore(getMcpServerSettings().maxLogEntries);
  const serverVersion = String(
    vscode.extensions.getExtension('jinkeli.js-runner-kit')?.packageJSON?.version ?? '1.2.0',
  );
  const mcpController = new McpServerController(
    {
      terminalManager,
      npmScriptsProvider,
      shortcutStore,
      extensionContext: context,
    },
    callLogStore,
    serverVersion,
  );
  const mcpViewProvider = new McpServerViewProvider(mcpController, () => {
    showMcpCallLogs(callLogStore, context);
  });
  const mcpClientRegistration = new McpClientRegistration(mcpController);
  const mcpDefinitionProvider = registerJsRunnerMcpServerDefinitionProvider(
    () => mcpController.getStatus(),
    mcpController.onDidChangeStatus,
    serverVersion,
  );

  const npmScriptsView = vscode.window.createTreeView('npmScriptsView', {
    treeDataProvider: npmScriptsProvider,
    showCollapseAll: true,
  });
  npmScriptsProvider.attachTreeView(npmScriptsView);
  const runningScriptsView = vscode.window.createTreeView('runningScriptsView', {
    treeDataProvider: runningScriptsProvider,
  });
  const languageInterpretersView = vscode.window.createTreeView('languageInterpretersView', {
    treeDataProvider: languageInterpretersProvider,
  });

  npmScriptsProvider.refresh();
  void syncPinnedForegroundColorCustomization();
  const decorationProvider = new PinnedDecorationProvider();

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      markExtensionActive();
      updateRunContext(editor);
      void setPinnedListSelectionForeground(false);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('jsRunner.interpreters') ||
        event.affectsConfiguration('jsRunner.packageManager') ||
        event.affectsConfiguration('jsRunner.packageManagerSettings')
      ) {
        updateRunContext(vscode.window.activeTextEditor);
      }
      if (event.affectsConfiguration('jsRunner.pinnedForeground')) {
        void syncPinnedForegroundColorCustomization();
        syncPinnedPackageLabelColor(npmScriptsView);
      }
    }),
    vscode.window.registerFileDecorationProvider(decorationProvider),
    npmScriptsView.onDidChangeSelection(() => syncPinnedPackageLabelColor(npmScriptsView)),
    npmScriptsView.onDidChangeVisibility(() => syncPinnedPackageLabelColor(npmScriptsView)),
    npmScriptsView.onDidExpandElement(() => syncPinnedPackageLabelColor(npmScriptsView)),
    npmScriptsView.onDidCollapseElement(() => syncPinnedPackageLabelColor(npmScriptsView)),
    runningScriptsView.onDidChangeSelection(() => void setPinnedListSelectionForeground(false)),
    languageInterpretersView.onDidChangeSelection(() => void setPinnedListSelectionForeground(false)),
    terminalManager,
    shortcutStore,
    npmScriptsProvider,
    runningScriptsProvider,
    languageInterpretersProvider,
    mcpController,
    mcpClientRegistration,
    ...(mcpDefinitionProvider ? [mcpDefinitionProvider] : []),
    mcpViewProvider,
    vscode.window.registerWebviewViewProvider(McpServerViewProvider.viewId, mcpViewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
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
    vscode.commands.registerCommand('jsRunner.filterNpmScripts', () => {
      void npmScriptsProvider.promptFilter();
    }),
    vscode.commands.registerCommand('jsRunner.clearNpmScriptsFilter', () => {
      npmScriptsProvider.setFilter('');
    }),
    vscode.commands.registerCommand(
      'jsRunner.pinNpmScript',
      (scriptOrItem: NpmScriptInfo | ScriptTreeItem) => {
        void npmScriptsProvider.pinNpmScript(resolveNpmScript(scriptOrItem));
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.unpinNpmScript',
      (scriptOrItem: NpmScriptInfo | ScriptTreeItem) => {
        void npmScriptsProvider.unpinNpmScript(resolveNpmScript(scriptOrItem));
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.pinNpmPackage',
      (pathOrItem: string | { packageJsonPath: string }) => {
        void npmScriptsProvider.pinNpmPackage(resolvePackageJsonPath(pathOrItem)).then(() => {
          syncPinnedPackageLabelColor(npmScriptsView);
        });
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.unpinNpmPackage',
      (pathOrItem: string | { packageJsonPath: string }) => {
        void npmScriptsProvider.unpinNpmPackage(resolvePackageJsonPath(pathOrItem)).then(() => {
          syncPinnedPackageLabelColor(npmScriptsView);
        });
      },
    ),
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
      'jsRunner.setNpmScriptShortcut',
      (scriptOrItem: NpmScriptInfo | ScriptTreeItem) => {
        const script = resolveNpmScript(scriptOrItem);
        const packageKey = getRelativePackageKey(script.packageJsonPath);
        void promptSetNpmScriptShortcut(script, packageKey, shortcutStore).then((result) => {
          if (result === 'assigned' || result === 'cleared') {
            npmScriptsProvider.reloadShortcuts();
          }
        });
      },
    ),
    vscode.commands.registerCommand(
      'jsRunner.runNpmScriptByShortcut',
      (args?: { keyId?: string } | string) => {
        const keyId = typeof args === 'string' ? args : args?.keyId;
        if (!keyId) {
          return;
        }
        const binding = shortcutStore.getMap()[keyId];
        if (!binding) {
          void vscode.window.showErrorMessage('JS Runner: no npm script is bound to that shortcut.');
          return;
        }
        const script = npmScriptsProvider.findNpmScript(binding.packageKey, binding.scriptName);
        if (!script) {
          void vscode.window.showErrorMessage(
            `JS Runner: npm script "${binding.scriptName}" is no longer in this workspace.`,
          );
          return;
        }
        terminalManager.runNpmScript(script.name, script.packageJsonPath);
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
        void installDependencies(pathOrItem);
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

  void mcpController.start();

  return {
    getMcpStatus: () => mcpController.getStatus(),
  };
}

export function deactivate(): void {
  void setPinnedListSelectionForeground(false);
  void vscode.commands.executeCommand('setContext', 'jsRunner.active', false);
  void vscode.commands.executeCommand('setContext', 'jsRunner.canRunCurrentFile', false);
}
