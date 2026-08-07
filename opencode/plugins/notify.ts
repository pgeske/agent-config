import type { Plugin } from "@opencode-ai/plugin"

// Soft macOS system sounds to choose from:
//   Purr, Submarine, Bottle, Blow, Pop, Tink
// Harsh ones to avoid: Glass, Funk, Sosumi, Basso, Frog, Hero, Ping, Morse
const SOUND = "Purr"
const SOUND_PATH = `/System/Library/Sounds/${SOUND}.aiff`

// Throttle duplicate notifications within this window (ms).
const DEDUP_WINDOW_MS = 1500

export const NotifyPlugin: Plugin = async ({ $, directory }) => {
  const projectName = directory.split("/").filter(Boolean).pop() ?? "opencode"
  let lastNotifyAt = 0
  let lastKey = ""

  const notify = async (title: string, message: string, key: string) => {
    const now = Date.now()
    if (key === lastKey && now - lastNotifyAt < DEDUP_WINDOW_MS) return
    lastKey = key
    lastNotifyAt = now

    // Play soft sound and show banner in parallel.
    const escapedTitle = title.replace(/"/g, '\\"')
    const escapedMessage = message.replace(/"/g, '\\"')
    await Promise.all([
      $`afplay ${SOUND_PATH}`.quiet().nothrow(),
      $`osascript -e ${`display notification "${escapedMessage}" with title "${escapedTitle}"`}`
        .quiet()
        .nothrow(),
    ])
  }

  return {
    event: async ({ event }) => {
      // Session finished its turn and is waiting for you.
      if (event.type === "session.idle") {
        await notify(
          `opencode · ${projectName}`,
          "Agent is idle and ready for input",
          `idle:${(event as any).properties?.sessionID ?? ""}`,
        )
        return
      }

      // Agent wants permission for something (blocked waiting on you).
      if (event.type === "permission.asked") {
        await notify(
          `opencode · ${projectName}`,
          "Waiting for permission",
          `perm:${(event as any).properties?.permissionID ?? ""}`,
        )
        return
      }

      // Session errored out.
      if (event.type === "session.error") {
        await notify(
          `opencode · ${projectName}`,
          "Session errored — needs attention",
          `err:${(event as any).properties?.sessionID ?? ""}`,
        )
        return
      }
    },
  }
}
