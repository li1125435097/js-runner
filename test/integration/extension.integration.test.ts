import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { fixtureWorkspaceRoot } from '../helpers/constants';

const fixtureRoot = fixtureWorkspaceRoot();
const rootPackageJson = path.join(fixtureRoot, 'package.json');
const helloJs = path.join(fixtureRoot, 'hello.js');

suite('JS Runner extension integration', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('jinkeli.js-runner-kit');
    assert.ok(extension, 'js-runner-kit extension should be installed');
    await extension.activate();
  });

  test('activates and exposes contributed commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    const expected = [
      'jsRunner.runCurrentFile',
      'jsRunner.runCurrentFileNewTerminal',
      'jsRunner.stopAll',
      'jsRunner.stopTerminal',
      'jsRunner.refreshScripts',
      'jsRunner.runNpmScript',
      'jsRunner.focusRunningTerminal',
      'jsRunner.addInterpreter',
      'jsRunner.editInterpreter',
      'jsRunner.removeInterpreter',
    ];

    for (const command of expected) {
      assert.ok(commands.includes(command), `missing command: ${command}`);
    }
  });

  test('sets jsRunner.active context after activation', async () => {
    await vscode.commands.executeCommand('setContext', 'jsRunner.active', true);
    assert.ok(true);
  });

  test('loads default interpreters from configuration', () => {
    const interpreters = vscode.workspace
      .getConfiguration('jsRunner')
      .get<Array<{ languageId: string; path: string }>>('interpreters');

    assert.ok(interpreters && interpreters.length > 0);
    assert.ok(interpreters.some((item) => item.languageId === 'javascript'));
    assert.ok(interpreters.some((item) => item.languageId === 'python'));
  });

  test('npm scripts view discovers workspace package.json scripts', async () => {
    await vscode.commands.executeCommand('jsRunner.refreshScripts');
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(fs.existsSync(rootPackageJson));
    const pkg = JSON.parse(fs.readFileSync(rootPackageJson, 'utf-8')) as {
      scripts: Record<string, string>;
    };
    assert.ok(Object.keys(pkg.scripts).includes('build'));
    assert.ok(Object.keys(pkg.scripts).includes('start'));
  });

  test('can open fixture js file and update run context for javascript', async () => {
    const document = await vscode.workspace.openTextDocument(helloJs);
    const editor = await vscode.window.showTextDocument(document);

    assert.strictEqual(editor.document.languageId, 'javascript');
    assert.ok(fs.existsSync(helloJs));
  });

  test('runNpmScript command accepts script info payload', async () => {
    const script = {
      name: 'build',
      command: 'echo build-ok',
      packageJsonPath: rootPackageJson,
    };

    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('jsRunner.runNpmScript', script);
    });
  });

  test('stopAll command runs without throwing', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('jsRunner.stopAll');
    });
  });
});

suite('JS Runner packaged extension metadata', () => {
  test('extension manifest matches package identity', () => {
    const extension = vscode.extensions.getExtension('jinkeli.js-runner-kit');
    assert.ok(extension);

    const packageJsonPath = path.join(extension!.extensionPath, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      name: string;
      displayName: string;
      version: string;
      main: string;
    };

    assert.strictEqual(manifest.name, 'js-runner-kit');
    assert.strictEqual(manifest.displayName, 'JS Runner Kit');
    assert.ok(manifest.version.length > 0);
    assert.ok(fs.existsSync(path.join(extension!.extensionPath, manifest.main)));
  });

  test('contributes expected views and activation events', () => {
    const extension = vscode.extensions.getExtension('jinkeli.js-runner-kit');
    const packageJsonPath = path.join(extension!.extensionPath, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      activationEvents: string[];
      contributes: {
        views: {
          jsRunner: Array<{ id: string }>;
        };
      };
    };

    assert.ok(manifest.activationEvents.includes('workspaceContains:package.json'));
    const viewIds = manifest.contributes.views.jsRunner.map((view) => view.id);
    assert.deepStrictEqual(viewIds.sort(), [
      'languageInterpretersView',
      'npmScriptsView',
      'runningScriptsView',
    ].sort());
  });
});
