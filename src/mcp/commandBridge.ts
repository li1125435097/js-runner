/**
 * 用可序列化参数执行扩展能力，避免 MCP 调用弹出 QuickPick / InputBox。
 */
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getPinnedForeground,
  parsePinnedForegroundColor,
  syncPinnedForegroundColorCustomization,
} from '../common/pinnedAppearance';
import { NpmScriptInfo } from '../common/types';
import { getInterpreters, saveInterpreters } from '../interpreter/interpreterConfig';
import { viewInstalledPackages } from '../packageManager/installedPackagesPanel';
import { getRelativePackageKey } from '../packageManager/packageManagerConfig';
import {
  applyPackageManagerSetting,
  applyRegistrySetting,
  installDependencies,
} from '../packageManager/packageManagerUi';
import { NpmScriptsProvider } from '../providers/npmScriptsProvider';
import { ScriptShortcutStore } from '../shortcuts/scriptShortcutStore';
import { TerminalManager } from '../terminal/terminalManager';

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.html': 'html',
  '.htm': 'html',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.java': 'java',
};

export interface CommandBridgeDeps {
  terminalManager: TerminalManager;
  npmScriptsProvider: NpmScriptsProvider;
  shortcutStore: ScriptShortcutStore;
  extensionContext: vscode.ExtensionContext;
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Argument ${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function inferLanguageId(filePath: string, languageId?: string): string {
  if (languageId) {
    return languageId;
  }
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'javascript';
}

export class CommandBridge {
  constructor(private readonly deps: CommandBridgeDeps) {}

  async invoke(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'jsRunner_runCurrentFile':
        return this.runFile(args, 'replace');
      case 'jsRunner_runCurrentFileNewTerminal':
        return this.runFile(args, 'new');
      case 'jsRunner_stopAll':
        this.deps.terminalManager.stopAll();
        return { ok: true };
      case 'jsRunner_stopTerminal':
        this.deps.terminalManager.stopTerminal(requiredString(args, 'terminalId'));
        return { ok: true };
      case 'jsRunner_refreshScripts':
        this.deps.npmScriptsProvider.refresh();
        return { ok: true };
      case 'jsRunner_filterNpmScripts': {
        const query = requiredString(args, 'query');
        this.deps.npmScriptsProvider.setFilter(query);
        return { ok: true, query };
      }
      case 'jsRunner_clearNpmScriptsFilter':
        this.deps.npmScriptsProvider.setFilter('');
        return { ok: true };
      case 'jsRunner_pinNpmScript':
        await this.deps.npmScriptsProvider.pinNpmScript(this.resolveScript(args));
        return { ok: true };
      case 'jsRunner_unpinNpmScript':
        await this.deps.npmScriptsProvider.unpinNpmScript(this.resolveScript(args));
        return { ok: true };
      case 'jsRunner_pinNpmPackage':
        await this.deps.npmScriptsProvider.pinNpmPackage(requiredString(args, 'packageJsonPath'));
        return { ok: true };
      case 'jsRunner_unpinNpmPackage':
        await this.deps.npmScriptsProvider.unpinNpmPackage(requiredString(args, 'packageJsonPath'));
        return { ok: true };
      case 'jsRunner_runNpmScript': {
        const script = this.resolveScript(args);
        this.deps.terminalManager.runNpmScript(script.name, script.packageJsonPath);
        return { ok: true, name: script.name, packageJsonPath: script.packageJsonPath };
      }
      case 'jsRunner_debugNpmScript': {
        const script = this.resolveScript(args);
        const command = optionalString(args, 'command') ?? script.command;
        await this.deps.terminalManager.debugNpmScript(
          script.name,
          script.packageJsonPath,
          command,
        );
        return { ok: true, name: script.name, packageJsonPath: script.packageJsonPath };
      }
      case 'jsRunner_setNpmScriptShortcut': {
        const script = this.resolveScript(args);
        const keyId = requiredString(args, 'keyId');
        const packageKey = getRelativePackageKey(script.packageJsonPath);
        await this.deps.shortcutStore.assign(keyId, packageKey, script.name);
        this.deps.npmScriptsProvider.reloadShortcuts();
        return { ok: true, keyId, packageKey, name: script.name };
      }
      case 'jsRunner_runNpmScriptByShortcut': {
        const keyId = requiredString(args, 'keyId');
        const binding = this.deps.shortcutStore.getMap()[keyId];
        if (!binding) {
          throw new Error(`No npm script is bound to shortcut "${keyId}".`);
        }
        const script = this.deps.npmScriptsProvider.findNpmScript(
          binding.packageKey,
          binding.scriptName,
        );
        if (!script) {
          throw new Error(
            `npm script "${binding.scriptName}" is no longer in this workspace.`,
          );
        }
        this.deps.terminalManager.runNpmScript(script.name, script.packageJsonPath);
        return { ok: true, keyId, name: script.name, packageJsonPath: script.packageJsonPath };
      }
      case 'jsRunner_focusRunningTerminal': {
        const terminalId = requiredString(args, 'terminalId');
        const script = this.deps.terminalManager
          .getRunningScripts()
          .find((item) => item.id === terminalId);
        if (!script) {
          throw new Error(`No running script with id "${terminalId}".`);
        }
        script.terminal.show();
        return { ok: true, terminalId };
      }
      case 'jsRunner_viewInstalledPackages':
        viewInstalledPackages(
          requiredString(args, 'packageJsonPath'),
          this.deps.extensionContext,
        );
        return { ok: true };
      case 'jsRunner_selectPackageManager':
        await applyPackageManagerSetting(
          requiredString(args, 'packageJsonPath'),
          requiredString(args, 'manager'),
          () => this.deps.npmScriptsProvider.refresh(),
        );
        return { ok: true };
      case 'jsRunner_selectRegistry':
        await applyRegistrySetting(
          requiredString(args, 'packageJsonPath'),
          requiredString(args, 'registry'),
          () => this.deps.npmScriptsProvider.refresh(),
        );
        return { ok: true };
      case 'jsRunner_installDependencies':
        await installDependencies(requiredString(args, 'packageJsonPath'), {
          skipConfirm: true,
          wipe: args.wipe === true,
        });
        return { ok: true };
      case 'jsRunner_addInterpreter':
        return this.addInterpreter(args);
      case 'jsRunner_editInterpreter':
        return this.editInterpreter(args);
      case 'jsRunner_removeInterpreter':
        return this.removeInterpreter(args);
      case 'jsRunner_listRunningScripts':
        return {
          scripts: this.deps.terminalManager.getRunningScripts().map((script) => ({
            id: script.id,
            name: script.name,
            type: script.type,
            filePath: script.filePath,
            packageJsonPath: script.packageJsonPath,
            packageManager: script.packageManager,
          })),
        };
      case 'jsRunner_listNpmScripts':
        return {
          packages: this.deps.npmScriptsProvider.listPackageGroups().map((group) => ({
            packageJsonPath: group.packageJsonPath,
            label: group.label,
            packageManager: group.resolvedManager,
            scripts: group.scripts.map((script) => ({
              name: script.name,
              command: script.command,
              packageJsonPath: script.packageJsonPath,
              packageManager: script.packageManager,
            })),
          })),
        };
      case 'jsRunner_listInterpret':
        return {
          interpreters: getInterpreters().map((item) => ({
            languageId: item.languageId,
            path: item.path,
            label: item.label,
          })),
        };
      case 'jsRunner_getPinnedForeground': {
        const inspected = vscode.workspace
          .getConfiguration('jsRunner')
          .inspect<string>('pinnedForeground');
        return {
          color: getPinnedForeground(),
          globalValue: inspected?.globalValue ?? null,
          workspaceValue: inspected?.workspaceValue ?? null,
          workspaceFolderValue: inspected?.workspaceFolderValue ?? null,
        };
      }
      case 'jsRunner_setPinnedForeground': {
        const color = parsePinnedForegroundColor(requiredString(args, 'color'));
        await vscode.workspace
          .getConfiguration('jsRunner')
          .update('pinnedForeground', color, vscode.ConfigurationTarget.Global);
        await syncPinnedForegroundColorCustomization();
        return { ok: true, color: getPinnedForeground() };
      }
      case 'jsRunner_listPinnedScripts':
        return this.deps.npmScriptsProvider.listPinned();
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private runFile(args: Record<string, unknown>, mode: 'replace' | 'new'): unknown {
    const filePath = requiredString(args, 'filePath');
    const languageId = inferLanguageId(filePath, optionalString(args, 'languageId'));
    this.deps.terminalManager.runFile(filePath, languageId, mode);
    return { ok: true, filePath, languageId, mode };
  }

  private resolveScript(args: Record<string, unknown>): NpmScriptInfo {
    const name = requiredString(args, 'name');
    const packageJsonPath = requiredString(args, 'packageJsonPath');
    return (
      this.deps.npmScriptsProvider.findNpmScriptByPath(packageJsonPath, name) ?? {
        name,
        command: optionalString(args, 'command') ?? '',
        packageJsonPath,
        packageManager: 'npm',
      }
    );
  }

  private async addInterpreter(args: Record<string, unknown>): Promise<unknown> {
    const languageId = requiredString(args, 'languageId');
    const interpreterPath = requiredString(args, 'path');
    const label = optionalString(args, 'label');
    const interpreters = getInterpreters();
    if (interpreters.some((item) => item.languageId === languageId)) {
      throw new Error(`Language "${languageId}" already exists.`);
    }
    interpreters.push({
      languageId,
      path: interpreterPath,
      label,
    });
    interpreters.sort((a, b) => {
      const labelA = a.label ?? a.languageId;
      const labelB = b.label ?? b.languageId;
      return labelA.localeCompare(labelB);
    });
    await saveInterpreters(interpreters);
    return { ok: true, languageId };
  }

  private async editInterpreter(args: Record<string, unknown>): Promise<unknown> {
    const languageId = requiredString(args, 'languageId');
    const interpreters = getInterpreters();
    const current = interpreters.find((item) => item.languageId === languageId);
    if (!current) {
      throw new Error(`No interpreter configured for language "${languageId}".`);
    }
    const nextPath = optionalString(args, 'path') ?? current.path;
    const nextLabel = args.label === undefined ? current.label : optionalString(args, 'label');
    await saveInterpreters(
      interpreters.map((item) =>
        item.languageId === languageId
          ? { ...item, path: nextPath, label: nextLabel }
          : item,
      ),
    );
    return { ok: true, languageId };
  }

  private async removeInterpreter(args: Record<string, unknown>): Promise<unknown> {
    const languageId = requiredString(args, 'languageId');
    const interpreters = getInterpreters();
    if (!interpreters.some((item) => item.languageId === languageId)) {
      throw new Error(`No interpreter configured for language "${languageId}".`);
    }
    await saveInterpreters(interpreters.filter((item) => item.languageId !== languageId));
    return { ok: true, languageId };
  }
}
