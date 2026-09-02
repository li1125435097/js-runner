import { execSync } from 'child_process';
import { splitInterpreterCommand } from './terminalCommand';
import { LanguageInterpreter } from './types';

const availabilityCache = new Map<string, boolean>();
const resolvedPathCache = new Map<string, string | undefined>();

let findExecutableOverride: ((executable: string) => string | undefined) | undefined;

/** @internal Test hook for mocking PATH lookup. */
export function setFindExecutableOverrideForTest(
  override: ((executable: string) => string | undefined) | undefined,
): void {
  findExecutableOverride = override;
  clearInterpreterDiscoveryCache();
}

export function clearInterpreterDiscoveryCache(): void {
  availabilityCache.clear();
  resolvedPathCache.clear();
}

function getExecutableName(path: string): string {
  return path.trim().split(/\s+/)[0] ?? path;
}

function findAllExecutablesInPath(executable: string): string[] {
  try {
    const command = process.platform === 'win32' ? `where ${executable}` : `which -a ${executable}`;
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Prefer Git Bash over WSL's System32 bash on Windows. */
export function pickPreferredExecutable(executable: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const normalizedExecutable = executable.toLowerCase();
  if (normalizedExecutable === 'bash' || normalizedExecutable === 'sh') {
    const gitBash = candidates.find(
      (candidate) =>
        /[\\/]Git[\\/][^\\/]+[\\/]bin[\\/]bash\.exe$/i.test(candidate) ||
        /[\\/]Git[\\/]usr[\\/]bin[\\/]bash\.exe$/i.test(candidate) ||
        /[\\/]msys(?:64|32)?[\\/][^\\/]+[\\/]bin[\\/]bash\.exe$/i.test(candidate),
    );
    if (gitBash) {
      return gitBash;
    }

    const nonWsl = candidates.find(
      (candidate) => !/[\\/]Windows[\\/]System32[\\/]bash\.exe$/i.test(candidate),
    );
    if (nonWsl) {
      return nonWsl;
    }
  }

  return candidates[0];
}

function findExecutableInPath(executable: string): string | undefined {
  const candidates = findAllExecutablesInPath(executable);
  return pickPreferredExecutable(executable, candidates);
}

function findExecutable(executable: string): string | undefined {
  if (findExecutableOverride) {
    return findExecutableOverride(executable);
  }
  return findExecutableInPath(executable);
}

function isAlwaysAvailable(interpreter: LanguageInterpreter): boolean {
  return interpreter.languageId === 'html';
}

function isInterpreterAvailable(path: string): boolean {
  if (availabilityCache.has(path)) {
    return availabilityCache.get(path)!;
  }

  const executable = getExecutableName(path);
  if (executable === 'default browser') {
    availabilityCache.set(path, true);
    return true;
  }

  const available = findExecutable(executable) !== undefined;
  availabilityCache.set(path, available);
  return available;
}

function resolveInterpreterPath(path: string): string | undefined {
  if (resolvedPathCache.has(path)) {
    return resolvedPathCache.get(path);
  }

  const trimmed = path.trim();
  const { executable, args } = splitInterpreterCommand(trimmed);
  const resolvedExecutable = findExecutable(executable);
  if (!resolvedExecutable) {
    resolvedPathCache.set(path, undefined);
    return undefined;
  }

  const resolved = args ? `${resolvedExecutable} ${args}` : resolvedExecutable;
  resolvedPathCache.set(path, resolved);
  return resolved;
}

function adaptLocalInterpreter(interpreter: LanguageInterpreter): LanguageInterpreter {
  if (isAlwaysAvailable(interpreter)) {
    return interpreter;
  }

  const adaptedPath = resolveInterpreterPath(interpreter.path);
  if (!adaptedPath) {
    return interpreter;
  }

  return { ...interpreter, path: adaptedPath };
}

/**
 * Append default interpreters that exist in the local terminal PATH.
 * Existing entries are kept unchanged; missing languageIds are filled from defaults when found locally.
 */
export function appendAvailableLocalInterpreters(
  existing: LanguageInterpreter[],
  defaults: LanguageInterpreter[],
): LanguageInterpreter[] {
  const result = [...existing];
  const configuredLanguageIds = new Set(existing.map((item) => item.languageId));

  for (const interpreter of defaults) {
    if (configuredLanguageIds.has(interpreter.languageId)) {
      continue;
    }
    if (!isAlwaysAvailable(interpreter) && !isInterpreterAvailable(interpreter.path)) {
      continue;
    }

    result.push(adaptLocalInterpreter(interpreter));
    configuredLanguageIds.add(interpreter.languageId);
  }

  return result;
}
