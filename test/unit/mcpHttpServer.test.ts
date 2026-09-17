import { expect } from 'chai';
import * as http from 'http';
import * as net from 'net';
import * as proxyquire from 'proxyquire';

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

type McpProtocol = {
  handleMessage: (raw: unknown) => Promise<JsonRpcResponse | undefined>;
};

type McpHttpServer = {
  listen: (port: number) => Promise<{ status: 'running'; port: number } | { status: 'stop'; reason: string }>;
  close: () => Promise<void>;
  getBoundPort: () => number | undefined;
};

function loadHttpServer() {
  const callLogStoreMod = proxyquire.noCallThru()('../../mcp/callLogStore', {});
  const toolRegistry = proxyquire.noCallThru()('../../mcp/toolRegistry', {});
  const mcpProtocolMod = proxyquire.noCallThru()('../../mcp/mcpProtocol', {
    './callLogStore': callLogStoreMod,
    './commandBridge': {},
    './toolRegistry': toolRegistry,
  });
  const mcpHttpServerMod = proxyquire.noCallThru()('../../mcp/mcpHttpServer', {
    './mcpConfig': { MAX_PORT: 65535 },
    './mcpProtocol': mcpProtocolMod,
  });
  return {
    CallLogStore: callLogStoreMod.CallLogStore as new (max: number) => {
      append: (entry: unknown) => unknown;
    },
    McpProtocol: mcpProtocolMod.McpProtocol as new (options: {
      serverVersion: string;
      commandBridge: { invoke: (name: string, args: Record<string, unknown>) => Promise<unknown> };
      callLogStore: unknown;
    }) => McpProtocol,
    McpHttpServer: mcpHttpServerMod.McpHttpServer as new (options: {
      protocol: McpProtocol;
      getApiKey: () => string;
      maxPort?: number;
    }) => McpHttpServer,
  };
}

function listenDummy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: net.Server | http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function getFreePort(): Promise<number> {
  const dummy = await listenDummy(0);
  const port = (dummy.address() as net.AddressInfo).port;
  await closeServer(dummy);
  return port;
}

function request(options: {
  port: number;
  path: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<{
  status: number;
  raw: string;
  json: unknown;
  contentType: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const data = options.body === undefined ? '' : JSON.stringify(options.body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: {
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk as Buffer));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json: unknown = null;
          const payload = raw.startsWith('event:')
            ? raw.replace(/^event: message\ndata: /, '').trim()
            : raw;
          try {
            json = payload ? JSON.parse(payload) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode ?? 0,
            raw,
            json,
            contentType: String(res.headers['content-type'] ?? ''),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function createServer(getApiKey: () => string, maxPort?: number): McpHttpServer {
  const { CallLogStore, McpProtocol, McpHttpServer } = loadHttpServer();
  const protocol = new McpProtocol({
    serverVersion: 'test',
    callLogStore: new CallLogStore(10),
    commandBridge: {
      invoke: async (name: string) => ({ invoked: name }),
    },
  });
  return new McpHttpServer({ protocol, getApiKey, maxPort });
}

describe('McpHttpServer', () => {
  const servers: Array<McpHttpServer | net.Server> = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      if ('getBoundPort' in server) {
        await (server as McpHttpServer).close();
      } else {
        await closeServer(server as net.Server);
      }
    }
  });

  it('binds the next port when the preferred port is in use', async () => {
    const blocker = await listenDummy(0);
    servers.push(blocker);
    const occupied = (blocker.address() as net.AddressInfo).port;
    const mcp = createServer(() => '');
    servers.push(mcp);

    const result = await mcp.listen(occupied);
    expect(result.status).to.equal('running');
    if (result.status === 'running') {
      expect(result.port).to.be.greaterThan(occupied);
    }
  });

  it('stops when every port through maxPort is occupied', async () => {
    const blocker = await listenDummy(0);
    servers.push(blocker);
    const occupied = (blocker.address() as net.AddressInfo).port;
    const mcp = createServer(() => '', occupied);
    servers.push(mcp);

    const result = await mcp.listen(occupied);
    expect(result).to.deep.include({ status: 'stop' });
    if (result.status === 'stop') {
      expect(result.reason).to.match(/No available port/);
    }
  });

  it('allows unauthenticated access when the API key is empty', async () => {
    const mcp = createServer(() => '');
    servers.push(mcp);
    const result = await mcp.listen(await getFreePort());
    expect(result.status).to.equal('running');
    if (result.status !== 'running') {
      return;
    }

    const health = await request({ port: result.port, path: '/health', method: 'GET' });
    expect(health.status).to.equal(200);
    expect(health.json).to.deep.include({ status: 'running', port: result.port });

    const listed = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(listed.status).to.equal(200);
    const body = listed.json as { result?: { tools?: unknown[] } };
    expect(body.result?.tools).to.be.an('array').that.is.not.empty;
  });

  it('answers CORS preflight for browser MCP clients', async () => {
    const mcp = createServer(() => '');
    servers.push(mcp);
    const result = await mcp.listen(await getFreePort());
    expect(result.status).to.equal('running');
    if (result.status !== 'running') {
      return;
    }

    const preflight = await request({
      port: result.port,
      path: '/mcp',
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, mcp-protocol-version, mcp-session-id, mcp-method',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(preflight.status).to.equal(204);
    expect(preflight.raw).to.equal('');
    expect(preflight.headers['access-control-allow-origin']).to.equal('http://localhost:5173');
    expect(String(preflight.headers['access-control-allow-methods'])).to.include('POST');
    expect(preflight.headers['access-control-allow-headers']).to.equal(
      'content-type, mcp-protocol-version, mcp-session-id, mcp-method',
    );
    expect(String(preflight.headers['access-control-expose-headers'])).to.match(/mcp-protocol-version/i);
    expect(preflight.headers['access-control-allow-private-network']).to.equal('true');
    expect(preflight.headers['access-control-max-age']).to.equal('86400');
  });

  it('rejects requests with the wrong API key and accepts Bearer / X-Api-Key', async () => {
    const mcp = createServer(() => 'super-secret');
    servers.push(mcp);
    const result = await mcp.listen(await getFreePort());
    expect(result.status).to.equal('running');
    if (result.status !== 'running') {
      return;
    }

    const denied = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      body: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    expect(denied.status).to.equal(401);

    const wrong = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      headers: { Authorization: 'Bearer nope' },
      body: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    expect(wrong.status).to.equal(401);

    const bearer = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret' },
      body: { jsonrpc: '2.0', id: 2, method: 'ping' },
    });
    expect(bearer.status).to.equal(200);
    expect(bearer.json).to.deep.include({ jsonrpc: '2.0', id: 2, result: {} });

    const headerKey = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      headers: { 'X-Api-Key': 'super-secret', Accept: 'text/event-stream' },
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'jsRunner_stopAll' } },
    });
    expect(headerKey.status).to.equal(200);
    expect(headerKey.contentType).to.include('text/event-stream');
    const sse = headerKey.json as { result?: { isError?: boolean; content?: Array<{ text: string }> } };
    expect(sse.result?.isError).to.equal(false);
    expect(sse.result?.content?.[0]?.text).to.include('invoked');

    const apiKeyHeader = await request({
      port: result.port,
      path: '/mcp',
      method: 'POST',
      headers: { 'api-key': 'super-secret' },
      body: { jsonrpc: '2.0', id: 4, method: 'ping' },
    });
    expect(apiKeyHeader.status).to.equal(200);
  });
});
