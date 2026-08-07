import { randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROTOCOL_VERSION = 1;
const MAX_BUFFER_BYTES = 1024 * 1024;
const RECONNECT_DELAY_MS = 2_000;
const socketPath = process.env.PI_VOICE_SOCKET ?? join(homedir(), ".pi", "voice", "control.sock");

type DeliveryMode = "auto" | "steer" | "followUp";
type SessionStatus = "idle" | "working" | "unknown";

interface SessionIdentity {
  instanceId: string;
  processId: number;
  startedAt: string;
  cwd: string;
  piSessionId?: string;
  piSessionFile?: string;
  piSessionName?: string;
  tmuxSessionId?: string;
  tmuxSessionName?: string;
  tmuxWindowId?: string;
  tmuxWindowIndex?: number;
  tmuxWindowName?: string;
  tmuxPaneId?: string;
  capabilities?: string[];
}

interface SessionState {
  status: SessionStatus;
  hasPendingMessages: boolean;
  updatedAt: string;
  currentTool?: string;
  lastAssistantText?: string;
  lastError?: string;
}

interface BrokerRequest {
  type: "request";
  requestId: string;
  action: "get_state" | "send" | "abort" | "read_context";
  payload?: {
    message?: string;
    delivery?: DeliveryMode;
    cursor?: string;
    maxCharacters?: number;
  };
}

function assistantText(message: unknown): string | undefined {
  if (!message || typeof message !== "object" || !("role" in message) || message.role !== "assistant") {
    return undefined;
  }
  if (!("content" in message) || !Array.isArray(message.content)) return undefined;

  const text = message.content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(
          part &&
            typeof part === "object" &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string",
        ),
    )
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text ? text.slice(-6_000) : undefined;
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/(Authorization\s*:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*)[^\s,}\]]+/gi,
      "$1[REDACTED]",
    );
}

function formatContent(content: unknown): string {
  if (typeof content === "string") return redactSensitiveText(content);
  if (!Array.isArray(content)) return "";

  const lines: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object" || !("type" in part)) continue;
    if (part.type === "text" && "text" in part && typeof part.text === "string") {
      lines.push(redactSensitiveText(part.text));
    } else if (part.type === "image") {
      const mediaType = "mimeType" in part ? String(part.mimeType) : "image";
      lines.push(`[${mediaType} omitted]`);
    } else if (part.type === "thinking") {
      lines.push("[thinking omitted]");
    } else if (part.type === "toolCall") {
      const name = "name" in part ? String(part.name) : "unknown";
      const args = "arguments" in part ? JSON.stringify(part.arguments) : "{}";
      lines.push(`tool call ${name}: ${redactSensitiveText(args)}`);
    }
  }
  return lines.join("\n");
}

function formatSessionEntry(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object" || !("type" in entry)) return undefined;
  const record = entry as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "unknown";
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : "unknown";

  if (record.type === "message" && record.message && typeof record.message === "object") {
    const message = record.message as Record<string, unknown>;
    const role = typeof message.role === "string" ? message.role : "message";
    let body = formatContent(message.content);
    if (role === "bashExecution") {
      const command = typeof message.command === "string" ? message.command : "";
      const output = typeof message.output === "string" ? message.output : "";
      body = `command: ${redactSensitiveText(command)}\n${redactSensitiveText(output)}`;
    } else if (role === "toolResult") {
      const toolName = typeof message.toolName === "string" ? message.toolName : "unknown";
      body = `tool: ${toolName} error=${String(message.isError === true)}\n${body}`;
    } else if (role === "custom") {
      const customType = typeof message.customType === "string" ? message.customType : "custom";
      body = `type: ${customType}\n${body}`;
    }
    return `[${id} ${timestamp}] ${role}\n${body}`.trim();
  }

  if (record.type === "compaction" || record.type === "branch_summary") {
    const summary = typeof record.summary === "string" ? record.summary : "";
    return `[${id} ${timestamp}] ${String(record.type)}\n${redactSensitiveText(summary)}`.trim();
  }
  if (record.type === "model_change") {
    return `[${id} ${timestamp}] model_change ${String(record.provider)}/${String(record.modelId)}`;
  }
  if (record.type === "thinking_level_change") {
    return `[${id} ${timestamp}] thinking_level_change ${String(record.thinkingLevel)}`;
  }
  return undefined;
}

interface ContextCursor {
  sessionId: string;
  leafId: string | null;
  end: number;
}

function encodeContextCursor(cursor: ContextCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeContextCursor(value: string): ContextCursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ContextCursor;
  if (
    !parsed ||
    typeof parsed.sessionId !== "string" ||
    !(typeof parsed.leafId === "string" || parsed.leafId === null) ||
    !Number.isInteger(parsed.end) ||
    parsed.end < 0
  ) {
    throw new Error("Invalid session context cursor");
  }
  return parsed;
}

function readContextPage(
  ctx: ExtensionContext,
  cursorValue?: string,
  requestedMaxCharacters?: number,
): {
  source: "session";
  text: string;
  nextCursor?: string;
  hasMore: boolean;
  totalCharacters: number;
  entryCount: number;
  redacted: true;
} {
  const entries = ctx.sessionManager.getBranch();
  const transcript = entries
    .map(formatSessionEntry)
    .filter((entry): entry is string => Boolean(entry))
    .join("\n\n");
  const sessionId = ctx.sessionManager.getSessionId();
  const leafId = ctx.sessionManager.getLeafId();
  const maxCharacters = Math.max(
    1_000,
    Math.min(requestedMaxCharacters ?? 12_000, 20_000),
  );

  let end = transcript.length;
  if (cursorValue) {
    const cursor = decodeContextCursor(cursorValue);
    if (cursor.sessionId !== sessionId || cursor.leafId !== leafId) {
      throw new Error("Pi session context changed; restart from the latest page");
    }
    end = Math.min(cursor.end, transcript.length);
  }
  const start = Math.max(0, end - maxCharacters);
  return {
    source: "session",
    text: transcript.slice(start, end),
    nextCursor:
      start > 0 ? encodeContextCursor({ sessionId, leafId, end: start }) : undefined,
    hasMore: start > 0,
    totalCharacters: transcript.length,
    entryCount: entries.length,
    redacted: true,
  };
}

export default function piVoiceBridge(pi: ExtensionAPI) {
  const instanceId = `${hostname()}:${process.pid}:${randomUUID()}`;
  const startedAt = new Date().toISOString();
  let active = false;
  let context: ExtensionContext | undefined;
  let identity: SessionIdentity | undefined;
  let socket: Socket | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let buffer = "";
  let currentTool: string | undefined;
  let lastAssistantText: string | undefined;
  let lastError: string | undefined;
  let status: SessionStatus = "unknown";
  let runGeneration = 0;
  let lastNotifiedGeneration = 0;
  let runFailure: string | undefined;
  let runAborted = false;
  let settleTimer: NodeJS.Timeout | undefined;
  const unresolvedToolErrors = new Map<string, string>();

  const currentState = (): SessionState => ({
    status,
    hasPendingMessages: context?.hasPendingMessages() ?? false,
    updatedAt: new Date().toISOString(),
    currentTool,
    lastAssistantText,
    lastError,
  });

  const send = (message: object): void => {
    if (!socket || socket.destroyed || !socket.writable) return;
    socket.write(`${JSON.stringify(message)}\n`);
  };

  const sendRegistration = (): void => {
    if (!identity || !context) return;
    identity = {
      ...identity,
      cwd: context.cwd,
      piSessionId: context.sessionManager.getSessionId(),
      piSessionFile: context.sessionManager.getSessionFile(),
      piSessionName: context.sessionManager.getSessionName(),
    };
    send({
      type: "register",
      protocolVersion: PROTOCOL_VERSION,
      identity,
      state: currentState(),
    });
  };

  const sendState = (): void => {
    send({ type: "state", instanceId, state: currentState() });
  };

  const sendActivity = (activity: object): void => {
    send({
      type: "activity",
      instanceId,
      activity: { timestamp: new Date().toISOString(), ...activity },
    });
  };

  const scheduleSettlement = (ctx: ExtensionContext, generation: number): void => {
    if (settleTimer) clearTimeout(settleTimer);
    const check = (): void => {
      if (!active || !context || generation !== runGeneration) return;
      if (!ctx.isIdle()) {
        settleTimer = setTimeout(check, 200);
        settleTimer.unref();
        return;
      }
      settleTimer = undefined;
      if (generation <= lastNotifiedGeneration) return;

      const toolError = [...unresolvedToolErrors.values()].at(-1);
      const outcome = runAborted
        ? "aborted"
        : runFailure
          ? "failed"
          : toolError
            ? "completed_with_errors"
            : "completed";
      lastError = runFailure ?? toolError;
      status = "idle";
      currentTool = undefined;
      lastNotifiedGeneration = generation;
      sendState();
      sendActivity({
        kind: "agent_finished",
        outcome,
        ...(lastError ? { text: lastError } : {}),
      });
    };
    settleTimer = setTimeout(check, 0);
    settleTimer.unref();
  };

  const scheduleReconnect = (): void => {
    if (!active || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, RECONNECT_DELAY_MS);
    reconnectTimer.unref();
  };

  const handleRequest = (request: BrokerRequest): void => {
    const respond = (ok: boolean, data?: unknown, error?: string): void => {
      send({ type: "response", requestId: request.requestId, ok, data, error });
    };

    try {
      if (!context) throw new Error("Pi session is not ready");

      if (request.action === "get_state") {
        sendRegistration();
        respond(true, currentState());
        return;
      }

      if (request.action === "read_context") {
        respond(
          true,
          readContextPage(
            context,
            request.payload?.cursor,
            request.payload?.maxCharacters,
          ),
        );
        return;
      }

      if (request.action === "abort") {
        context.abort();
        respond(true, { aborted: true });
        return;
      }

      const message = request.payload?.message?.trim();
      const delivery = request.payload?.delivery ?? "auto";
      if (!message) throw new Error("Instruction cannot be empty");

      const wasIdle = context.isIdle();
      if (wasIdle) {
        pi.sendUserMessage(message);
      } else if (delivery === "steer") {
        pi.sendUserMessage(message, { deliverAs: "steer" });
      } else {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
      }
      respond(true, { accepted: true, delivery: wasIdle ? "immediate" : delivery });
    } catch (error) {
      respond(false, undefined, error instanceof Error ? error.message : String(error));
    }
  };

  const handleData = (chunk: string): void => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_BUFFER_BYTES) {
      socket?.destroy(new Error("Pi voice broker message exceeded size limit"));
      return;
    }

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line) continue;

      try {
        const message = JSON.parse(line) as BrokerRequest;
        if (message.type === "request") handleRequest(message);
      } catch {
        socket?.destroy(new Error("Pi voice broker sent invalid JSON"));
        return;
      }
    }
  };

  function connect(): void {
    if (!active || socket) return;

    const nextSocket = createConnection(socketPath);
    socket = nextSocket;
    nextSocket.setEncoding("utf8");
    nextSocket.once("connect", sendRegistration);
    nextSocket.on("data", handleData);
    nextSocket.on("error", () => undefined);
    nextSocket.once("close", () => {
      if (socket === nextSocket) socket = undefined;
      buffer = "";
      scheduleReconnect();
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    active = true;
    context = ctx;
    status = ctx.isIdle() ? "idle" : "working";

    const paneId = process.env.TMUX_PANE;
    let tmuxFields: string[] = [];
    if (paneId && /^%\d+$/.test(paneId)) {
      const result = await pi.exec(
        "tmux",
        [
          "display-message",
          "-p",
          "-t",
          paneId,
          "#{session_id}\t#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}",
        ],
        { timeout: 2_000 },
      );
      if (result.code === 0) tmuxFields = result.stdout.trim().split("\t");
    }

    identity = {
      instanceId,
      processId: process.pid,
      startedAt,
      cwd: ctx.cwd,
      piSessionId: ctx.sessionManager.getSessionId(),
      piSessionFile: ctx.sessionManager.getSessionFile(),
      piSessionName: ctx.sessionManager.getSessionName(),
      tmuxSessionId: tmuxFields[0],
      tmuxSessionName: tmuxFields[1],
      tmuxWindowId: tmuxFields[2],
      tmuxWindowIndex: tmuxFields[3] ? Number(tmuxFields[3]) : undefined,
      tmuxWindowName: tmuxFields[4],
      tmuxPaneId: tmuxFields[5] ?? paneId,
      capabilities: ["read_context_v1", "final_outcome_v1"],
    };

    connect();
  });

  pi.on("agent_start", () => {
    if (status !== "working") {
      runGeneration += 1;
      runFailure = undefined;
      runAborted = false;
      lastError = undefined;
      unresolvedToolErrors.clear();
    }
    status = "working";
    currentTool = undefined;
    sendState();
    sendActivity({ kind: "agent_started" });
  });

  pi.on("agent_end", (_event, ctx) => {
    scheduleSettlement(ctx, runGeneration);
  });

  pi.on("message_end", (event) => {
    const message = event.message as unknown as Record<string, unknown>;
    if (message.role === "assistant") {
      const stopReason = typeof message.stopReason === "string" ? message.stopReason : undefined;
      const errorMessage =
        typeof message.errorMessage === "string"
          ? redactSensitiveText(message.errorMessage).slice(-500)
          : undefined;
      if (stopReason === "error") {
        runFailure = errorMessage ?? "Pi model response failed";
        runAborted = false;
      } else if (stopReason === "aborted") {
        runAborted = true;
        runFailure = undefined;
      } else if (stopReason === "length") {
        runFailure = "Pi response reached its output limit";
        runAborted = false;
      } else if (stopReason === "stop" || stopReason === "toolUse") {
        runFailure = undefined;
        runAborted = false;
      }
    }

    const text = assistantText(event.message);
    if (!text) return;
    lastAssistantText = text;
    sendState();
    sendActivity({ kind: "assistant_message", text });
  });

  pi.on("tool_execution_start", (event) => {
    currentTool = event.toolName;
    sendState();
    sendActivity({ kind: "tool_started", toolName: event.toolName });
  });

  pi.on("tool_execution_end", (event) => {
    if (currentTool === event.toolName) currentTool = undefined;
    if (event.isError) {
      const result = event.result as Record<string, unknown>;
      const detail = formatContent(result.content).trim().slice(-500);
      unresolvedToolErrors.set(
        event.toolName,
        detail || `${event.toolName} failed`,
      );
    } else {
      unresolvedToolErrors.delete(event.toolName);
    }
    lastError = [...unresolvedToolErrors.values()].at(-1);
    sendState();
    sendActivity({
      kind: "tool_finished",
      toolName: event.toolName,
      isError: event.isError,
    });
  });

  pi.on("session_shutdown", () => {
    active = false;
    context = undefined;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = undefined;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    socket?.destroy();
    socket = undefined;
  });
}
