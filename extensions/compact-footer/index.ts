import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const THINKING_COLORS = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
} satisfies Record<ThinkingLevel, ThemeColor>;

export interface CompactFooterState {
	model: string;
	thinking: ThinkingLevel;
	session: string;
	contextPercent: number | null;
}

export interface CompactFooterTheme {
	fg(color: ThemeColor, text: string): string;
	bold(text: string): string;
}

function cleanLabel(value: string, fallback: string): string {
	return (
		value
			.replace(/[\u0000-\u001f\u007f]/g, " ")
			.replace(/\s+/g, " ")
			.trim() || fallback
	);
}

function shortModelName(modelId: string | undefined): string {
	if (!modelId) return "no model";
	const parts = cleanLabel(modelId, "no model").split("/").filter(Boolean);
	return parts.at(-1) ?? "no model";
}

/** Renders the four high-signal session values as one padded, width-safe line. */
export function renderCompactFooterLine(
	width: number,
	state: CompactFooterState,
	theme: CompactFooterTheme,
): string {
	if (width <= 0) return "";

	const horizontalPadding = width >= 8 ? 2 : width >= 3 ? 1 : 0;
	const contentWidth = Math.max(0, width - horizontalPadding * 2);
	const outerPadding = " ".repeat(horizontalPadding);
	const separator = theme.fg("dim", "  ·  ");

	const model = theme.fg("accent", theme.bold(cleanLabel(state.model, "no model")));
	const thinking =
		theme.fg("dim", "thinking ") +
		theme.fg(THINKING_COLORS[state.thinking], theme.bold(state.thinking));
	const session =
		theme.fg("dim", "session ") + theme.fg("text", cleanLabel(state.session, "untitled"));
	const left = model + separator + thinking + separator + session;

	const contextValue = state.contextPercent === null ? "—" : `${state.contextPercent.toFixed(1)}%`;
	const contextColor: ThemeColor =
		state.contextPercent === null
			? "muted"
			: state.contextPercent > 90
				? "error"
				: state.contextPercent > 70
					? "warning"
					: "success";
	const right =
		theme.fg("dim", "context ") + theme.fg(contextColor, theme.bold(contextValue));
	const fittedRight = truncateToWidth(right, contentWidth, "");
	const rightWidth = visibleWidth(fittedRight);

	const minimumGap = 4;
	const leftWidth = Math.max(0, contentWidth - rightWidth - minimumGap);
	const fittedLeft = truncateToWidth(left, leftWidth, theme.fg("dim", "…"));
	const gap = " ".repeat(Math.max(0, contentWidth - visibleWidth(fittedLeft) - rightWidth));
	const line = outerPadding + fittedLeft + gap + fittedRight + outerPadding;

	return truncateToWidth(line, width, "") + " ".repeat(Math.max(0, width - visibleWidth(line)));
}

export default function compactFooter(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				return [
					renderCompactFooterLine(
						width,
						{
							model: shortModelName(ctx.model?.id),
							thinking: ctx.thinkingLevel ?? "off",
							session: pi.getSessionName() ?? "untitled",
							contextPercent: ctx.getContextUsage()?.percent ?? null,
						},
						theme,
					),
				];
			},
		}));
	});
}
