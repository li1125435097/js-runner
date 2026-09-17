/**
 * 将 JS Runner MCP 写入 Cursor / VS Code 的全局 mcp.json。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clampMcpPort } from './mcpConfig';
import { resolveUserKeybindingsPath, stripJsonc } from '../shortcuts/userKeybindingsFile';

export const MCP_CLIENT_SERVER_NAME = 'js_runner_kit';

export interface McpJsonFileAdapter {
  read(): string | undefined;
  write(text: string): void;
}

type McpServerMap = Record<string, Record<string, unknown>>;

export function isCursorApp(appName: string): boolean {
  return appName.toLowerCase().includes('cursor');
}

export function resolveGlobalMcpJsonPath(
  appName: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (isCursorApp(appName)) {
    return path.join(os.homedir(), '.cursor', 'mcp.json');
  }
  const keybindingsPath = resolveUserKeybindingsPath(appName, env, platform);
  return path.join(path.dirname(keybindingsPath), 'mcp.json');
}

export function createFsMcpJsonAdapter(filePath: string): McpJsonFileAdapter {
  return {
    read() {
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch {
        return undefined;
      }
    },
    write(text: string) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, text, 'utf8');
    },
  };
}

export function mcpServersPropertyForApp(appName: string): 'mcpServers' | 'servers' {
  return isCursorApp(appName) ? 'mcpServers' : 'servers';
}

export function buildRemoteMcpServerEntry(
  appName: string,
  port: number,
  apiKey: string,
): Record<string, unknown> {
  const url = `http://127.0.0.1:${clampMcpPort(port)}/mcp`;
  if (isCursorApp(appName)) {
    const entry: Record<string, unknown> = { url };
    if (apiKey) {
      entry.headers = { 'api-key': apiKey };
    }
    return entry;
  }
  const entry: Record<string, unknown> = { type: 'http', url };
  if (apiKey) {
    entry.headers = { 'api-key': apiKey };
  }
  return entry;
}

function parseMcpJsonRoot(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stripJsonc(text));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('mcp.json must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function readServerMap(root: Record<string, unknown>, property: 'mcpServers' | 'servers'): McpServerMap {
  const raw = root[property];
  if (raw === undefined) {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${property} must be an object`);
  }
  const map: McpServerMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      map[key] = { ...(value as Record<string, unknown>) };
    }
  }
  return map;
}

export function mergeJsRunnerMcpServerEntry(
  appName: string,
  existingText: string | undefined,
  port: number,
  apiKey: string,
): string {
  const property = mcpServersPropertyForApp(appName);
  const root =
    existingText === undefined ? {} : parseMcpJsonRoot(existingText);
  const servers = readServerMap(root, property);
  servers[MCP_CLIENT_SERVER_NAME] = buildRemoteMcpServerEntry(appName, port, apiKey);
  const next: Record<string, unknown> = { ...root, [property]: servers };
  return `${JSON.stringify(next, null, 4)}\n`;
}

export function applyJsRunnerMcpServerToGlobalFile(
  adapter: McpJsonFileAdapter,
  appName: string,
  port: number,
  apiKey: string,
): boolean {
  const existing = adapter.read();
  const next = mergeJsRunnerMcpServerEntry(appName, existing, port, apiKey);
  if (existing === next) {
    return false;
  }
  adapter.write(next);
  return true;
}
