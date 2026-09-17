/**
 * MCP HTTP 服务启动成功后，自动注册到 Cursor / VS Code 的 MCP 客户端配置。
 */
import * as vscode from 'vscode';
import { getMcpServerSettings, MCP_CONFIG_SECTION } from './mcpConfig';
import {
  applyJsRunnerMcpServerToGlobalFile,
  createFsMcpJsonAdapter,
  isCursorApp,
  resolveGlobalMcpJsonPath,
} from './mcpGlobalConfigFile';
import { hasVsCodeMcpDefinitionProviderApi } from './mcpServerDefinitionProvider';
import { McpServerController, McpServerStatus } from './mcpServerController';

export class McpClientRegistration implements vscode.Disposable {
  private readonly statusListener: vscode.Disposable;
  private readonly configListener: vscode.Disposable;
  private warnedWriteFailure = false;

  constructor(private readonly controller: McpServerController) {
    this.statusListener = controller.onDidChangeStatus((status) => {
      void this.syncFromStatus(status);
    });
    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(`${MCP_CONFIG_SECTION}.autoRegisterClient`) ||
        event.affectsConfiguration(`${MCP_CONFIG_SECTION}.apiKey`)
      ) {
        void this.syncFromStatus(this.controller.getStatus());
      }
    });
    void this.syncFromStatus(controller.getStatus());
  }

  dispose(): void {
    this.statusListener.dispose();
    this.configListener.dispose();
  }

  private shouldWriteGlobalMcpJson(appName: string): boolean {
    if (isCursorApp(appName)) {
      return true;
    }
    return !hasVsCodeMcpDefinitionProviderApi();
  }

  private async syncFromStatus(status: McpServerStatus): Promise<void> {
    const settings = getMcpServerSettings();
    if (!settings.autoRegisterClient || status.status !== 'running' || !status.port) {
      return;
    }

    const appName = vscode.env.appName;
    if (!this.shouldWriteGlobalMcpJson(appName)) {
      return;
    }

    const filePath = resolveGlobalMcpJsonPath(appName);
    const adapter = createFsMcpJsonAdapter(filePath);
    try {
      const changed = applyJsRunnerMcpServerToGlobalFile(
        adapter,
        appName,
        status.port,
        status.apiKey,
      );
      if (changed) {
        const hostLabel = isCursorApp(appName) ? 'Cursor' : 'VS Code';
        void vscode.window.showInformationMessage(
          `JS Runner: MCP server registered in ${hostLabel} (${filePath}). Reload MCP if tools do not appear yet.`,
        );
      }
    } catch (error) {
      if (this.warnedWriteFailure) {
        return;
      }
      this.warnedWriteFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(
        `JS Runner: could not update MCP client config (${message}). Use Copy MCP config in the sidebar.`,
      );
    }
  }
}
