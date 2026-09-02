import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const projectRoot = path.resolve(__dirname, '../..');
const releaseDir = path.join(projectRoot, 'release');
const fixtureWorkspace = path.join(projectRoot, 'test', 'fixtures', 'workspace');

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  ) as { version: string };
  return packageJson.version;
}

function packageExtension(): string {
  fs.mkdirSync(releaseDir, { recursive: true });
  const version = readPackageVersion();
  const vsixPath = path.join(releaseDir, `js-runner-kit-${version}.vsix`);

  execSync('npm run compile', { cwd: projectRoot, stdio: 'inherit' });
  execSync(`npx vsce package --out "${vsixPath}"`, { cwd: projectRoot, stdio: 'inherit' });

  if (!fs.existsSync(vsixPath)) {
    throw new Error(`Packaged VSIX not found: ${vsixPath}`);
  }

  return vsixPath;
}

function resolveCursorExecutable(): string {
  if (process.env.CURSOR_EXE && fs.existsSync(process.env.CURSOR_EXE)) {
    return process.env.CURSOR_EXE;
  }

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'cursor', 'Cursor.exe'));
    }
    candidates.push('cursor');
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Cursor.app/Contents/MacOS/Cursor', 'cursor');
  } else {
    candidates.push('cursor');
  }

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    const which = spawnSync(candidate, ['--version'], { encoding: 'utf-8' });
    if (which.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    'Cursor executable not found. Set CURSOR_EXE to your Cursor binary before running integration tests.',
  );
}

async function main(): Promise<void> {
  try {
    const vsixPath = packageExtension();
    const cursorExecutable = resolveCursorExecutable();
    const extensionTestsPath = path.resolve(__dirname, 'integration', 'index');

    console.log(`Using Cursor executable: ${cursorExecutable}`);
    console.log(`Installing VSIX: ${vsixPath}`);

    await runTests({
      vscodeExecutablePath: cursorExecutable,
      extensionDevelopmentPath: projectRoot,
      extensionTestsPath,
      launchArgs: [
        fixtureWorkspace,
        '--disable-extensions',
        `--install-extension=${vsixPath}`,
        '--new-window',
      ],
    });
  } catch (error) {
    console.error('Integration tests failed:', error);
    process.exit(1);
  }
}

void main();
