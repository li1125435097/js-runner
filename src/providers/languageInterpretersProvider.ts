/**
 * 语言解释器树视图数据源：展示已配置的语言及解释器路径，支持增删改。
 */
import * as vscode from 'vscode';
import {
  getInterpreters,
  saveInterpreters,
} from '../interpreter/interpreterConfig';
import { LanguageInterpreter, LanguageInterpreterTreeItem } from '../common/types';

export class LanguageInterpretersProvider
  implements vscode.TreeDataProvider<LanguageInterpreterTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<LanguageInterpreterTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly configListener: vscode.Disposable;

  constructor() {
    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('jsRunner.interpreters')) {
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LanguageInterpreterTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): LanguageInterpreterTreeItem[] {
    return getInterpreters().map((interpreter) => new LanguageInterpreterTreeItem(interpreter));
  }

  async addInterpreter(): Promise<void> {
    const languageId = await vscode.window.showInputBox({
      title: 'Add Language Interpreter',
      prompt: 'Enter VS Code language ID (e.g. python, javascript, go)',
      placeHolder: 'python',
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Language ID is required';
        }
        if (getInterpreters().some((item) => item.languageId === trimmed)) {
          return `Language "${trimmed}" already exists`;
        }
        return undefined;
      },
    });
    if (!languageId) {
      return;
    }

    const label = await vscode.window.showInputBox({
      title: 'Add Language Interpreter',
      prompt: 'Enter display label (optional)',
      placeHolder: languageId.trim(),
    });
    if (label === undefined) {
      return;
    }

    const path = await vscode.window.showInputBox({
      title: 'Add Language Interpreter',
      prompt: 'Enter interpreter executable path or command',
      placeHolder: 'python',
      validateInput: (value) => (value.trim() ? undefined : 'Interpreter path is required'),
    });
    if (!path) {
      return;
    }

    const interpreters = getInterpreters();
    interpreters.push({
      languageId: languageId.trim(),
      label: label.trim() || undefined,
      path: path.trim(),
    });
    interpreters.sort((a, b) => {
      const labelA = a.label ?? a.languageId;
      const labelB = b.label ?? b.languageId;
      return labelA.localeCompare(labelB);
    });
    await saveInterpreters(interpreters);
    this.refresh();
  }

  async editInterpreter(item: LanguageInterpreterTreeItem): Promise<void> {
    const { interpreter } = item;
    const label = await vscode.window.showInputBox({
      title: 'Edit Language Interpreter',
      prompt: 'Display label',
      value: interpreter.label ?? interpreter.languageId,
    });
    if (label === undefined) {
      return;
    }

    const path = await vscode.window.showInputBox({
      title: 'Edit Language Interpreter',
      prompt: 'Interpreter executable path or command',
      value: interpreter.path,
      validateInput: (value) => (value.trim() ? undefined : 'Interpreter path is required'),
    });
    if (!path) {
      return;
    }

    const interpreters = getInterpreters().map((entry) =>
      entry.languageId === interpreter.languageId
        ? { ...entry, label: label.trim() || undefined, path: path.trim() }
        : entry,
    );
    await saveInterpreters(interpreters);
    this.refresh();
  }

  async removeInterpreter(item: LanguageInterpreterTreeItem): Promise<void> {
    const { interpreter } = item;
    const displayName = interpreter.label ?? interpreter.languageId;
    const confirm = await vscode.window.showWarningMessage(
      `Remove interpreter for "${displayName}"?`,
      { modal: true },
      'Remove',
    );
    if (confirm !== 'Remove') {
      return;
    }

    const interpreters = getInterpreters().filter(
      (entry) => entry.languageId !== interpreter.languageId,
    );
    await saveInterpreters(interpreters);
    this.refresh();
  }

  dispose(): void {
    this.configListener.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
