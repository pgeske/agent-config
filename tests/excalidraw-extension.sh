#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
PI_NODE_MODULES="$HOME/.local/share/pi-node/node-v22.22.3-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent/node_modules"
PI_PACKAGE="$HOME/.local/share/pi-node/node-v22.22.3-linux-x64/lib/node_modules/@earendil-works/pi-coding-agent"
LZ_STRING_DIR="$HOME/projects/knitting-coach/node_modules/lz-string"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/node_modules/@earendil-works"
ln -s "$PI_PACKAGE" "$TMP_DIR/node_modules/@earendil-works/pi-coding-agent"
ln -s "$PI_NODE_MODULES/@earendil-works/pi-ai" "$TMP_DIR/node_modules/@earendil-works/pi-ai"
ln -s "$PI_NODE_MODULES/typebox" "$TMP_DIR/node_modules/typebox"
ln -s "$LZ_STRING_DIR" "$TMP_DIR/node_modules/lz-string"
cp "$ROOT_DIR/extensions/excalidraw.ts" "$TMP_DIR/excalidraw.ts"

cd "$TMP_DIR"
bun -e '
import LZString from "lz-string";
import { buildExcalidrawScene, serializeObsidianExcalidraw } from "./excalidraw.ts";
const scene = buildExcalidrawScene({
  title: "Agent Flow",
  nodes: [
    { id: "agent", label: "Agent", x: 40, y: 120, color: "purple" },
    { id: "tool", label: "Tool", x: 320, y: 120, color: "green" }
  ],
  edges: [{ from: "agent", to: "tool", label: "calls" }]
});
if (scene.type !== "excalidraw") throw new Error("wrong scene type");
if (scene.version !== 2) throw new Error("wrong scene version");
if (scene.elements.length !== 7) throw new Error(`unexpected element count ${scene.elements.length}`);
if (scene.elements[0].text !== "Agent Flow") throw new Error("missing title text");
const obsidian = serializeObsidianExcalidraw(scene);
if (!obsidian.includes("```compressed-json")) throw new Error("missing compressed-json block");
if (!obsidian.includes("excalidraw-plugin: parsed")) throw new Error("missing plugin frontmatter");
const compressed = obsidian.match(/```compressed-json\n([\s\S]*?)```/)?.[1].replace(/\s+/g, "");
const decompressed = LZString.decompressFromBase64(compressed);
if (!decompressed) throw new Error("failed to decompress output");
const parsed = JSON.parse(decompressed);
if (parsed.elements.length !== scene.elements.length) throw new Error("decompressed scene element mismatch");
console.log("excalidraw extension smoke test passed");
'
