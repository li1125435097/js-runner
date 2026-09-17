/**
 * 根据配置启停 MCP HTTP 服务，并把运行状态推给侧边栏。
 */
import * as vscode from 'vscode';
import { CallLogStore } from './callLogStore';
import { CommandBridge, CommandBridgeDeps } from './commandBridge';
import {
  generateMcpApiKey,
  getMcpServerSettings,
  MCP_CONFIG_SECTION,
  updateMcpServerSettings,
} from './mcpConfig';
import { McpHttpServer } from './mcpHttpServer';
import { McpProtocol } from './mcpProtocol';

export interface McpServerStatus {
  enabled: boolean;
  status: 'running' | 'stop';
  preferredPort: number;
  port?: number;
  endpoint?: string;
  apiKey: string;
  maxLogEntries: number;
  reason?: string;
}

export class McpServerController implements vscode.Disposable {
  private readonly httpServer: McpHttpServer;
  private readonly protocol: McpProtocol;
  private readonly configListener: vscode.Disposable;
  private readonly _onDidChangeStatus = new vscode.EventEmitter<McpServerStatus>();
  readonly onDidChangeStatus = this._onDidChangeStatus.event;
  private syncing = false;
  private current: McpServerStatus;

  constructor(
    deps: CommandBridgeDeps,
    private readonly callLogStore: CallLogStore,
    serverVersion: string,
  ) {
    const commandBridge = new CommandBridge(deps);
    this.protocol = new McpProtocol({
      serverVersion,
      commandBridge,
      callLogStore,
    });
    this.httpServer = new McpHttpServer({
      protocol: this.protocol,
      getApiKey: () => getMcpServerSettings().apiKey,
    });
    const settings = getMcpServerSettings();
    this.current = {
      enabled: settings.enabled,
      status: 'stop',
      preferredPort: settings.port,
      apiKey: settings.apiKey,
      maxLogEntries: settings.maxLogEntries,
      reason: 'Starting',
    };
    this.callLogStore.setMaxEntries(settings.maxLogEntries);
    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(MCP_CONFIG_SECTION)) {
        return;
      }
      const restart =
        event.affectsConfiguration(`${MCP_CONFIG_SECTION}.enabled`) ||
        event.affectsConfiguration(`${MCP_CONFIG_SECTION}.port`);
      void this.sync({ restart });
    });
  }

  getStatus(): McpServerStatus {
    return { ...this.current };
  }

  async start(): Promise<void> {
    await this.sync({ restart: true });
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await updateMcpServerSettings({ enabled });
  }

  async setPort(port: number): Promise<void> {
    await updateMcpServerSettings({ port });
  }

  async setApiKey(apiKey: string): Promise<void> {
    await updateMcpServerSettings({ apiKey });
  }

  async generateApiKey(): Promise<string> {
    const apiKey = generateMcpApiKey();
    await updateMcpServerSettings({ apiKey });
    return apiKey;
  }

  async setMaxLogEntries(maxLogEntries: number): Promise<void> {
    await updateMcpServerSettings({ maxLogEntries });
  }

  dispose(): void {
    this.configListener.dispose();
    this._onDidChangeStatus.dispose();
    void this.httpServer.close();
  }

  private async sync(options: { restart: boolean }): Promise<void> {
    if (this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const settings = getMcpServerSettings();
      this.callLogStore.setMaxEntries(settings.maxLogEntries);

      if (!settings.enabled) {
        await this.httpServer.close();
        this.setStatus({
          enabled: false,
          status: 'stop',
          preferredPort: settings.port,
          apiKey: settings.apiKey,
          maxLogEntries: settings.maxLogEntries,
          reason: 'Disabled',
        });
        return;
      }

      const alreadyRunningSamePort =
        this.httpServer.isListening() &&
        this.current.preferredPort === settings.port &&
        !options.restart;

      if (alreadyRunningSamePort) {
        this.setStatus({
          enabled: true,
          status: 'running',
          preferredPort: settings.port,
          port: this.httpServer.getBoundPort(),
          endpoint: this.endpointFor(this.httpServer.getBoundPort()),
          apiKey: settings.apiKey,
          maxLogEntries: settings.maxLogEntries,
        });
        return;
      }

      const result = await this.httpServer.listen(settings.port);
      if (result.status === 'running') {
        this.setStatus({
          enabled: true,
          status: 'running',
          preferredPort: settings.port,
          port: result.port,
          endpoint: this.endpointFor(result.port),
          apiKey: settings.apiKey,
          maxLogEntries: settings.maxLogEntries,
        });
        return;
      }

      this.setStatus({
        enabled: true,
        status: 'stop',
        preferredPort: settings.port,
        apiKey: settings.apiKey,
        maxLogEntries: settings.maxLogEntries,
        reason: result.reason,
      });
    } finally {
      this.syncing = false;
    }
  }

  private endpointFor(port: number | undefined): string | undefined {
    return port ? `http://127.0.0.1:${port}/mcp` : undefined;
  }

  private setStatus(status: McpServerStatus): void {
    this.current = status;
    this._onDidChangeStatus.fire(this.getStatus());
  }
}
