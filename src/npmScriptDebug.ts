import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface NpmScriptDebugInput {
  name: string;
  command: string;
  packageJsonPath: string;
}

const KNOWN_CLIS: Record<string, string> = {
  vite: 'vite',
  tsx: 'tsx',
  'ts-node': 'ts-node',
  nodemon: 'nodemon',
  next: 'next',
  nuxt: 'nuxt',
  jest: 'jest',
  mocha: 'mocha',
  webpack: 'webpack',
  rollup: 'rollup',
};

/** Split an npm script command into argv, respecting simple quotes. */
export function splitCommandLine(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote: '"' | "'" | null = null;

  for (const ch of command) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function stripEnvWrappers(parts: string[]): string[] {
  if (parts.length === 0) {
    return parts;
  }

  if (parts[0] === 'cross-env') {
    let index = 1;
    while (index < parts.length && /^[\w.-]+=/.test(parts[index])) {
      index += 1;
    }
    return parts.slice(index);
  }

  let start = 0;
  while (start < parts.length && /^[\w.-]+=/.test(parts[start])) {
    start += 1;
  }

  return parts.slice(start);
}

function getCliBaseName(part: string): string {
  return path.basename(part).replace(/\.(cmd|exe|js|mjs|cjs)$/i, '');
}

function resolveScriptPath(packageDir: string, scriptPath: string): string {
  if (path.isAbsolute(scriptPath)) {
    return scriptPath;
  }

  return path.join(packageDir, scriptPath);
}

function resolvePackageBin(packageDir: string, packageName: string): string | undefined {
  const packageJsonPath = path.join(packageDir, 'node_modules', packageName, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      bin?: string | Record<string, string>;
    };
    let binRelative: string | undefined;

    if (typeof pkg.bin === 'string') {
      binRelative = pkg.bin;
    } else if (pkg.bin) {
      binRelative = pkg.bin[packageName] ?? Object.values(pkg.bin)[0];
    }

    if (!binRelative) {
      return undefined;
    }

    const binPath = path.join(packageDir, 'node_modules', packageName, binRelative);
    return fs.existsSync(binPath) ? binPath : undefined;
  } catch {
    return undefined;
  }
}

function buildNodeLaunchConfig(
  name: string,
  dir: string,
  program: string,
  args: string[],
): vscode.DebugConfiguration {
  return {
    type: 'node',
    request: 'launch',
    name: `npm: ${name}`,
    cwd: dir,
    program,
    args,
    console: 'integratedTerminal',
    autoAttachChildProcesses: true,
    sourceMaps: true,
    resolveSourceMapLocations: ['**', '!**/node_modules/**'],
    skipFiles: ['<node_internals>/**'],
  };
}

function buildNodeTerminalFallback(name: string, dir: string): vscode.DebugConfiguration {
  const scriptName = name.includes(' ') ? `"${name.replace(/"/g, '\\"')}"` : name;

  return {
    type: 'node-terminal',
    request: 'launch',
    name: `npm: ${name}`,
    command: `npm run ${scriptName}`,
    cwd: dir,
    sourceMaps: true,
    resolveSourceMapLocations: ['**', '!**/node_modules/**'],
    skipFiles: ['<node_internals>/**'],
  };
}

/** Build a debug launch config that preserves editor breakpoints when possible. */
export function buildNpmScriptDebugConfig(input: NpmScriptDebugInput): vscode.DebugConfiguration {
  const dir = path.dirname(input.packageJsonPath);
  const parts = stripEnvWrappers(splitCommandLine(input.command.trim()));

  if (parts.length === 0) {
    return buildNodeTerminalFallback(input.name, dir);
  }

  const cliBase = getCliBaseName(parts[0]);

  if (cliBase === 'node') {
    let index = 1;
    while (index < parts.length) {
      const part = parts[index];
      if (part === '--loader' || part === '--require' || part === '-r') {
        index += 2;
        continue;
      }
      if (part.startsWith('-')) {
        index += 1;
        continue;
      }
      break;
    }

    if (index < parts.length) {
      const program = resolveScriptPath(dir, parts[index]);
      return buildNodeLaunchConfig(input.name, dir, program, parts.slice(index + 1));
    }
  }

  const packageName = KNOWN_CLIS[cliBase];
  if (packageName) {
    const program = resolvePackageBin(dir, packageName);
    if (program) {
      return buildNodeLaunchConfig(input.name, dir, program, parts.slice(1));
    }
  }

  if (/\.(js|mjs|cjs|ts|tsx|jsx)$/i.test(parts[0])) {
    const program = resolveScriptPath(dir, parts[0]);
    if (fs.existsSync(program)) {
      return buildNodeLaunchConfig(input.name, dir, program, parts.slice(1));
    }
  }

  return buildNodeTerminalFallback(input.name, dir);
}
