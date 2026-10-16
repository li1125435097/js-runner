/**
 * 在打开的 package.json 中，于每条 npm script 上方提供 Run / Debug CodeLens。
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { isJsNpmScript, NpmScriptInfo } from '../common/types';
import { isInsideNodeModules } from './npmScriptsProvider';
import { locateNpmScripts } from './packageJsonScriptLocations';

export const PACKAGE_JSON_CODELENS_SETTING = 'jsRunner.packageJsonCodeLens.enabled';
export const PACKAGE_JSON_RUN_LENS_TITLE = '$(play) Run';
export const PACKAGE_JSON_DEBUG_LENS_TITLE = '$(bug) Debug';

const PACKAGE_JSON_CODELENS_SECTION = 'jsRunner.packageJsonCodeLens';

export class PackageJsonScriptsCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(PACKAGE_JSON_CODELENS_SECTION)) {
          this._onDidChangeCodeLenses.fire();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (isPackageJsonPath(event.document.uri.fsPath)) {
          this._onDidChangeCodeLenses.fire();
        }
      }),
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isPackageJsonCodeLensEnabled() || !isPackageJsonPath(document.uri.fsPath)) {
      return [];
    }
    if (isInsideNodeModules(document.uri.fsPath)) {
      return [];
    }

    const located = locateNpmScripts(document.getText());
    const lenses: vscode.CodeLens[] = [];

    for (const script of located) {
      const range = new vscode.Range(
        document.positionAt(script.keyStartOffset),
        document.positionAt(script.keyEndOffset),
      );
      const info: NpmScriptInfo = {
        name: script.name,
        command: script.command,
        packageJsonPath: document.uri.fsPath,
        packageManager: '',
      };

      lenses.push(
        new vscode.CodeLens(range, {
          title: PACKAGE_JSON_RUN_LENS_TITLE,
          command: 'jsRunner.runNpmScript',
          arguments: [info],
        }),
      );

      if (isJsNpmScript(script.command)) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: PACKAGE_JSON_DEBUG_LENS_TITLE,
            command: 'jsRunner.debugNpmScript',
            arguments: [info],
          }),
        );
      }
    }

    return lenses;
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this._onDidChangeCodeLenses.dispose();
  }
}

export function isPackageJsonPath(fsPath: string): boolean {
  return path.basename(fsPath).toLowerCase() === 'package.json';
}

function isPackageJsonCodeLensEnabled(): boolean {
  return vscode.workspace.getConfiguration('jsRunner').get('packageJsonCodeLens.enabled', true);
}
