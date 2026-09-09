import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const JS_RUNNER_DIR = '.js-runner';
export const ADD_VERSION_VALUE = '__add__';

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9.~_-]+\/)?[a-z0-9.~_-]+$/i;
const VERSION_PATTERN = /^[0-9A-Za-z.+-]+$/;

export type NpmInstallRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

let npmInstallRunnerOverride: NpmInstallRunner | undefined;

/** @internal Test hook. */
export function setNpmInstallRunnerForTest(runner: NpmInstallRunner | undefined): void {
  npmInstallRunnerOverride = runner;
}

export function assertSafePackageName(name: string): void {
  if (!PACKAGE_NAME_PATTERN.test(name) || name.includes('..') || name.includes('\\')) {
    throw new Error(`JS Runner: invalid package name "${name}".`);
  }
}

export function assertSafeVersion(version: string): void {
  if (!VERSION_PATTERN.test(version) || version.includes('..') || version.includes('/') || version.includes('\\')) {
    throw new Error(`JS Runner: invalid package version "${version}".`);
  }
}

export function getTopLevelPackagePath(packageDir: string, name: string): string {
  assertSafePackageName(name);
  const topLevel = path.resolve(packageDir, 'node_modules', name);
  const nodeModulesRoot = path.resolve(packageDir, 'node_modules');
  const pnpmStore = path.resolve(packageDir, 'node_modules', '.pnpm');
  if (topLevel === nodeModulesRoot || !topLevel.startsWith(nodeModulesRoot + path.sep)) {
    throw new Error(`JS Runner: package path escapes node_modules for "${name}".`);
  }
  if (topLevel === pnpmStore || topLevel.startsWith(pnpmStore + path.sep)) {
    throw new Error(`JS Runner: refusing to modify the pnpm store for "${name}".`);
  }
  return topLevel;
}

export function getCachedVersionPrefix(packageDir: string, name: string, version: string): string {
  assertSafePackageName(name);
  assertSafeVersion(version);
  return path.join(packageDir, JS_RUNNER_DIR, 'packages', name, version);
}

export function getCachedPackageEntry(packageDir: string, name: string, version: string): string {
  return path.join(getCachedVersionPrefix(packageDir, name, version), 'node_modules', name);
}

export function isYarnPnp(packageDir: string): boolean {
  return fs.existsSync(path.join(packageDir, '.pnp.cjs')) || fs.existsSync(path.join(packageDir, '.pnp.js'));
}

function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function hasNodeModulesDirectory(packageDir: string): boolean {
  const nodeModulesDir = path.join(packageDir, 'node_modules');
  try {
    return fs.statSync(nodeModulesDir).isDirectory();
  } catch {
    return false;
  }
}

export function canSwitchInstalledPackage(packageDir: string, name: string): boolean {
  try {
    assertSafePackageName(name);
    if (!hasNodeModulesDirectory(packageDir)) {
      return false;
    }

    if (isYarnPnp(packageDir) && !pathExists(getTopLevelPackagePath(packageDir, name))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function compareVersionsDescending(a: string, b: string): number {
  return compareVersionsAscending(b, a);
}

function compareVersionsAscending(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  const length = Math.max(parsedA.nums.length, parsedB.nums.length);
  for (let index = 0; index < length; index += 1) {
    const left = parsedA.nums[index] ?? 0;
    const right = parsedB.nums[index] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }

  if (parsedA.pre === parsedB.pre) {
    return a.localeCompare(b);
  }
  if (!parsedA.pre) {
    return 1;
  }
  if (!parsedB.pre) {
    return -1;
  }
  return parsedA.pre.localeCompare(parsedB.pre);
}

function parseVersion(version: string): { nums: number[]; pre: string } {
  const withoutBuild = version.split('+')[0] ?? version;
  const dash = withoutBuild.indexOf('-');
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const pre = dash === -1 ? '' : withoutBuild.slice(dash + 1);
  const nums = core.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    return Number.isFinite(value) ? value : 0;
  });
  return { nums, pre };
}

export function listCachedVersions(packageDir: string, name: string): string[] {
  assertSafePackageName(name);
  const versionsRoot = path.join(packageDir, JS_RUNNER_DIR, 'packages', name);
  if (!fs.existsSync(versionsRoot)) {
    return [];
  }

  const versions: string[] = [];
  for (const entry of fs.readdirSync(versionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!VERSION_PATTERN.test(entry.name)) {
      continue;
    }
    const packageJsonPath = path.join(getCachedPackageEntry(packageDir, name, entry.name), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      versions.push(entry.name);
    }
  }

  return versions.sort(compareVersionsDescending);
}

export function readInstalledPackageVersion(packageDir: string, name: string): string | undefined {
  return readVersionFromPackageDir(getTopLevelPackagePath(packageDir, name));
}

function readVersionFromPackageDir(packageEntry: string): string | undefined {
  const packageJsonPath = path.join(packageEntry, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function ensureJsRunnerGitignore(packageDir: string): void {
  const jsRunnerDir = path.join(packageDir, JS_RUNNER_DIR);
  fs.mkdirSync(jsRunnerDir, { recursive: true });
  const gitignorePath = path.join(jsRunnerDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n', 'utf-8');
  }
}

export function seedCurrentInstalledVersion(packageDir: string, name: string): string | undefined {
  assertSafePackageName(name);
  const topLevel = getTopLevelPackagePath(packageDir, name);
  if (!pathExists(topLevel)) {
    return undefined;
  }

  const version = readVersionFromPackageDir(topLevel);
  if (!version) {
    return undefined;
  }

  assertSafeVersion(version);
  const cachedEntry = getCachedPackageEntry(packageDir, name, version);
  if (fs.existsSync(path.join(cachedEntry, 'package.json'))) {
    return version;
  }

  ensureJsRunnerGitignore(packageDir);
  fs.mkdirSync(path.dirname(cachedEntry), { recursive: true });
  if (pathExists(cachedEntry)) {
    fs.rmSync(cachedEntry, { recursive: true, force: true });
  }
  fs.cpSync(topLevel, cachedEntry, { recursive: true, dereference: true });
  return version;
}

function isLinkWithoutFollowing(target: string, stats: fs.Stats): boolean {
  if (stats.isSymbolicLink()) {
    return true;
  }

  if (process.platform === 'win32' && stats.isDirectory()) {
    try {
      fs.readlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function removeTopLevelEntryWithoutFollowing(entryPath: string): void {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(entryPath);
  } catch {
    return;
  }

  if (isLinkWithoutFollowing(entryPath, stats)) {
    try {
      fs.unlinkSync(entryPath);
      return;
    } catch {
      try {
        fs.rmdirSync(entryPath);
        return;
      } catch {
        // fall through to directory removal only for real folders
      }
    }
  }

  if (stats.isDirectory()) {
    fs.rmSync(entryPath, { recursive: true, force: true });
    return;
  }

  fs.unlinkSync(entryPath);
}

function retargetTopLevelEntry(source: string, destination: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const absoluteSource = path.resolve(source);

  try {
    if (process.platform === 'win32') {
      fs.symlinkSync(absoluteSource, destination, 'junction');
    } else {
      fs.symlinkSync(absoluteSource, destination, 'dir');
    }
  } catch {
    fs.cpSync(absoluteSource, destination, { recursive: true, dereference: true });
  }
}

export function switchInstalledVersion(packageDir: string, name: string, version: string): void {
  assertSafePackageName(name);
  assertSafeVersion(version);

  if (!canSwitchInstalledPackage(packageDir, name)) {
    throw new Error(`JS Runner: cannot switch versions for "${name}" in this package layout.`);
  }

  seedCurrentInstalledVersion(packageDir, name);

  const cachedEntry = getCachedPackageEntry(packageDir, name, version);
  if (!fs.existsSync(path.join(cachedEntry, 'package.json'))) {
    throw new Error(`JS Runner: cached version ${name}@${version} was not found.`);
  }

  const topLevel = getTopLevelPackagePath(packageDir, name);
  removeTopLevelEntryWithoutFollowing(topLevel);
  retargetTopLevelEntry(cachedEntry, topLevel);
}

export function getNpmCliName(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function buildNpmCacheInstallArgs(
  name: string,
  version: string,
  cachePrefixDir: string,
  registryUrl: string,
): string[] {
  assertSafePackageName(name);
  assertSafeVersion(version);
  return [
    'install',
    `${name}@${version}`,
    '--prefix',
    cachePrefixDir,
    '--no-package-lock',
    '--ignore-scripts',
    '--registry',
    registryUrl,
  ];
}

async function defaultNpmInstallRunner(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(command, args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

export async function installPackageVersionToCache(
  packageDir: string,
  name: string,
  version: string,
  registryUrl: string,
): Promise<void> {
  assertSafePackageName(name);
  assertSafeVersion(version);

  const cachedEntry = getCachedPackageEntry(packageDir, name, version);
  if (fs.existsSync(path.join(cachedEntry, 'package.json'))) {
    return;
  }

  ensureJsRunnerGitignore(packageDir);
  const cachePrefixDir = getCachedVersionPrefix(packageDir, name, version);
  fs.mkdirSync(cachePrefixDir, { recursive: true });

  const args = buildNpmCacheInstallArgs(name, version, cachePrefixDir, registryUrl);
  const runner = npmInstallRunnerOverride ?? defaultNpmInstallRunner;
  try {
    await runner(getNpmCliName(), args);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`JS Runner: failed to cache ${name}@${version}. ${detail}`);
  }

  if (!fs.existsSync(path.join(cachedEntry, 'package.json'))) {
    throw new Error(`JS Runner: npm did not install ${name}@${version} into the version cache.`);
  }
}
