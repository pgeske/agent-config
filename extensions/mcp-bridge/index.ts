import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonObject = Record<string, unknown>;
type Env = Record<string, string | undefined>;

type McpAuthMode = "none" | "oauth";

export type McpOAuthConfig = {
  redirectUrl?: string;
  scopes?: string[];
  tokenEndpointAuthMethod?: string;
  clientName?: string;
  clientId?: string;
  clientSecret?: string;
};

export type McpServerConfig = {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  headers?: Record<string, string>;
  auth?: McpAuthMode;
  oauth?: McpOAuthConfig;
};

export type McpBridgeConfig = {
  servers: McpServerConfig[];
};

type CommonMcpConfig = {
  mcpServers?: Record<
    string,
    {
      url?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      headers?: Record<string, string>;
      auth?: string;
      oauth?: McpOAuthConfig | boolean;
    }
  >;
};

type BridgeConnection = {
  server: McpServerConfig;
  client: Client;
  transport: Transport;
  tools: Tool[];
};

type ServerStatus = {
  server: McpServerConfig;
  connected: boolean;
  toolCount: number;
  lastError?: string;
};

type PiToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: {
    server: string;
    tool: string;
    isError: boolean;
    contentTypes: unknown[];
    hasStructuredContent: boolean;
  };
};

type PersistedOAuthState = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  csrfState?: string;
  authorizationUrl?: string;
  discoveryState?: OAuthDiscoveryState;
};

const DEFAULT_CONFIG_PATH = "~/.pi/agent/mcp.json";
const DEFAULT_AUTH_DIR = "~/.pi/agent/mcp-auth";
const MAX_RESULT_TEXT_BYTES = 50 * 1024;
const MCP_OPERATION_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export function expandEnv(value: string, env: Env = process.env): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => {
    const replacement = env[name];
    if (replacement === undefined || replacement === "") {
      throw new Error(`Missing environment variable ${name}`);
    }
    return replacement;
  });
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

function parseAuthMode(serverName: string, input: string | undefined, oauth: McpOAuthConfig | boolean | undefined): McpAuthMode {
  if (input === undefined && oauth === undefined) return "none";
  if (input === "oauth" || oauth === true || typeof oauth === "object") return "oauth";
  if (input === "none") return "none";
  throw new Error(`MCP server ${serverName} has unsupported auth mode: ${input ?? String(oauth)}`);
}

export function loadConfigFromObject(input: unknown, env: Env = process.env): McpBridgeConfig {
  if (!input || typeof input !== "object") {
    throw new Error("MCP config must be a JSON object");
  }

  const common = input as CommonMcpConfig;
  const servers = Object.entries(common.mcpServers ?? {}).map(([name, server]) => {
    if (!server.url && !server.command) {
      throw new Error(`MCP server ${name} is missing url or command`);
    }
    if (server.url && server.command) {
      throw new Error(`MCP server ${name} must use either url or command, not both`);
    }

    const headers = Object.fromEntries(
      Object.entries(server.headers ?? {}).map(([key, value]) => [key, expandEnv(value, env)]),
    );
    const auth = parseAuthMode(name, server.auth, server.oauth);
    if (server.command && auth !== "none") {
      throw new Error(`MCP server ${name} uses stdio and cannot use OAuth or static auth`);
    }
    if (server.command && Object.keys(headers).length > 0) {
      throw new Error(`MCP server ${name} uses stdio and cannot use HTTP headers`);
    }
    if (auth === "oauth" && headers.Authorization) {
      throw new Error(`MCP server ${name} cannot combine OAuth with a static Authorization header`);
    }

    const oauth = typeof server.oauth === "object"
      ? {
          ...server.oauth,
          ...(server.oauth.clientId ? { clientId: expandEnv(server.oauth.clientId, env) } : {}),
          ...(server.oauth.clientSecret ? { clientSecret: expandEnv(server.oauth.clientSecret, env) } : {}),
        }
      : undefined;
    const stdioEnv = server.env
      ? Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, expandEnv(value, env)]))
      : undefined;

    return {
      name,
      auth,
      ...(server.url ? { url: server.url } : {}),
      ...(server.command ? { command: server.command } : {}),
      ...(server.args ? { args: server.args } : {}),
      ...(stdioEnv ? { env: stdioEnv } : {}),
      ...(server.cwd ? { cwd: expandPath(server.cwd) } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(oauth ? { oauth } : {}),
    };
  });

  return { servers };
}

export async function loadConfig(path = process.env.PI_MCP_CONFIG ?? DEFAULT_CONFIG_PATH): Promise<McpBridgeConfig | null> {
  const resolvedPath = expandPath(path);

  try {
    const raw = await readFile(resolvedPath, "utf8");
    return loadConfigFromObject(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function safeServerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function oauthStatePath(serverName: string, authDir = process.env.PI_MCP_AUTH_DIR ?? DEFAULT_AUTH_DIR): string {
  return resolve(expandPath(authDir), `${safeServerName(serverName)}.json`);
}

async function readOAuthState(path: string): Promise<PersistedOAuthState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PersistedOAuthState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeOAuthState(path: string, state: PersistedOAuthState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await chmod(dirname(path), 0o700).catch(() => undefined);
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, path);
}

export class FileOAuthClientProvider implements OAuthClientProvider {
  readonly redirectUrl: string | URL;
  readonly clientMetadata: OAuthClientMetadata;
  private lastState: PersistedOAuthState = {};

  constructor(
    readonly server: McpServerConfig,
    redirectUrl: string,
    private readonly statePath = oauthStatePath(server.name),
    private readonly onRedirect?: (url: URL) => void | Promise<void>,
  ) {
    this.redirectUrl = redirectUrl;
    this.clientMetadata = {
      client_name: server.oauth?.clientName ?? `Pi MCP Bridge (${server.name})`,
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: server.oauth?.tokenEndpointAuthMethod ?? "client_secret_post",
      ...(server.oauth?.scopes ? { scope: server.oauth.scopes.join(" ") } : {}),
    };
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    if (this.server.oauth?.clientId) {
      return {
        client_id: this.server.oauth.clientId,
        ...(this.server.oauth.clientSecret ? { client_secret: this.server.oauth.clientSecret } : {}),
      };
    }
    return (await this.read()).clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.update({ clientInformation });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.read()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.update({ tokens });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    await this.update({ authorizationUrl: url.toString() });
    await this.onRedirect?.(url);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const codeVerifier = (await this.read()).codeVerifier;
    if (!codeVerifier) throw new Error(`Missing OAuth code verifier for ${this.server.name}`);
    return codeVerifier;
  }

  async state(): Promise<string> {
    const existing = (await this.read()).csrfState;
    if (existing) return existing;
    const csrfState = randomBytes(24).toString("base64url");
    await this.update({ csrfState });
    return csrfState;
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    await this.update({ discoveryState });
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return (await this.read()).discoveryState;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
    const current = await this.read();
    if (scope === "all") {
      await writeOAuthState(this.statePath, {});
      return;
    }
    if (scope === "client") delete current.clientInformation;
    if (scope === "tokens") delete current.tokens;
    if (scope === "verifier") delete current.codeVerifier;
    if (scope === "discovery") delete current.discoveryState;
    await writeOAuthState(this.statePath, current);
  }

  async expectedState(): Promise<string | undefined> {
    return (await this.read()).csrfState;
  }

  async clearEphemeralLoginState(): Promise<void> {
    const current = await this.read();
    delete current.codeVerifier;
    delete current.csrfState;
    delete current.authorizationUrl;
    await writeOAuthState(this.statePath, current);
  }

  async removeStateFile(): Promise<void> {
    await rm(this.statePath, { force: true });
  }

  private async read(): Promise<PersistedOAuthState> {
    this.lastState = await readOAuthState(this.statePath);
    return this.lastState;
  }

  private async update(patch: Partial<PersistedOAuthState>): Promise<void> {
    const current = await this.read();
    this.lastState = { ...current, ...patch };
    await writeOAuthState(this.statePath, this.lastState);
  }
}

export function buildToolName(serverName: string, toolName: string): string {
  const safeServer = serverName.replace(/[^a-zA-Z0-9_]/g, "_");
  const safeTool = toolName.replace(/[^a-zA-Z0-9_]/g, "_");
  return `mcp_${safeServer}_${safeTool}`.replace(/_+/g, "_").toLowerCase();
}

export function buildUniqueToolName(serverName: string, toolName: string, usedNames: Set<string>): string {
  const baseName = buildToolName(serverName, toolName);
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  const hash = createHash("sha1").update(`${serverName}\0${toolName}`).digest("hex").slice(0, 8);
  let candidate = `${baseName}_${hash}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}_${hash}_${counter}`;
    counter += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function truncateText(text: string, maxBytes = MAX_RESULT_TEXT_BYTES): string {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return text;

  const truncated = Buffer.from(text).subarray(0, maxBytes).toString("utf8");
  return `${truncated}\n\n[MCP bridge output truncated: ${maxBytes} of ${bytes} bytes]`;
}

export function normalizeMcpContent(result: unknown): Array<{ type: "text"; text: string }> {
  const output: Array<{ type: "text"; text: string }> = [];
  const data = result && typeof result === "object" ? (result as JsonObject) : {};
  const content = Array.isArray(data.content) ? data.content : [];

  for (const item of content) {
    if (!item || typeof item !== "object") {
      output.push({ type: "text", text: String(item) });
      continue;
    }

    const entry = item as JsonObject;
    if (entry.type === "text" && typeof entry.text === "string") {
      output.push({ type: "text", text: truncateText(entry.text) });
      continue;
    }

    if (entry.type === "image") {
      output.push({ type: "text", text: `[image content: ${String(entry.mimeType ?? "unknown")}]` });
      continue;
    }

    if (entry.type === "resource_link") {
      output.push({ type: "text", text: `[resource link: ${String(entry.uri ?? entry.name ?? "unknown")}]` });
      continue;
    }

    if (entry.type === "resource") {
      output.push({ type: "text", text: truncateText(`[embedded resource: ${JSON.stringify(entry.resource ?? entry)}]`) });
      continue;
    }

    output.push({ type: "text", text: truncateText(JSON.stringify(entry)) });
  }

  if (data.structuredContent !== undefined) {
    output.push({ type: "text", text: truncateText(`Structured content:\n${JSON.stringify(data.structuredContent)}`) });
  }

  return output.length > 0 ? output : [{ type: "text", text: truncateText(JSON.stringify(result ?? null)) }];
}

function normalizeInputSchema(tool: Tool): JsonObject {
  if (tool.inputSchema && typeof tool.inputSchema === "object") {
    return tool.inputSchema as JsonObject;
  }

  return {
    type: "object",
    additionalProperties: true,
  };
}

function getMcpToolDetails(server: string, tool: string, result: unknown): PiToolResult["details"] {
  const data = result && typeof result === "object" ? (result as JsonObject) : {};

  return {
    server,
    tool,
    isError: data.isError === true,
    contentTypes: Array.isArray(data.content)
      ? data.content.map((item) => (item && typeof item === "object" && "type" in item ? (item as JsonObject).type : typeof item))
      : [],
    hasStructuredContent: data.structuredContent !== undefined,
  };
}

export class McpToolError extends Error {
  readonly details: PiToolResult["details"];
  readonly content: PiToolResult["content"];

  constructor(server: string, tool: string, content: PiToolResult["content"], details: PiToolResult["details"]) {
    const text = content.map((item) => item.text).join("\n").trim();
    super(`MCP tool ${server}/${tool} failed${text ? `:\n${text}` : ""}`);
    this.name = "McpToolError";
    this.details = details;
    this.content = content;
  }
}

export function mcpToolResultToPiToolResult(server: string, tool: string, result: unknown): PiToolResult {
  const content = normalizeMcpContent(result);
  const details = getMcpToolDetails(server, tool, result);

  if (details.isError) {
    throw new McpToolError(server, tool, content, details);
  }

  return { content, details };
}

function createHttpTransport(server: McpServerConfig, authProvider?: OAuthClientProvider): StreamableHTTPClientTransport {
  if (!server.url) throw new Error(`MCP server ${server.name} is missing url`);
  return new StreamableHTTPClientTransport(new URL(server.url), {
    ...(authProvider ? { authProvider } : {}),
    requestInit: server.headers ? { headers: server.headers } : undefined,
  });
}

function createTransport(server: McpServerConfig, authProvider?: OAuthClientProvider): Transport {
  if (server.command) {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
      // MCP servers may emit verbose operational logs that corrupt Pi's TUI.
      stderr: "ignore",
    });
  }

  return createHttpTransport(server, authProvider);
}

async function listTools(client: Client, serverName: string): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await withTimeout(
      client.listTools(cursor ? { cursor } : undefined),
      `listing tools from MCP server ${serverName}`,
    );
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export async function connectServer(server: McpServerConfig): Promise<BridgeConnection> {
  const client = new Client({ name: "pi-mcp-bridge", version: "0.1.0" });
  const authProvider = server.auth === "oauth" ? new FileOAuthClientProvider(server, server.oauth?.redirectUrl ?? "http://127.0.0.1:0/callback") : undefined;
  const transport = createTransport(server, authProvider);

  try {
    await withTimeout(client.connect(transport), `connecting to MCP server ${server.name}`);
    const tools = await listTools(client, server.name);
    return { server, client, transport, tools };
  } catch (error) {
    await transport.close().catch(() => undefined);
    if (error instanceof UnauthorizedError && server.auth === "oauth") {
      throw new Error(`MCP server ${server.name} requires OAuth login. Run /mcp-bridge-login ${server.name}.`);
    }
    throw error;
  }
}

export function withTimeout<T>(promise: Promise<T>, operation: string, timeoutMs = MCP_OPERATION_TIMEOUT_MS): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Timed out after ${timeoutMs}ms while ${operation}`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        rejectPromise(error);
      },
    );
  });
}

function registerMcpTool(pi: ExtensionAPI, connection: BridgeConnection, tool: Tool, usedToolNames: Set<string>): void {
  const name = buildUniqueToolName(connection.server.name, tool.name, usedToolNames);

  pi.registerTool({
    name,
    label: `MCP: ${connection.server.name}/${tool.name}`,
    description: tool.description ?? `Call MCP tool ${tool.name} on ${connection.server.name}`,
    promptSnippet: `Call MCP tool ${connection.server.name}/${tool.name}`,
    parameters: normalizeInputSchema(tool) as never,
    async execute(_toolCallId, params) {
      const result = await withTimeout(
        connection.client.callTool({
          name: tool.name,
          arguments: params as JsonObject,
        }),
        `calling MCP tool ${connection.server.name}/${tool.name}`,
      );

      return mcpToolResultToPiToolResult(connection.server.name, tool.name, result);
    },
  });
}

function openUrl(url: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function createCallbackListener(expectedState: () => Promise<string | undefined>, configuredRedirectUrl?: string): Promise<{
  redirectUrl: string;
  waitForCode: () => Promise<string>;
  close: () => Promise<void>;
}> {
  const configuredUrl = configuredRedirectUrl ? new URL(configuredRedirectUrl) : undefined;
  const callbackPath = configuredUrl?.pathname || "/callback";
  const callbackHost = configuredUrl?.hostname || "127.0.0.1";
  const callbackPort = configuredUrl ? (configuredUrl.port ? Number(configuredUrl.port) : 80) : 0;
  // Some macOS setups deny binding 127.0.0.1:80/localhost:80 directly, while
  // binding 0.0.0.0:80 still accepts localhost callbacks. Keep the advertised
  // redirect URI unchanged, but listen on all local interfaces for port 80.
  const listenHost = configuredUrl && callbackPort === 80 ? "0.0.0.0" : callbackHost;
  if (configuredUrl && configuredUrl.protocol !== "http:") throw new Error("OAuth redirectUrl must use http:// for the local callback listener");
  if (configuredUrl && !["127.0.0.1", "localhost"].includes(callbackHost)) throw new Error("OAuth redirectUrl must use localhost or 127.0.0.1");
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  const codePromise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolveCode = resolvePromise;
    rejectCode = rejectPromise;
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      if (error) throw new Error(`OAuth authorization failed: ${error}`);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("OAuth callback did not include a code");
      const expected = await expectedState();
      const actual = url.searchParams.get("state") ?? undefined;
      if (expected && actual !== expected) throw new Error("OAuth callback state did not match");

      res.writeHead(200, { "content-type": "text/plain" }).end("Pi MCP bridge login complete. You can close this window.");
      resolveCode(code);
    } catch (callbackError) {
      const message = callbackError instanceof Error ? callbackError.message : String(callbackError);
      res.writeHead(400, { "content-type": "text/plain" }).end(message);
      rejectCode(new Error(message));
    }
  });

  await new Promise<void>((resolvePromise) => server.listen(callbackPort, listenHost, resolvePromise));
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Could not start OAuth callback listener");

  return {
    redirectUrl: configuredRedirectUrl ?? `http://${callbackHost}:${address.port}${callbackPath}`,
    waitForCode: () => withTimeout(codePromise, "waiting for OAuth callback", LOGIN_TIMEOUT_MS),
    close: () => new Promise((resolvePromise, rejectPromise) => server.close((error) => (error ? rejectPromise(error) : resolvePromise()))),
  };
}

export async function loginServer(server: McpServerConfig, onAuthorizationUrl?: (url: string) => void | Promise<void>): Promise<BridgeConnection> {
  if (server.auth !== "oauth") throw new Error(`MCP server ${server.name} is not configured for OAuth`);

  const callback = await createCallbackListener(async () => provider.expectedState(), server.oauth?.redirectUrl);
  const provider = new FileOAuthClientProvider(server, callback.redirectUrl, oauthStatePath(server.name), async (url) => {
    const authorizationUrl = url.toString();
    await onAuthorizationUrl?.(authorizationUrl);
    openUrl(authorizationUrl);
  });
  await provider.invalidateCredentials("all");
  const client = new Client({ name: "pi-mcp-bridge-login", version: "0.1.0" });
  const transport = createHttpTransport(server, provider);

  try {
    try {
      await withTimeout(client.connect(transport), `starting OAuth login for MCP server ${server.name}`);
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
      const code = await callback.waitForCode();
      await transport.finishAuth(code);
    }
    await transport.close().catch(() => undefined);
    await provider.clearEphemeralLoginState();
    return connectServer(server);
  } finally {
    await transport.close().catch(() => undefined);
    await client.close().catch(() => undefined);
    await callback.close().catch(() => undefined);
  }
}

function findConfiguredServer(config: McpBridgeConfig | null, name: string): McpServerConfig {
  const server = config?.servers.find((candidate) => candidate.name === name);
  if (!server) throw new Error(`Unknown MCP server: ${name}`);
  return server;
}

export default function mcpBridge(pi: ExtensionAPI) {
  const connections: BridgeConnection[] = [];
  const statuses = new Map<string, ServerStatus>();
  const usedToolNames = new Set<string>();
  let closed = false;
  let started = false;

  async function connectConfiguredServers(): Promise<void> {
    if (started || closed) return;
    started = true;

    const config = await loadConfig();
    for (const server of config?.servers ?? []) {
      statuses.set(server.name, { server, connected: false, toolCount: 0 });
    }
    if (!config || config.servers.length === 0) return;

    for (const server of config.servers) {
      if (closed) return;
      try {
        const connection = await connectServer(server);
        if (closed) {
          await connection.transport.close().catch(() => undefined);
          return;
        }
        connections.push(connection);
        statuses.set(server.name, { server, connected: true, toolCount: connection.tools.length });
        for (const tool of connection.tools) registerMcpTool(pi, connection, tool, usedToolNames);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statuses.set(server.name, { server, connected: false, toolCount: 0, lastError: message });
        console.warn(`mcp-bridge: failed to connect to ${server.name}:`, error);
      }
    }
  }

  pi.registerCommand("mcp-bridge-status", {
    description: "Show configured MCP bridge servers and tools",
    handler: async (_args, ctx) => {
      if (!started) await connectConfiguredServers();
      if (statuses.size === 0) {
        ctx.ui.notify("MCP bridge: no configured servers", "warning");
        return;
      }

      const summary = [...statuses.values()]
        .map((status) => {
          const auth = status.server.command ? "stdio" : status.server.auth === "oauth" ? "oauth" : status.server.headers ? "headers" : "none";
          const state = status.connected ? `connected, ${status.toolCount} tool(s)` : `not connected${status.lastError ? `: ${status.lastError}` : ""}`;
          return `${status.server.name} [${auth}]: ${state}`;
        })
        .join("\n");
      ctx.ui.notify(`MCP bridge:\n${summary}`, "info");
    },
  });

  pi.registerCommand("mcp-bridge-login", {
    description: "Log in to an OAuth MCP server, e.g. /mcp-bridge-login example-oauth",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /mcp-bridge-login <server-name>", "warning");
        return;
      }

      try {
        const server = findConfiguredServer(await loadConfig(), name);
        ctx.ui.setStatus("mcp-bridge", `logging in to ${name}...`);
        const connection = await loginServer(server, async (url) => {
          ctx.ui.notify(`Open this URL to authorize ${name}:\n${url}`, "info");
        });
        connections.push(connection);
        statuses.set(name, { server, connected: true, toolCount: connection.tools.length });
        for (const tool of connection.tools) registerMcpTool(pi, connection, tool, usedToolNames);
        ctx.ui.notify(`MCP bridge: logged in to ${name}; ${connection.tools.length} tool(s) available.`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statuses.set(name, { server: statuses.get(name)?.server ?? { name, url: "", auth: "oauth" }, connected: false, toolCount: 0, lastError: message });
        ctx.ui.notify(`MCP bridge login failed for ${name}: ${message}`, "error");
      } finally {
        ctx.ui.setStatus("mcp-bridge", undefined);
      }
    },
  });

  pi.registerCommand("mcp-bridge-logout", {
    description: "Remove saved OAuth tokens for an MCP server",
    handler: async (args, ctx) => {
      const name = args.trim();
      if (!name) {
        ctx.ui.notify("Usage: /mcp-bridge-logout <server-name>", "warning");
        return;
      }
      await rm(oauthStatePath(name), { force: true });
      ctx.ui.notify(`MCP bridge: removed saved OAuth state for ${name}. Reload Pi to disconnect existing tools.`, "info");
    },
  });

  pi.on("session_start", () => {
    // Keep reload/resume responsive. Tools register as each server connects.
    void connectConfiguredServers();
  });

  pi.on("session_shutdown", async () => {
    closed = true;
    await Promise.allSettled(connections.map((connection) => connection.transport.close()));
  });
}
