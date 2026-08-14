import { compact, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FILE_HISTORY_BLOCK = /\n*<(?:read|modified)-files>[^]*?<\/(?:read|modified)-files>/g;

/** Remove Pi's cumulative path ledger from model-visible compaction text. */
export function stripCumulativeFileHistory(summary: string): string {
	return summary.replace(FILE_HISTORY_BLOCK, "").trim();
}

function stringHeaders(headers: Record<string, string | null> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.fromEntries(
		Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

export default function fastCompactionExtension(pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		const configuredProvider = process.env.PI_FAST_COMPACTION_PROVIDER?.trim();
		const configuredModel = process.env.PI_FAST_COMPACTION_MODEL?.trim();
		if (Boolean(configuredProvider) !== Boolean(configuredModel)) {
			ctx.ui.notify(
				"Set both PI_FAST_COMPACTION_PROVIDER and PI_FAST_COMPACTION_MODEL, or neither; using Pi's default compaction",
				"warning",
			);
			return;
		}

		const model = configuredProvider && configuredModel
			? ctx.modelRegistry.find(configuredProvider, configuredModel)
			: ctx.model;
		if (!model) {
			ctx.ui.notify("Fast compaction model is unavailable; using Pi's default compaction", "warning");
			return;
		}

		let auth;
		try {
			auth = await ctx.modelRegistry.getProviderAuth(model.provider);
		} catch (error) {
			ctx.ui.notify(
				`Could not authenticate fast compaction model; using Pi's default compaction: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
			return;
		}

		if (!auth) {
			ctx.ui.notify("Fast compaction model has no resolved authentication; using Pi's default compaction", "warning");
			return;
		}

		const requestModel = auth.auth.baseUrl ? { ...model, baseUrl: auth.auth.baseUrl } : model;
		const preparation = {
			...event.preparation,
			previousSummary: event.preparation.previousSummary
				? stripCumulativeFileHistory(event.preparation.previousSummary)
				: undefined,
		};

		ctx.ui.setStatus("fast-compaction", `compacting with ${model.id}/off`);
		try {
			const result = await compact(
				preparation,
				requestModel,
				auth.auth.apiKey,
				stringHeaders(auth.auth.headers),
				event.customInstructions,
				event.signal,
				"off",
				undefined,
				auth.env,
			);
			const summary = stripCumulativeFileHistory(result.summary);
			if (!summary) {
				ctx.ui.notify("Fast compaction returned an empty summary; using Pi's default compaction", "warning");
				return;
			}

			return {
				compaction: {
					...result,
					summary,
				},
			};
		} catch (error) {
			if (!event.signal.aborted) {
				ctx.ui.notify(
					`Fast compaction failed; using Pi's default compaction: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
			}
			return;
		} finally {
			ctx.ui.setStatus("fast-compaction", undefined);
		}
	});
}
