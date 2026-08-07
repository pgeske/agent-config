import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface GenerateParams {
	prompt: string;
	outputPath?: string;
	overwrite?: boolean;
	openPreview?: boolean;
	codexPath?: string;
	timeoutMs?: number;
}

interface ImageFile {
	path: string;
	mtimeMs: number;
}

function expandPath(path: string, cwd: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
	return resolve(cwd, path);
}

function codexHome(): string {
	return process.env.CODEX_HOME ? expandPath(process.env.CODEX_HOME, process.cwd()) : resolve(homedir(), ".codex");
}

async function walkPngs(root: string): Promise<ImageFile[]> {
	if (!existsSync(root)) return [];

	const results: ImageFile[] = [];
	async function walk(dir: string, depth: number): Promise<void> {
		if (depth < 0) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		await Promise.all(entries.map(async (entry) => {
			const path = resolve(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(path, depth - 1);
				return;
			}
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) return;
			const info = await stat(path);
			results.push({ path, mtimeMs: info.mtimeMs });
		}));
	}

	await walk(root, 4);
	return results;
}

function newestImage(images: ImageFile[]): ImageFile | undefined {
	return images.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path))[0];
}

function buildCodexPrompt(prompt: string): string {
	return `Use Codex's built-in imagegen skill and built-in image_gen tool to generate exactly one preview image for this request. Do not use the OpenAI Images API directly and do not require OPENAI_API_KEY. After generation, report the saved PNG path only.\n\nImage request:\n${prompt}`;
}

function extractImagePaths(output: string): string[] {
	const paths = new Set<string>();
	const regex = /(?:^|[\s`'"])((?:~|\/)[^\s`'"]*\.png)(?=$|[\s`'"])/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(output)) !== null) {
		paths.add(match[1].startsWith("~/") ? resolve(homedir(), match[1].slice(2)) : match[1]);
	}
	return [...paths];
}

async function runCodex(codexPath: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
	return new Promise((resolvePromise) => {
		const child = spawn(codexPath, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs);

		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", (error) => {
			clearTimeout(timer);
			resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}\n${error.message}`.trim(), exitCode: null, timedOut });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolvePromise({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode: code, timedOut });
		});
	});
}

async function openInPreview(path: string): Promise<string | undefined> {
	if (platform() !== "darwin") return "Preview auto-open skipped: not running on macOS.";
	try {
		await execFileAsync("open", ["-a", "Preview", path], { timeout: 10_000, maxBuffer: 1024 * 1024 });
		return undefined;
	} catch (error) {
		return `Preview auto-open failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

const generateImageWithCodexTool = defineTool({
	name: "generate_image_with_codex",
	label: "Generate Image with Codex",
	description: "Generate a raster image by shelling out to Codex's built-in image_gen tool, then optionally open it in Preview.",
	promptSnippet: "Generate raster images through Codex's built-in image generation bridge and open them in Preview by default.",
	promptGuidelines: [
		"Use generate_image_with_codex when the user asks Pi to generate a bitmap/raster image, illustration, photo, mockup, sprite, or visual concept.",
		"This tool delegates to Codex's built-in image_gen capability; it does not call the public OpenAI Images API and does not require OPENAI_API_KEY.",
		"By default, generated images are saved under ~/.codex/generated_images and opened in Preview on macOS.",
		"If the user wants the image in a specific project or notes location, pass outputPath so the generated PNG is copied there.",
	],
	parameters: Type.Object({
		prompt: Type.String({ description: "Image generation prompt to pass to Codex" }),
		outputPath: Type.Optional(Type.String({ description: "Optional path to copy the selected generated PNG to." })),
		overwrite: Type.Optional(Type.Boolean({ description: "Allow replacing outputPath if it already exists. Defaults to false." })),
		openPreview: Type.Optional(Type.Boolean({ description: "Open the generated image in macOS Preview after generation. Defaults to true." })),
		codexPath: Type.Optional(Type.String({ description: "Codex executable to run. Defaults to 'codex'." })),
		timeoutMs: Type.Optional(Type.Number({ description: "Maximum time to wait for Codex, in milliseconds. Defaults to 300000." })),
	}),
	async execute(_toolCallId, params: GenerateParams, _signal, _onUpdate, ctx) {
		const generatedDir = resolve(codexHome(), "generated_images");
		const before = new Set((await walkPngs(generatedDir)).map((image) => image.path));
		const startedAt = Date.now();
		const codexPath = params.codexPath ?? "codex";
		const timeoutMs = params.timeoutMs ?? 300_000;

		const result = await runCodex(codexPath, [
			"exec",
			"--skip-git-repo-check",
			"--sandbox",
			"workspace-write",
			"--json",
			"--cd",
			ctx.cwd,
			buildCodexPrompt(params.prompt),
		], ctx.cwd, timeoutMs);
		const { stdout, stderr } = result;

		if (result.timedOut || result.exitCode !== 0) {
			const reason = result.timedOut ? `timed out after ${timeoutMs}ms` : `exited with code ${result.exitCode}`;
			return {
				content: [{ type: "text", text: `Codex image generation failed (${reason}).\n${stderr}`.trim() }],
				details: { success: false, stdout, stderr, exitCode: result.exitCode, timedOut: result.timedOut },
			};
		}

		const after = await walkPngs(generatedDir);
		const outputPaths = extractImagePaths(`${stdout}\n${stderr}`).filter((path) => existsSync(path));
		const newImages = after.filter((image) => !before.has(image.path) || image.mtimeMs >= startedAt - 1000);
		const selected = outputPaths[0] ?? newestImage(newImages)?.path;

		if (!selected) {
			return {
				content: [{ type: "text", text: "Codex completed, but no generated PNG was found under ~/.codex/generated_images." }],
				details: { success: false, stdout, stderr, generatedDir },
			};
		}

		let finalPath = selected;
		if (params.outputPath) {
			finalPath = expandPath(params.outputPath, ctx.cwd);
			if (existsSync(finalPath) && !params.overwrite) {
				return {
					content: [{ type: "text", text: `Generated image at ${selected}, but outputPath already exists: ${finalPath}. Set overwrite=true to replace it.` }],
					details: { success: true, path: selected, originalPath: selected, copied: false, error: "exists" },
				};
			}
			await mkdir(dirname(finalPath), { recursive: true });
			await copyFile(selected, finalPath);
		}

		const previewMessage = params.openPreview === false ? undefined : await openInPreview(finalPath);
		const text = [
			`Generated image: ${finalPath}`,
			params.outputPath ? `Original Codex image: ${selected}` : undefined,
			previewMessage,
		].filter(Boolean).join("\n");

		return {
			content: [{ type: "text", text }],
			details: {
				success: true,
				path: finalPath,
				originalPath: selected,
				openedPreview: params.openPreview !== false && !previewMessage,
				generatedDir,
			},
		};
	},
});

export default function codexImageGenExtension(pi: ExtensionAPI) {
	pi.registerTool(generateImageWithCodexTool);
}
