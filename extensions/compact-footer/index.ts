import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface CompactFooterValues {
	sessionName: string;
	contextPercent: number | null;
	contextWindow: number;
	model: string;
	thinkingLevel?: string;
}

export function formatFooterTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}k`;
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	if (tokens < 10_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	return `${Math.round(tokens / 1_000_000)}M`;
}

function truncate(text: string, width: number): string {
	if (text.length <= width) return text;
	if (width <= 0) return "";
	if (width === 1) return "…";
	return `${text.slice(0, width - 1)}…`;
}

export function buildCompactFooter(values: CompactFooterValues, width: number): string {
	const contextPercent = values.contextPercent === null ? "?" : values.contextPercent.toFixed(1);
	const context = `${contextPercent}%/${formatFooterTokens(values.contextWindow)}`;
	const model = values.thinkingLevel ? `${values.model} • ${values.thinkingLevel}` : values.model;
	const full = `${values.sessionName}  ${context}  ${model}`;
	if (full.length <= width) return full;

	const essentials = `${values.sessionName}  ${context}`;
	if (essentials.length <= width) return essentials;

	const nameWidth = width - context.length - 2;
	if (nameWidth > 0) return `${truncate(values.sessionName, nameWidth)}  ${context}`;
	return truncate(context, width);
}

export default function compactFooterExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setFooter((_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				const usage = ctx.getContextUsage();
				const model = ctx.model;
				const line = buildCompactFooter(
					{
						sessionName: pi.getSessionName() ?? "unnamed",
						contextPercent: usage?.percent ?? null,
						contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
						model: model?.id ?? "no-model",
						thinkingLevel: model?.reasoning ? ctx.thinkingLevel : undefined,
					},
					width,
				);
				return [theme.fg("dim", line)];
			},
		}));
	});
}
