import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { homedir } from "node:os";

const palette = {
	blue: "#a5d8ff",
	green: "#b2f2bb",
	orange: "#ffd8a8",
	purple: "#d0bfff",
	red: "#ffc9c9",
	yellow: "#fff3bf",
	teal: "#c3fae8",
	pink: "#eebefa",
	white: "#ffffff",
} as const;

const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

type PaletteName = keyof typeof palette;
type ShapeType = "rectangle" | "ellipse" | "diamond";
type OutputFormat = "obsidian" | "raw";

interface DiagramNode {
	id: string;
	label: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	shape?: ShapeType;
	color?: PaletteName | string;
	strokeColor?: string;
}

interface DiagramEdge {
	from: string;
	to: string;
	label?: string;
	color?: string;
}

interface CreateParams {
	title: string;
	path?: string;
	overwrite?: boolean;
	format?: OutputFormat;
	nodes?: DiagramNode[];
	edges?: DiagramEdge[];
	rawElements?: Array<Record<string, unknown>>;
	backgroundColor?: string;
}

const nodeSchema = Type.Object({
	id: Type.String({ description: "Stable node id, e.g. frontend or api" }),
	label: Type.String({ description: "Text shown inside the node" }),
	x: Type.Number({ description: "Left x coordinate" }),
	y: Type.Number({ description: "Top y coordinate" }),
	width: Type.Optional(Type.Number({ description: "Node width; defaults to 180" })),
	height: Type.Optional(Type.Number({ description: "Node height; defaults to 80" })),
	shape: Type.Optional(Type.Union([Type.Literal("rectangle"), Type.Literal("ellipse"), Type.Literal("diamond")], { description: "Node shape" })),
	color: Type.Optional(Type.String({ description: "Palette name or hex background color" })),
	strokeColor: Type.Optional(Type.String({ description: "Optional hex stroke color" })),
});

const edgeSchema = Type.Object({
	from: Type.String({ description: "Source node id" }),
	to: Type.String({ description: "Target node id" }),
	label: Type.Optional(Type.String({ description: "Optional arrow label" })),
	color: Type.Optional(Type.String({ description: "Optional arrow color" })),
});

function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80) || "diagram";
}

function expandPath(path: string, cwd: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
	return resolve(cwd, path);
}

function defaultPath(title: string, format: OutputFormat): string {
	const slug = slugify(title);
	return format === "raw" ? `~/notes/assets/excalidraw/${slug}.excalidraw` : `~/notes/Excalidraw/${slug}.excalidraw.md`;
}

function inferFormat(params: CreateParams): OutputFormat {
	if (params.format) return params.format;
	if (params.path && extname(params.path) === ".excalidraw") return "raw";
	return "obsidian";
}

function randomInt(): number {
	return Math.floor(Math.random() * 2147483647);
}

function colorFor(input: string | undefined, fallback: PaletteName): string {
	if (!input) return palette[fallback];
	return (palette as Record<string, string>)[input] ?? input;
}

function commonElement(id: string) {
	return {
		id,
		angle: 0,
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [] as string[],
		frameId: null,
		seed: randomInt(),
		version: 1,
		versionNonce: randomInt(),
		isDeleted: false,
		boundElements: [] as Array<Record<string, string>>,
		updated: Date.now(),
		link: null,
		locked: false,
	};
}

function estimateTextWidth(text: string, fontSize: number): number {
	return Math.max(24, text.length * fontSize * 0.52);
}

function makeText(id: string, text: string, x: number, y: number, fontSize = 20) {
	const width = estimateTextWidth(text, fontSize);
	const height = fontSize * 1.35;
	return {
		...commonElement(id),
		type: "text",
		x,
		y,
		width,
		height,
		text,
		fontSize,
		fontFamily: 1,
		textAlign: "left",
		verticalAlign: "top",
		containerId: null,
		originalText: text,
		rawText: text,
		lineHeight: 1.25,
		baseline: Math.round(fontSize * 0.95),
	};
}

function makeNode(node: DiagramNode) {
	const width = Math.max(120, node.width ?? 180);
	const height = Math.max(60, node.height ?? 80);
	const shape = node.shape ?? "rectangle";
	const shapeElement = {
		...commonElement(node.id),
		type: shape,
		x: node.x,
		y: node.y,
		width,
		height,
		backgroundColor: colorFor(node.color, "blue"),
		strokeColor: node.strokeColor ?? "#1e1e1e",
		...(shape === "rectangle" ? { roundness: { type: 3 } } : { roundness: null }),
	};
	const fontSize = node.label.length > 24 ? 16 : 20;
	const textWidth = estimateTextWidth(node.label, fontSize);
	const text = makeText(`${node.id}_label`, node.label, node.x + width / 2 - textWidth / 2, node.y + height / 2 - fontSize * 0.7, fontSize);
	return [shapeElement, text];
}

function nodeBounds(node: DiagramNode) {
	const width = Math.max(120, node.width ?? 180);
	const height = Math.max(60, node.height ?? 80);
	return {
		x: node.x,
		y: node.y,
		width,
		height,
		cx: node.x + width / 2,
		cy: node.y + height / 2,
		shape: node.shape ?? "rectangle",
	};
}

function edgeEndpoint(from: DiagramNode, to: DiagramNode) {
	const source = nodeBounds(from);
	const target = nodeBounds(to);
	const vx = target.cx - source.cx;
	const vy = target.cy - source.cy;
	if (vx === 0 && vy === 0) return { x: source.cx, y: source.cy };

	const halfWidth = source.width / 2;
	const halfHeight = source.height / 2;

	if (source.shape === "ellipse") {
		const scale = 1 / Math.sqrt((vx * vx) / (halfWidth * halfWidth) + (vy * vy) / (halfHeight * halfHeight));
		return { x: source.cx + vx * scale, y: source.cy + vy * scale };
	}

	if (source.shape === "diamond") {
		const scale = 1 / (Math.abs(vx) / halfWidth + Math.abs(vy) / halfHeight);
		return { x: source.cx + vx * scale, y: source.cy + vy * scale };
	}

	const scale = Math.min(
		vx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(vx),
		vy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(vy),
	);
	return { x: source.cx + vx * scale, y: source.cy + vy * scale };
}

function makeEdge(edge: DiagramEdge, nodesById: Map<string, DiagramNode>, index: number) {
	const from = nodesById.get(edge.from);
	const to = nodesById.get(edge.to);
	if (!from || !to) throw new Error(`edge ${index} references missing node: ${edge.from} -> ${edge.to}`);
	const start = edgeEndpoint(from, to);
	const end = edgeEndpoint(to, from);
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const id = `edge_${edge.from}_${edge.to}_${index}`;
	const arrow = {
		...commonElement(id),
		type: "arrow",
		x: start.x,
		y: start.y,
		width: dx,
		height: dy,
		points: [[0, 0], [dx, dy]],
		strokeColor: edge.color ?? "#1e1e1e",
		backgroundColor: "transparent",
		startArrowhead: null,
		endArrowhead: "arrow",
	};
	if (!edge.label) return [arrow];
	const fontSize = 16;
	const textWidth = estimateTextWidth(edge.label, fontSize);
	const label = makeText(`${id}_label`, edge.label, start.x + dx / 2 - textWidth / 2, start.y + dy / 2 - 24, fontSize);
	label.strokeColor = edge.color ?? "#757575";
	return [arrow, label];
}

function normalizeRawElement(element: Record<string, unknown>, index: number) {
	const id = typeof element.id === "string" ? element.id : `raw_${index}`;
	return {
		...commonElement(id),
		...element,
		id,
	};
}

export function buildExcalidrawScene(params: CreateParams) {
	const elements: Array<Record<string, unknown>> = [];
	const title = params.title.trim();
	if (!title) throw new Error("title is required");

	elements.push(makeText("title", title, 40, 24, 28));

	if (params.rawElements?.length) {
		elements.push(...params.rawElements.map(normalizeRawElement));
	} else {
		const nodes = params.nodes ?? [];
		if (nodes.length === 0) throw new Error("provide either nodes or rawElements");
		const nodesById = new Map<string, DiagramNode>();
		for (const node of nodes) {
			if (nodesById.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
			nodesById.set(node.id, node);
			elements.push(...makeNode(node));
		}
		for (const [index, edge] of (params.edges ?? []).entries()) {
			elements.push(...makeEdge(edge, nodesById, index));
		}
	}

	return {
		type: "excalidraw",
		version: 2,
		source: "https://excalidraw.com",
		elements,
		appState: {
			gridSize: null,
			viewBackgroundColor: params.backgroundColor ?? "#ffffff",
		},
		files: {},
	};
}

// Minimal LZ-String-compatible Base64 compressor.
// Adapted from lz-string 1.4.5 (Pieroxy, WTFPL) so the Obsidian Excalidraw
// plugin can read `compressed-json` drawing blocks without a runtime dependency.
function compressToBase64(input: string): string {
	if (input == null) return "";
	const res = compress(input, 6, (a) => keyStrBase64.charAt(a));
	switch (res.length % 4) {
		default:
		case 0:
			return res;
		case 1:
			return `${res}===`;
		case 2:
			return `${res}==`;
		case 3:
			return `${res}=`;
	}
}

function compress(uncompressed: string, bitsPerChar: number, getCharFromInt: (value: number) => string) {
	if (uncompressed == null) return "";
	let i: number;
	let value: number;
	const contextDictionary: Record<string, number> = {};
	const contextDictionaryToCreate: Record<string, boolean> = {};
	let contextC = "";
	let contextWc = "";
	let contextW = "";
	let contextEnlargeIn = 2;
	let contextDictSize = 3;
	let contextNumBits = 2;
	const contextData: string[] = [];
	let contextDataVal = 0;
	let contextDataPosition = 0;

	const pushBit = (bit: number) => {
		contextDataVal = (contextDataVal << 1) | bit;
		if (contextDataPosition === bitsPerChar - 1) {
			contextDataPosition = 0;
			contextData.push(getCharFromInt(contextDataVal));
			contextDataVal = 0;
		} else {
			contextDataPosition++;
		}
	};

	for (let ii = 0; ii < uncompressed.length; ii += 1) {
		contextC = uncompressed.charAt(ii);
		if (!Object.prototype.hasOwnProperty.call(contextDictionary, contextC)) {
			contextDictionary[contextC] = contextDictSize++;
			contextDictionaryToCreate[contextC] = true;
		}

		contextWc = contextW + contextC;
		if (Object.prototype.hasOwnProperty.call(contextDictionary, contextWc)) {
			contextW = contextWc;
		} else {
			if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
				if (contextW.charCodeAt(0) < 256) {
					for (i = 0; i < contextNumBits; i++) pushBit(0);
					value = contextW.charCodeAt(0);
					for (i = 0; i < 8; i++) {
						pushBit(value & 1);
						value >>= 1;
					}
				} else {
					value = 1;
					for (i = 0; i < contextNumBits; i++) {
						pushBit(value);
						value = 0;
					}
					value = contextW.charCodeAt(0);
					for (i = 0; i < 16; i++) {
						pushBit(value & 1);
						value >>= 1;
					}
				}
				contextEnlargeIn--;
				if (contextEnlargeIn === 0) {
					contextEnlargeIn = Math.pow(2, contextNumBits);
					contextNumBits++;
				}
				delete contextDictionaryToCreate[contextW];
			} else {
				value = contextDictionary[contextW];
				for (i = 0; i < contextNumBits; i++) {
					pushBit(value & 1);
					value >>= 1;
				}
			}
			contextEnlargeIn--;
			if (contextEnlargeIn === 0) {
				contextEnlargeIn = Math.pow(2, contextNumBits);
				contextNumBits++;
			}
			contextDictionary[contextWc] = contextDictSize++;
			contextW = String(contextC);
		}
	}

	if (contextW !== "") {
		if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
			if (contextW.charCodeAt(0) < 256) {
				for (i = 0; i < contextNumBits; i++) pushBit(0);
				value = contextW.charCodeAt(0);
				for (i = 0; i < 8; i++) {
					pushBit(value & 1);
					value >>= 1;
				}
			} else {
				value = 1;
				for (i = 0; i < contextNumBits; i++) {
					pushBit(value);
					value = 0;
				}
				value = contextW.charCodeAt(0);
				for (i = 0; i < 16; i++) {
					pushBit(value & 1);
					value >>= 1;
				}
			}
			contextEnlargeIn--;
			if (contextEnlargeIn === 0) {
				contextEnlargeIn = Math.pow(2, contextNumBits);
				contextNumBits++;
			}
			delete contextDictionaryToCreate[contextW];
		} else {
			value = contextDictionary[contextW];
			for (i = 0; i < contextNumBits; i++) {
				pushBit(value & 1);
				value >>= 1;
			}
		}
		contextEnlargeIn--;
		if (contextEnlargeIn === 0) {
			contextEnlargeIn = Math.pow(2, contextNumBits);
			contextNumBits++;
		}
	}

	value = 2;
	for (i = 0; i < contextNumBits; i++) {
		pushBit(value & 1);
		value >>= 1;
	}

	while (true) {
		contextDataVal <<= 1;
		if (contextDataPosition === bitsPerChar - 1) {
			contextData.push(getCharFromInt(contextDataVal));
			break;
		}
		contextDataPosition++;
	}
	return contextData.join("");
}

function chunkCompressed(compressed: string): string {
	return compressed.match(/.{1,256}/g)?.join("\n\n") ?? "";
}

function serializeRawScene(scene: ReturnType<typeof buildExcalidrawScene>): string {
	return `${JSON.stringify(scene, null, 2)}\n`;
}

export function serializeObsidianExcalidraw(scene: ReturnType<typeof buildExcalidrawScene>): string {
	const json = JSON.stringify(scene, null, "\t");
	const compressed = chunkCompressed(compressToBase64(json));
	return `---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'\n\n\n# Excalidraw Data\n\n## Text Elements\n%%\n## Drawing\n\`\`\`compressed-json\n${compressed}\n\`\`\`\n%%\n`;
}

const createExcalidrawFileTool = defineTool({
	name: "create_excalidraw_file",
	label: "Create Excalidraw File",
	description: "Create a valid Excalidraw diagram file. Defaults to Obsidian Excalidraw .excalidraw.md format.",
	promptSnippet: "Create Obsidian-compatible .excalidraw.md diagram files or raw .excalidraw exports",
	promptGuidelines: [
		"Use create_excalidraw_file when the user asks to create, save, sketch, or diagram something for Excalidraw.",
		"Prefer create_excalidraw_file nodes and edges over rawElements unless the diagram needs advanced custom geometry.",
		"create_excalidraw_file defaults to Obsidian compressed .excalidraw.md output; use format='raw' only for excalidraw.com/self-hosted portability.",
	],
	parameters: Type.Object({
		title: Type.String({ description: "Human-readable diagram title" }),
		path: Type.Optional(Type.String({ description: "Output path; defaults to ~/notes/Excalidraw/<title>.excalidraw.md" })),
		overwrite: Type.Optional(Type.Boolean({ description: "Allow replacing an existing file; defaults to false" })),
		format: Type.Optional(Type.Union([Type.Literal("obsidian"), Type.Literal("raw")], { description: "Output format; defaults to obsidian unless path ends in .excalidraw" })),
		nodes: Type.Optional(Type.Array(nodeSchema, { description: "Diagram nodes to render as labeled shapes" })),
		edges: Type.Optional(Type.Array(edgeSchema, { description: "Arrows connecting node ids" })),
		rawElements: Type.Optional(Type.Array(Type.Any(), { description: "Advanced raw Excalidraw elements; use sparingly" })),
		backgroundColor: Type.Optional(Type.String({ description: "Canvas background color; defaults to #ffffff" })),
	}),
	async execute(_toolCallId, params: CreateParams, _signal, _onUpdate, ctx) {
		const format = inferFormat(params);
		const requestedPath = params.path ?? defaultPath(params.title, format);
		const outputPath = expandPath(requestedPath, ctx.cwd);
		const scene = buildExcalidrawScene(params);
		const fileContent = format === "raw" ? serializeRawScene(scene) : serializeObsidianExcalidraw(scene);

		return withFileMutationQueue(outputPath, async () => {
			if (existsSync(outputPath) && !params.overwrite) {
				return {
					content: [{ type: "text", text: `File already exists: ${outputPath}. Set overwrite=true to replace it.` }],
					details: { path: outputPath, format, written: false, error: "exists" },
				};
			}
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, fileContent, "utf8");
			return {
				content: [{ type: "text", text: `Created ${format === "raw" ? "raw" : "Obsidian"} Excalidraw file: ${outputPath}` }],
				details: {
					path: outputPath,
					format,
					written: true,
					elementCount: scene.elements.length,
					openWith: format === "raw" ? "http://draw.home.alyoshukai.com" : "Obsidian Excalidraw plugin",
				},
			};
		});
	},
});

export default function excalidrawExtension(pi: ExtensionAPI) {
	pi.registerTool(createExcalidrawFileTool);
}
