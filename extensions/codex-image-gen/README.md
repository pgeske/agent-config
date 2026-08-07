# Codex Image Generation Pi Extension

Adds a `generate_image_with_codex` Pi tool that shells out to `codex exec` and asks Codex to use its built-in `image_gen` capability.

Behavior:

- Saves preview images in Codex's default `~/.codex/generated_images/...` location.
- Optionally copies the selected PNG to `outputPath`.
- Opens the final image in macOS Preview by default.
- Does not call the public OpenAI Images API and does not require `OPENAI_API_KEY`.

The tool assumes the `codex` CLI is installed and authenticated with image generation available.
