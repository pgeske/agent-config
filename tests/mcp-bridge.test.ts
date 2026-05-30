import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  FileOAuthClientProvider,
  McpToolError,
  buildToolName,
  buildUniqueToolName,
  expandEnv,
  loadConfigFromObject,
  mcpToolResultToPiToolResult,
  normalizeMcpContent,
  withTimeout,
} from "../extensions/mcp-bridge/index.ts";

describe("mcp-bridge", () => {
  it("expands environment variables in headers", () => {
    const expanded = expandEnv("Bearer ${EXCALIDRAW_API_KEY}", {
      EXCALIDRAW_API_KEY: "test-key",
    });

    assert.equal(expanded, "Bearer test-key");
  });

  it("throws when required environment variable is missing", () => {
    assert.throws(
      () => expandEnv("Bearer ${EXCALIDRAW_API_KEY}", {}),
      /Missing environment variable EXCALIDRAW_API_KEY/,
    );
  });

  it("loads mcpServers config", () => {
    const config = loadConfigFromObject(
      {
        mcpServers: {
          excalidraw: {
            url: "https://api.excalidraw.com/api/v1/mcp",
            headers: { Authorization: "Bearer ${EXCALIDRAW_API_KEY}" },
          },
        },
      },
      { EXCALIDRAW_API_KEY: "test-key" },
    );

    assert.deepEqual(config.servers, [
      {
        name: "excalidraw",
        url: "https://api.excalidraw.com/api/v1/mcp",
        auth: "none",
        headers: { Authorization: "Bearer test-key" },
      },
    ]);
  });

  it("loads stdio mcpServers config", () => {
    const config = loadConfigFromObject(
      {
        mcpServers: {
          chrome: {
            command: "npx",
            args: ["chrome-devtools-mcp@latest", "--autoConnect"],
            env: { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "${NO_STATS}" },
            cwd: "~/agent-config",
          },
        },
      },
      { NO_STATS: "true" },
    );

    assert.deepEqual(config.servers, [
      {
        name: "chrome",
        auth: "none",
        command: "npx",
        args: ["chrome-devtools-mcp@latest", "--autoConnect"],
        env: { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "true" },
        cwd: join(homedir(), "agent-config"),
      },
    ]);
  });

  it("rejects stdio mcpServers with HTTP-only fields", () => {
    assert.throws(
      () =>
        loadConfigFromObject({
          mcpServers: {
            bad: {
              command: "npx",
              auth: "oauth",
            },
          },
        }),
      /uses stdio and cannot use OAuth/,
    );
  });

  it("loads OAuth mcpServers config", () => {
    const config = loadConfigFromObject(
      {
        mcpServers: {
          oauth: {
            url: "https://example.test/mcp",
            auth: "oauth",
            oauth: {
              scopes: ["mcp"],
              tokenEndpointAuthMethod: "client_secret_post",
              clientId: "${OAUTH_CLIENT_ID}",
              redirectUrl: "http://localhost:3118/callback",
            },
          },
        },
      },
      { OAUTH_CLIENT_ID: "client" },
    );

    assert.deepEqual(config.servers, [
      {
        name: "oauth",
        url: "https://example.test/mcp",
        auth: "oauth",
        oauth: {
          scopes: ["mcp"],
          tokenEndpointAuthMethod: "client_secret_post",
          clientId: "client",
          redirectUrl: "http://localhost:3118/callback",
        },
      },
    ]);
  });

  it("rejects OAuth with a static Authorization header", () => {
    assert.throws(
      () =>
        loadConfigFromObject({
          mcpServers: {
            bad: {
              url: "https://example.test/mcp",
              auth: "oauth",
              headers: { Authorization: "Bearer static" },
            },
          },
        }),
      /cannot combine OAuth with a static Authorization header/,
    );
  });

  it("persists OAuth client state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mcp-bridge-oauth-"));
    try {
      const statePath = join(dir, "oauth.json");
      const provider = new FileOAuthClientProvider(
        { name: "oauth", url: "https://example.test/mcp", auth: "oauth" },
        "http://127.0.0.1:12345/callback",
        statePath,
      );

      await provider.saveClientInformation({ client_id: "client", client_secret: "secret" });
      await provider.saveTokens({ access_token: "access", token_type: "Bearer" });
      await provider.saveCodeVerifier("verifier");
      const csrfState = await provider.state();

      const provider2 = new FileOAuthClientProvider(
        { name: "oauth", url: "https://example.test/mcp", auth: "oauth" },
        "http://127.0.0.1:12345/callback",
        statePath,
      );
      assert.deepEqual(await provider2.clientInformation(), { client_id: "client", client_secret: "secret" });
      assert.deepEqual(await provider2.tokens(), { access_token: "access", token_type: "Bearer" });
      assert.equal(await provider2.codeVerifier(), "verifier");
      assert.equal(await provider2.expectedState(), csrfState);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses configured OAuth client information before dynamic registration state", async () => {
    const provider = new FileOAuthClientProvider(
      {
        name: "fixed-oauth",
        url: "https://example.test/mcp",
        auth: "oauth",
        oauth: { clientId: "configured-client" },
      },
      "http://127.0.0.1:12345/callback",
      join(tmpdir(), `mcp-bridge-unused-${Date.now()}.json`),
    );

    assert.deepEqual(await provider.clientInformation(), {
      client_id: "configured-client",
    });
  });

  it("creates stable pi-safe tool names", () => {
    assert.equal(buildToolName("excalidraw", "list_scenes"), "mcp_excalidraw_list_scenes");
    assert.equal(buildToolName("my-server", "tools/call"), "mcp_my_server_tools_call");
  });

  it("disambiguates colliding pi-safe tool names", () => {
    const usedNames = new Set<string>();
    const first = buildUniqueToolName("my-server", "tools/call", usedNames);
    const second = buildUniqueToolName("my_server", "tools-call", usedNames);

    assert.equal(first, "mcp_my_server_tools_call");
    assert.match(second, /^mcp_my_server_tools_call_[a-f0-9]{8}$/);
    assert.notEqual(first, second);
  });

  it("truncates large MCP text content", () => {
    const text = "x".repeat(60 * 1024);
    const [entry] = normalizeMcpContent({ content: [{ type: "text", text }] });

    assert.equal(entry?.text.includes("[MCP bridge output truncated:"), true);
  });

  it("normalizes MCP content for Pi", () => {
    assert.deepEqual(
      normalizeMcpContent({
        content: [
          { type: "text", text: "hello" },
          { type: "image", mimeType: "image/png", data: "abc" },
        ],
        structuredContent: { ok: true },
      }),
      [
        { type: "text", text: "hello" },
        {
          type: "text",
          text: '[image content: image/png]',
        },
        {
          type: "text",
          text: 'Structured content:\n{"ok":true}',
        },
      ],
    );
  });

  it("bounds slow MCP operations with a timeout", async () => {
    await assert.rejects(
      withTimeout(new Promise(() => undefined), "testing slow operation", 1),
      /Timed out after 1ms while testing slow operation/,
    );
  });

  it("throws Pi tool failures for MCP callTool isError responses with useful details", () => {
    assert.throws(
      () =>
        mcpToolResultToPiToolResult("draw", "create_scene", {
          isError: true,
          content: [{ type: "text", text: "Scene validation failed" }],
          structuredContent: { code: "invalid_scene", field: "elements" },
        }),
      (error) => {
        assert(error instanceof McpToolError);
        assert.equal(error.message.includes("Scene validation failed"), true);
        assert.equal(error.message.includes('"invalid_scene"'), true);
        assert.deepEqual(error.details, {
          server: "draw",
          tool: "create_scene",
          isError: true,
          contentTypes: ["text"],
          hasStructuredContent: true,
        });
        return true;
      },
    );
  });
});
