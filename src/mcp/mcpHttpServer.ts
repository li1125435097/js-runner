/**
 * 本机 MCP Streamable HTTP：端口占用则 +1，鉴权后转发 JSON-RPC。
 */
import * as http from 'http';
import { MAX_PORT } from './mcpConfig';
import { JsonRpcResponse, McpProtocol } from './mcpProtocol';

export type McpListenResult =
  | { status: 'running'; port: number }
  | { status: 'stop'; reason: string };

export interface McpHttpServerOptions {
  protocol: McpProtocol;
  getApiKey: () => string;
  host?: string;
  maxPort?: number;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function wantsSse(req: http.IncomingMessage): boolean {
  return headerValue(req.headers.accept).toLowerCase().includes('text/event-stream');
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function pathnameOf(req: http.IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  } catch {
    return req.url ?? '/';
  }
}

export class McpHttpServer {
  private server: http.Server | undefined;
  private boundPort: number | undefined;
  private readonly host: string;
  private readonly maxPort: number;

  constructor(private readonly options: McpHttpServerOptions) {
    this.host = options.host ?? '127.0.0.1';
    this.maxPort = options.maxPort ?? MAX_PORT;
  }

  getBoundPort(): number | undefined {
    return this.boundPort;
  }

  isListening(): boolean {
    return Boolean(this.server?.listening);
  }

  async listen(preferredPort: number): Promise<McpListenResult> {
    await this.close();
    const startPort = Math.min(Math.max(1, Math.trunc(preferredPort) || 1), this.maxPort);

    for (let port = startPort; port <= this.maxPort; port += 1) {
      try {
        this.server = await this.tryListen(port);
        this.boundPort = port;
        return { status: 'running', port };
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as NodeJS.ErrnoException).code)
          : '';
        if (code === 'EADDRINUSE') {
          continue;
        }
        this.boundPort = undefined;
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'stop', reason: message };
      }
    }

    this.boundPort = undefined;
    return {
      status: 'stop',
      reason: `No available port from ${startPort} to ${this.maxPort}`,
    };
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.boundPort = undefined;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private tryListen(port: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      const onError = (error: Error) => {
        server.close();
        reject(error);
      };
      server.once('error', onError);
      server.listen(port, this.host, () => {
        server.off('error', onError);
        resolve(server);
      });
    });
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const apiKey = this.options.getApiKey().trim();
    if (!apiKey) {
      return true;
    }
    const bearer = headerValue(req.headers.authorization);
    if (bearer === `Bearer ${apiKey}`) {
      return true;
    }
    return (
      headerValue(req.headers['x-api-key']) === apiKey ||
      headerValue(req.headers['api-key']) === apiKey
    );
  }

  private defaultCorsAllowHeaders(): string {
    return [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'api-key',
      'Accept',
      'Last-Event-ID',
      'Mcp-Session-Id',
      'Mcp-Protocol-Version',
      'Mcp-Method',
      'Mcp-Name',
      'mcp-session-id',
      'mcp-protocol-version',
    ].join(', ');
  }

  private writeCors(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = headerValue(req.headers.origin);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    const requestedHeaders = headerValue(req.headers['access-control-request-headers']);
    res.setHeader(
      'Access-Control-Allow-Headers',
      requestedHeaders || this.defaultCorsAllowHeaders(),
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Mcp-Session-Id, Mcp-Protocol-Version, mcp-session-id, mcp-protocol-version',
    );
    // 浏览器从 https/其他 origin 访问 127.0.0.1 时需要（Private Network Access）
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.writeCors(req, res);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Max-Age', '86400');
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = pathnameOf(req);

    if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
      const port = this.boundPort;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: this.isListening() ? 'running' : 'stop',
        port: port ?? null,
      }));
      return;
    }

    if (pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (!this.isAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let payload: unknown;
    try {
      const body = await readBody(req);
      payload = body ? JSON.parse(body) : {};
    } catch {
      this.writeRpc(res, req, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    const response = await this.options.protocol.handleMessage(payload);
    if (!response) {
      res.writeHead(202);
      res.end();
      return;
    }
    this.writeRpc(res, req, response);
  }

  private writeRpc(
    res: http.ServerResponse,
    req: http.IncomingMessage,
    response: JsonRpcResponse,
  ): void {
    const body = JSON.stringify(response);
    if (wantsSse(req)) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`event: message\ndata: ${body}\n\n`);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }
}
