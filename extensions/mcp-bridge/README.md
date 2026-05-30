# mcp-bridge

Generic MCP-to-Pi tool bridge for Streamable HTTP and stdio MCP servers.

On Pi startup, this extension:

1. reads MCP server config,
2. connects to each configured MCP server,
3. lists available MCP tools,
4. registers each MCP tool as a Pi tool named `mcp_<server>_<tool>`, and
5. forwards Pi tool calls to the matching MCP `callTool` request.

## Configuration

Create `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "excalidraw": {
      "url": "https://api.excalidraw.com/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${EXCALIDRAW_API_KEY}"
      }
    },
    "example-oauth": {
      "url": "https://example.com/mcp",
      "auth": "oauth"
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect"],
      "env": {
        "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS": "true"
      }
    }
  }
}
```

Set secrets in your shell environment, not in git:

```bash
export EXCALIDRAW_API_KEY="..."
```

You can override the config path:

```bash
export PI_MCP_CONFIG=/path/to/mcp.json
```

## Excalidraw+

Excalidraw+ MCP is currently public beta.

- Endpoint: `https://api.excalidraw.com/api/v1/mcp`
- Transport: Streamable HTTP
- Auth: `Authorization: Bearer <API_KEY>`

Tool visibility depends on the permissions assigned to your Excalidraw+ API key.

## Stdio MCP servers

For local stdio servers, configure `command` and optional `args`, `env`, and `cwd` instead of `url`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect"],
      "env": {
        "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS": "true"
      }
    }
  }
}
```

Stdio servers cannot use OAuth or HTTP headers in this bridge. For Chrome DevTools MCP auto-connect, enable Chrome's remote debugging server from `chrome://inspect/#remote-debugging`, then reload Pi.

## OAuth login

For OAuth MCP servers that support dynamic client registration, set `"auth": "oauth"`, reload Pi, then run:

```text
/mcp-bridge-login example-oauth
```

Pi opens the authorization URL, listens on a temporary localhost callback, stores OAuth client/token state under `~/.pi/agent/mcp-auth/<server>.json`, then reconnects and registers the discovered tools.

Some MCP servers do not support dynamic client registration. For those servers, add `oauth.clientId` and a fixed localhost `oauth.redirectUrl` to the server config. If another OAuth provider issues a secret, `oauth.clientSecret` is also supported.

To remove saved OAuth state:

```text
/mcp-bridge-logout example-oauth
```

## Status command

Inside Pi, run:

```text
/mcp-bridge-status
```

This reports configured MCP servers, auth modes, connection state, discovered tool counts, and the last connection error when unavailable.

## Limitations

- Supports Streamable HTTP and stdio MCP servers.
- Registers tools at startup and after `/mcp-bridge-login`; reconnect/reload with `/reload` after changing MCP config or API key permissions.
- OAuth and static `Authorization` headers are mutually exclusive for one server.
- Non-text MCP content is summarized for Pi instead of rendered natively.
