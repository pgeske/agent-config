import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface AutocompleteInternals {
	autocompleteState: unknown | null;
	autocompleteList?: { render(width: number): string[] };
	paddingX: number;
}

/** Keeps the input box anchored by rendering native autocomplete rows above it. */
class AutocompleteAboveEditor extends CustomEditor {
	private readonly fullscreen: boolean;

	constructor(...args: ConstructorParameters<typeof CustomEditor>) {
		super(...args);
		this.fullscreen = args[0].mode === "fullscreen";
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (!this.fullscreen) return lines;

		const internals = this as unknown as AutocompleteInternals;
		if (!internals.autocompleteState || !internals.autocompleteList) return lines;

		// Pi currently appends autocomplete rows to the editor. Move those rows to
		// the front so fullscreen layout growth consumes transcript space instead
		// of pushing the input box upward.
		const maxPadding = Math.max(0, Math.floor((width - 1) / 2));
		const paddingX = Math.min(internals.paddingX, maxPadding);
		const contentWidth = Math.max(1, width - paddingX * 2);
		const autocompleteHeight = internals.autocompleteList.render(contentWidth).length;
		if (autocompleteHeight <= 0 || autocompleteHeight >= lines.length) return lines;

		return [...lines.slice(-autocompleteHeight), ...lines.slice(0, -autocompleteHeight)];
	}
}

export default function autocompleteAboveEditor(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) => new AutocompleteAboveEditor(tui, theme, keybindings),
		);
	});
}
