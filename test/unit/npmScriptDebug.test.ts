import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as proxyquire from 'proxyquire';

type NpmScriptDebugModule = {
  buildNpmScriptDebugConfig: (input: {
    name: string;
    command: string;
    packageJsonPath: string;
  }) => {
    type: string;
    program?: string;
    args?: string[];
    command?: string;
    [key: string]: unknown;
  };
  splitCommandLine: (command: string) => string[];
};

function loadNpmScriptDebugModule(): NpmScriptDebugModule {
  return proxyquire.noCallThru()('../../npmScriptDebug', {}) as NpmScriptDebugModule;
}

function writePackageBin(
  packageDir: string,
  packageName: string,
  binRelative: string,
): string {
  const packageRoot = path.join(packageDir, 'node_modules', packageName);
  fs.mkdirSync(path.dirname(path.join(packageRoot, binRelative)), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ bin: { [packageName]: binRelative } }),
  );
  const binPath = path.join(packageRoot, binRelative);
  fs.writeFileSync(binPath, '');
  return binPath;
}

describe('npmScriptDebug', () => {
  let tempDir: string;
  let buildNpmScriptDebugConfig: NpmScriptDebugModule['buildNpmScriptDebugConfig'];
  let splitCommandLine: NpmScriptDebugModule['splitCommandLine'];

  beforeEach(() => {
    ({ buildNpmScriptDebugConfig, splitCommandLine } = loadNpmScriptDebugModule());
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-runner-debug-'));
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('splits quoted command arguments', () => {
    expect(splitCommandLine('vite --config "vite.electron.config.js"')).to.deep.equal([
      'vite',
      '--config',
      'vite.electron.config.js',
    ]);
  });

  it('builds a direct node launch config for vite scripts', () => {
    const viteBin = writePackageBin(tempDir, 'vite', 'bin/vite.js');
    const config = buildNpmScriptDebugConfig({
      name: 'dev:client-only',
      command: 'vite --mode dev --config vite.electron.config.js',
      packageJsonPath: path.join(tempDir, 'package.json'),
    });

    expect(config.type).to.equal('node');
    expect(config).to.include({
      request: 'launch',
      name: 'npm: dev:client-only',
      cwd: tempDir,
      program: viteBin,
      console: 'integratedTerminal',
      autoAttachChildProcesses: true,
      sourceMaps: true,
    });
    expect(config.args).to.deep.equal(['--mode', 'dev', '--config', 'vite.electron.config.js']);
  });

  it('builds a direct node launch config for node entry scripts', () => {
    const entry = path.join(tempDir, 'server.js');
    fs.writeFileSync(entry, '');

    const config = buildNpmScriptDebugConfig({
      name: 'start',
      command: 'node server.js --watch',
      packageJsonPath: path.join(tempDir, 'package.json'),
    });

    expect(config.type).to.equal('node');
    expect(config.program).to.equal(entry);
    expect(config.args).to.deep.equal(['--watch']);
  });

  it('strips cross-env before resolving the launch target', () => {
    const viteBin = writePackageBin(tempDir, 'vite', 'bin/vite.js');
    const config = buildNpmScriptDebugConfig({
      name: 'dev',
      command: 'cross-env NODE_ENV=development vite --mode dev',
      packageJsonPath: path.join(tempDir, 'package.json'),
    });

    expect(config.type).to.equal('node');
    expect(config.program).to.equal(viteBin);
    expect(config.args).to.deep.equal(['--mode', 'dev']);
  });

  it('falls back to node-terminal for unsupported commands', () => {
    const config = buildNpmScriptDebugConfig({
      name: 'lint',
      command: 'echo lint',
      packageJsonPath: path.join(tempDir, 'package.json'),
    });

    expect(config.type).to.equal('node-terminal');
    expect(config.command).to.equal('npm run lint');
  });
});
