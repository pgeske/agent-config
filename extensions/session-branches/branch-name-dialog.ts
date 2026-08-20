import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER,
	decodeKittyPrintable,
	type Focusable,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";

function previousCharacterStart(value: string, cursor: number): number {
	const characters = Array.from(value.slice(0, cursor));
	return Math.max(0, cursor - (characters.at(-1)?.length ?? 0));
}

function nextCharacterEnd(value: string, cursor: number): number {
	return Math.min(value.length, cursor + (Array.from(value.slice(cursor))[0]?.length ?? 0));
}

export class BranchNameDialog implements Focusable {
	private value = "";
	private cursor = 0;
	private error: string | undefined;
	focused = false;

	constructor(
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly done: (name: string | undefined) => void,
	) {}

	handleInput(data: string): void {
		this.error = undefined;
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.done(undefined);
			return;
		}
		if (this.keybindings.matches(data, "tui.input.submit") || data === "\n") {
			const name = this.value.replace(/\s+/g, " ").trim();
			if (!name) {
				this.error = "Enter a branch name";
				return;
			}
			this.done(name);
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.deleteCharBackward")) {
			const start = previousCharacterStart(this.value, this.cursor);
			this.value = this.value.slice(0, start) + this.value.slice(this.cursor);
			this.cursor = start;
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.deleteCharForward")) {
			this.value = this.value.slice(0, this.cursor) + this.value.slice(nextCharacterEnd(this.value, this.cursor));
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorLeft")) {
			this.cursor = previousCharacterStart(this.value, this.cursor);
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorRight")) {
			this.cursor = nextCharacterEnd(this.value, this.cursor);
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorLineStart")) {
			this.cursor = 0;
			return;
		}
		if (this.keybindings.matches(data, "tui.editor.cursorLineEnd")) {
			this.cursor = this.value.length;
			return;
		}

		const printable = decodeKittyPrintable(data) ?? data;
		const pasted = printable.replaceAll("\x1b[200~", "").replaceAll("\x1b[201~", "").replace(/[\r\n]/g, " ");
		const hasControlCharacters = [...pasted].some((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
		});
		if (!pasted || hasControlCharacters) return;
		this.value = this.value.slice(0, this.cursor) + pasted + this.value.slice(this.cursor);
		this.cursor += pasted.length;
	}

	render(width: number): string[] {
		if (width < 4) return [truncateToWidth("Branch name", width, "")];

		const innerWidth = width - 2;
		const border = (text: string) => this.theme.fg("border", text);
		const row = (content: string): string => {
			const clipped = truncateToWidth(content, innerWidth, "");
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
			return `${border("│")}${clipped}${padding}${border("│")}`;
		};

		const title = " New branch ";
		const leftRule = "─";
		const rightRule = "─".repeat(Math.max(0, innerWidth - visibleWidth(title) - leftRule.length));
		const inputLine = this.renderInput(Math.max(1, innerWidth - 2));
		const hint = this.error
			? this.theme.fg("warning", this.error)
			: this.theme.fg("dim", "enter create  •  esc cancel");

		return [
			`${border(`╭${leftRule}`)}${this.theme.fg("accent", this.theme.bold(title))}${border(`${rightRule}╮`)}`,
			row(` ${this.theme.fg("muted", "Name your parallel session")}`),
			row(""),
			row(` ${inputLine}`),
			row(""),
			row(` ${hint}`),
			border(`╰${"─".repeat(innerWidth)}╯`),
		];
	}

	private renderInput(width: number): string {
		const prompt = "> ";
		const availableWidth = Math.max(1, width - visibleWidth(prompt));
		const beforeCursorCharacters = Array.from(this.value.slice(0, this.cursor));
		while (visibleWidth(beforeCursorCharacters.join("")) >= availableWidth && beforeCursorCharacters.length > 0) {
			beforeCursorCharacters.shift();
		}
		const beforeCursor = beforeCursorCharacters.join("");
		const remainingWidth = Math.max(1, availableWidth - visibleWidth(beforeCursor));
		const afterCursor = truncateToWidth(this.value.slice(this.cursor), remainingWidth, "");
		const cursorCharacter = Array.from(afterCursor)[0] ?? " ";
		const tail = afterCursor.slice(cursorCharacter.length);
		const marker = this.focused ? CURSOR_MARKER : "";
		const cursor = `\x1b[7m${cursorCharacter}\x1b[27m`;
		const content = `${prompt}${beforeCursor}${marker}${cursor}${tail}`;
		return content + " ".repeat(Math.max(0, width - visibleWidth(content)));
	}

	invalidate(): void {}
}
