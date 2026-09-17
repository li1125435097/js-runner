/**
 * VS Code 1.99+：通过 lm API 向编辑器注册本地 HTTP MCP，无需手改 mcp.json。
 */
import * as vscode from 'vscode';
import { MCP_CLIENT_SERVER_NAME } from './mcpGlobalConfigFile';
import { McpServerStatus } from './mcpServerController';

interface McpHttpServerDefinitionInit {
  label: string;
  uri: vscode.Uri;
  headers?: Record<string, string>;
  version?: string;
}

interface McpServerDefinitionProvider {
  onDidChangeMcpServerDefinitions: vscode.Event<void>;
  provideMcpServerDefinitions: () => Thenable<unknown[]>;
  resolveMcpServerDefinition?: (server: unknown) => Thenable<unknown | undefined>;
}

interface LmMcpApi {
  registerMcpServerDefinitionProvider?: (
    providerId: string,
    provider: McpServerDefinitionProvider,
  ) => vscode.Disposable;
  McpHttpServerDefinition?: new (init: McpHttpServerDefinitionInit) => unknown;
}

export const JS_RUNNER_MCP_DEFINITION_PROVIDER_ID = 'jsRunnerMcp';

export function hasVsCodeMcpDefinitionProviderApi(): boolean {
  const lm = vscode.lm as unknown as LmMcpApi | undefined;
  return (
    typeof lm?.registerMcpServerDefinitionProvider === 'function' &&
    typeof lm?.McpHttpServerDefinition === 'function'
  );
}

export function registerJsRunnerMcpServerDefinitionProvider(
  getStatus: () => McpServerStatus,
  onDidChangeStatus: vscode.Event<McpServerStatus>,
  serverVersion: string,
): vscode.Disposable | undefined {
  const lm = vscode.lm as unknown as LmMcpApi;
  if (!hasVsCodeMcpDefinitionProviderApi()) {
    return undefined;
  }

  const changeEmitter = new vscode.EventEmitter<void>();
  const statusListener = onDidChangeStatus(() => changeEmitter.fire());

  const provider = lm.registerMcpServerDefinitionProvider!(
    JS_RUNNER_MCP_DEFINITION_PROVIDER_ID,
    {
      onDidChangeMcpServerDefinitions: changeEmitter.event,
      provideMcpServerDefinitions: async () => {
        const status = getStatus();
        if (status.status !== 'running' || !status.port) {
          return [];
        }
        const headers: Record<string, string> = {};
        if (status.apiKey) {
          headers['api-key'] = status.apiKey;
        }
        return [
          new lm.McpHttpServerDefinition!({
            label: MCP_CLIENT_SERVER_NAME,
            uri: vscode.Uri.parse(`http://127.0.0.1:${status.port}/mcp`),
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            version: serverVersion,
          }),
        ];
      },
      resolveMcpServerDefinition: async (server) => server,
    },
  );

  return new vscode.Disposable(() => {
    statusListener.dispose();
    changeEmitter.dispose();
    provider?.dispose();
  });
}
