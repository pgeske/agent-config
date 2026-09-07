import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("desktop MCP uses our pinned release with session approval and no permanent app trust", async () => {
  const config = JSON.parse(await readFile(new URL("dotfiles/mcp/mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const server = config.mcpServers["mac-computer-use"];
  assert.equal(server.command, "node");
  assert.equal(server.cwd, "${HOME}/agent-config");
  assert.deepEqual(server.args, [
    "node_modules/@pgeske/mac-computer-use-mcp/dist/cli.js",
  ]);
  assert.equal(server.lifecycle, "lazy");
  assert.equal(config.mcpServers.peekaboo.disabled, true);
  assert.equal(manifest.dependencies["@pgeske/mac-computer-use-mcp"], "https://github.com/pgeske/mac-computer-use-mcp/releases/download/v0.2.0/pgeske-mac-computer-use-mcp-0.2.0.tgz");
});
