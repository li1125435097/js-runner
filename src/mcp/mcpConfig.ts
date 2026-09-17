/**
 * MCP Server 用户配置：开关、端口、API Key、调用记录上限。
 */
import { randomBytes } from 'crypto';
import * as vscode from 'vscode';

export const MCP_CONFIG_SECTION = 'jsRunner.mcpServer';
export const DEFAULT_MCP_PORT = 38888;
export const DEFAULT_MAX_LOG_ENTRIES = 100_000;
export const MAX_PORT = 65535;

export interface McpServerSettings {
  enabled: boolean;
  port: number;
  apiKey: string;
  maxLogEntries: number;
  autoRegisterClient: boolean;
}

function mcpConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(MCP_CONFIG_SECTION);
}

export function clampMcpPort(port: number): number {
  if (!Number.isFinite(port)) {
    return DEFAULT_MCP_PORT;
  }
  const rounded = Math.trunc(port);
  if (rounded < 1) {
    return 1;
  }
  if (rounded > MAX_PORT) {
    return MAX_PORT;
  }
  return rounded;
}

export function clampMaxLogEntries(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_LOG_ENTRIES;
  }
  return Math.max(1, Math.trunc(value));
}

export function getMcpServerSettings(): McpServerSettings {
  const config = mcpConfig();
  return {
    enabled: config.get<boolean>('enabled', true),
    port: clampMcpPort(config.get<number>('port', DEFAULT_MCP_PORT)),
    apiKey: (config.get<string>('apiKey', '') ?? '').trim(),
    maxLogEntries: clampMaxLogEntries(
      config.get<number>('maxLogEntries', DEFAULT_MAX_LOG_ENTRIES),
    ),
    autoRegisterClient: config.get<boolean>('autoRegisterClient', true),
  };
}

export async function updateMcpServerSettings(
  patch: Partial<McpServerSettings>,
): Promise<void> {
  const config = mcpConfig();
  const target = vscode.ConfigurationTarget.Global;
  if (patch.enabled !== undefined) {
    await config.update('enabled', patch.enabled, target);
  }
  if (patch.port !== undefined) {
    await config.update('port', clampMcpPort(patch.port), target);
  }
  if (patch.apiKey !== undefined) {
    await config.update('apiKey', patch.apiKey, target);
  }
  if (patch.maxLogEntries !== undefined) {
    await config.update('maxLogEntries', clampMaxLogEntries(patch.maxLogEntries), target);
  }
  if (patch.autoRegisterClient !== undefined) {
    await config.update('autoRegisterClient', patch.autoRegisterClient, target);
  }
}

export function generateMcpApiKey(): string {
  return randomBytes(16).toString('hex');
}

export function buildMcpClientConfigJson(port: number, apiKey: string): string {
  return JSON.stringify(
    {
      js_runner_kit: {
        url: `http://127.0.0.1:${clampMcpPort(port)}/mcp`,
        headers: {
          'api-key': apiKey,
        },
      },
    },
    null,
    4,
  );
}
