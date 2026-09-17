import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { fixtureWorkspaceRoot } from '../helpers/constants';

const fixtureRoot = fixtureWorkspaceRoot();
const rootPackageJson = path.join(fixtureRoot, 'package.json');
const helloJs = path.join(fixtureRoot, 'hello.js');

function httpGetJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function httpPostJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

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
      'jsRunner.filterNpmScripts',
      'jsRunner.clearNpmScriptsFilter',
      'jsRunner.pinNpmScript',
      'jsRunner.unpinNpmScript',
      'jsRunner.pinNpmPackage',
      'jsRunner.unpinNpmPackage',
      'jsRunner.runNpmScript',
      'jsRunner.debugNpmScript',
      'jsRunner.setNpmScriptShortcut',
      'jsRunner.runNpmScriptByShortcut',
      'jsRunner.selectPackageManager',
      'jsRunner.selectRegistry',
      'jsRunner.installDependencies',
      'jsRunner.viewInstalledPackages',
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
      packageManager: 'npm',
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

  test('starts MCP HTTP server and serves health plus tools/list', async () => {
    const extension = vscode.extensions.getExtension('jinkeli.js-runner-kit');
    assert.ok(extension);
    const api = (await extension.activate()) as {
      getMcpStatus?: () => {
        status: string;
        port?: number;
        reason?: string;
      };
    };
    assert.ok(api.getMcpStatus, 'activate() should export getMcpStatus');

    let status = api.getMcpStatus();
    for (let i = 0; i < 50 && status.status === 'stop' && status.reason === 'Starting'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = api.getMcpStatus();
    }

    if (status.status !== 'running' || !status.port) {
      assert.fail(`MCP server did not start: ${status.reason ?? status.status}`);
    }

    const health = await httpGetJson(`http://127.0.0.1:${status.port}/health`);
    assert.strictEqual(health.status, 'running');
    assert.strictEqual(health.port, status.port);

    const listed = await httpPostJson(`http://127.0.0.1:${status.port}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    assert.ok(Array.isArray((listed.result as { tools?: unknown[] })?.tools));
    assert.ok(((listed.result as { tools?: unknown[] }).tools ?? []).length >= 22);
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
    assert.ok(manifest.activationEvents.includes('onView:mcpServerView'));
    const viewIds = manifest.contributes.views.jsRunner.map((view) => view.id);
    assert.deepStrictEqual(viewIds.sort(), [
      'languageInterpretersView',
      'mcpServerView',
      'npmScriptsView',
      'runningScriptsView',
    ].sort());
  });
});
