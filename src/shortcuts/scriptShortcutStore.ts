/**
 * npm 脚本快捷键的 workspaceState 存储、context 与自定义 keybindings 同步。
 */
import * as vscode from 'vscode';
import {
  AssignShortcutOptions,
  SHORTCUTS_STATE_KEY,
  ScriptShortcutMap,
  contextKeyFor,
  inspectKey,
  isCatalogKey,
  removeShortcutsForScript,
  withShiftModifier,
} from './scriptShortcutKeys';
import {
  KeybindingsFileAdapter,
  applyShortcutKeybindingsReconcile,
  createFsKeybindingsAdapter,
  listUserKeybindings,
  resolveUserKeybindingsPath,
} from './userKeybindingsFile';

export class ScriptShortcutStore {
  private readonly enabledContextKeys = new Set<string>();

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly keybindingsFile: KeybindingsFileAdapter = createFsKeybindingsAdapter(
      resolveUserKeybindingsPath(vscode.env.appName),
    ),
  ) {}

  getMap(): ScriptShortcutMap {
    return { ...(this.workspaceState.get<ScriptShortcutMap>(SHORTCUTS_STATE_KEY, {}) ?? {}) };
  }

  listUserBindings() {
    return listUserKeybindings(this.keybindingsFile);
  }

  async activate(): Promise<void> {
    this.reconcileKeybindings();
    await this.syncContexts();
  }

  async assign(
    keyId: string,
    packageKey: string,
    scriptName: string,
    options?: AssignShortcutOptions,
  ): Promise<void> {
    const map = this.getMap();
    removeShortcutsForScript(map, packageKey, scriptName);
    map[keyId] = {
      packageKey,
      scriptName,
      source: isCatalogKey(keyId) ? 'catalog' : 'custom',
      action: 'run',
    };

    if (options?.pairDebug) {
      const debugKeyId = withShiftModifier(keyId);
      if (debugKeyId) {
        const occupancy = inspectKey(debugKeyId, {
          bindings: map,
          userBindings: this.listUserBindings(),
        });
        if (occupancy.kind === 'free') {
          map[debugKeyId] = {
            packageKey,
            scriptName,
            source: isCatalogKey(debugKeyId) ? 'catalog' : 'custom',
            action: 'debug',
          };
        }
      }
    }

    await this.workspaceState.update(SHORTCUTS_STATE_KEY, map);
    this.reconcileKeybindings();
    await this.syncContexts();
  }

  async clearForScript(packageKey: string, scriptName: string): Promise<void> {
    const map = this.getMap();
    if (!removeShortcutsForScript(map, packageKey, scriptName)) {
      return;
    }
    await this.workspaceState.update(SHORTCUTS_STATE_KEY, map);
    this.reconcileKeybindings();
    await this.syncContexts();
  }

  dispose(): void {
    for (const contextKey of this.enabledContextKeys) {
      void vscode.commands.executeCommand('setContext', contextKey, false);
    }
    this.enabledContextKeys.clear();
  }

  private customKeyIds(map: ScriptShortcutMap): string[] {
    return Object.entries(map)
      .filter(([, binding]) => binding.source === 'custom')
      .map(([keyId]) => keyId);
  }

  private reconcileKeybindings(): void {
    try {
      applyShortcutKeybindingsReconcile(this.keybindingsFile, this.customKeyIds(this.getMap()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(message);
    }
  }

  private async syncContexts(): Promise<void> {
    const map = this.getMap();
    const next = new Set(Object.keys(map).map((keyId) => contextKeyFor(keyId)));
    for (const contextKey of this.enabledContextKeys) {
      if (!next.has(contextKey)) {
        await vscode.commands.executeCommand('setContext', contextKey, false);
      }
    }
    for (const contextKey of next) {
      await vscode.commands.executeCommand('setContext', contextKey, true);
      this.enabledContextKeys.add(contextKey);
    }
    for (const contextKey of [...this.enabledContextKeys]) {
      if (!next.has(contextKey)) {
        this.enabledContextKeys.delete(contextKey);
      }
    }
  }
}
