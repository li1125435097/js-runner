/**
 * MCP JSON-RPC：initialize / tools/list / tools/call / ping。
 */
import { CallLogStore } from './callLogStore';
import { CommandBridge } from './commandBridge';
import { getMcpTool, listMcpToolsForProtocol } from './toolRegistry';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SERVER_NAME = 'js-runner-kit';

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
]);

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpProtocolOptions {
  serverVersion: string;
  commandBridge: CommandBridge;
  callLogStore: CallLogStore;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRequest(value: unknown): JsonRpcRequest {
  if (!isObject(value)) {
    throw Object.assign(new Error('Parse error'), { rpcCode: -32700 });
  }
  return value as JsonRpcRequest;
}

export class McpProtocol {
  constructor(private readonly options: McpProtocolOptions) {}

  async handleMessage(raw: unknown): Promise<JsonRpcResponse | undefined> {
    let request: JsonRpcRequest;
    try {
      request = asRequest(raw);
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : 'Parse error' },
      };
    }

    const id = request.id ?? null;
    const isNotification = request.id === undefined;
    if (!request.method) {
      if (isNotification) {
        return undefined;
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request: method is required' },
      };
    }

    try {
      const result = await this.dispatch(request.method, request.params);
      if (isNotification) {
        return undefined;
      }
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (isNotification) {
        return undefined;
      }
      const code =
        error && typeof error === 'object' && 'rpcCode' in error
          ? Number((error as { rpcCode: number }).rpcCode)
          : -32603;
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.initialize(params);
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return {};
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: listMcpToolsForProtocol() };
      case 'tools/call':
        return this.callTool(params);
      default: {
        const error = new Error(`Method not found: ${method}`);
        (error as Error & { rpcCode: number }).rpcCode = -32601;
        throw error;
      }
    }
  }

  private initialize(params: unknown): unknown {
    const requested =
      isObject(params) && typeof params.protocolVersion === 'string'
        ? params.protocolVersion
        : MCP_PROTOCOL_VERSION;
    return {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested)
        ? requested
        : MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: this.options.serverVersion,
      },
    };
  }

  private async callTool(params: unknown): Promise<unknown> {
    if (!isObject(params) || typeof params.name !== 'string') {
      const error = new Error('Invalid params: name is required');
      (error as Error & { rpcCode: number }).rpcCode = -32602;
      throw error;
    }

    const name = params.name;
    const args = isObject(params.arguments) ? params.arguments : {};
    const tool = getMcpTool(name);
    const started = Date.now();

    if (!tool) {
      const message = `Unknown tool: ${name}`;
      this.options.callLogStore.append({
        timestamp: started,
        tool: name,
        arguments: args,
        status: 'error',
        durationMs: Date.now() - started,
        error: message,
      });
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }

    try {
      const result = await this.options.commandBridge.invoke(name, args);
      const text = JSON.stringify(result, null, 2);
      this.options.callLogStore.append({
        timestamp: started,
        tool: name,
        arguments: args,
        status: 'ok',
        durationMs: Date.now() - started,
        result,
      });
      return {
        content: [{ type: 'text', text }],
        isError: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.callLogStore.append({
        timestamp: started,
        tool: name,
        arguments: args,
        status: 'error',
        durationMs: Date.now() - started,
        error: message,
      });
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  }
}
