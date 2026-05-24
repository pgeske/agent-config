---
name: excalidraw-diagram
description: Create Excalidraw diagrams as durable Obsidian Excalidraw files for the user's notes vault, with optional raw .excalidraw exports for the self-hosted Excalidraw app. Use when the user asks to draw, sketch, diagram, make an architecture/flowchart/sequence/system diagram, or save a diagram for Excalidraw.
---

# Excalidraw Diagram Workflow

## Goal

Create valid Excalidraw diagrams that work in the user's Obsidian Excalidraw plugin and can optionally be exported to the self-hosted Excalidraw app at `http://draw.home.alyoshukai.com`.

The default durable artifact is an Obsidian-compatible compressed `.excalidraw.md` file.

## Storage

Default save directory for Obsidian drawings:

```text
~/notes/Excalidraw/
```

Default filename format:

```text
<title>.excalidraw.md
```

Use lowercase kebab-case titles unless the user asks for a specific filename.

Use raw `.excalidraw` only when the user explicitly wants a portable file for excalidraw.com or the self-hosted web app.

## Preferred Tool

When available, use the `create_excalidraw_file` tool instead of hand-writing JSON.

Use the tool with:

- `title`: human-readable title
- `nodes`: boxes, ellipses, diamonds, or notes with labels and positions
- `edges`: arrows connecting node ids
- `path`: optional output path when the target location matters
- `format`: default `obsidian`; use `raw` only for raw `.excalidraw` export

Important: the Obsidian plugin has proven to render the compressed `.excalidraw.md` format reliably on the user's devices. Do not default to raw JSON code blocks inside Markdown.

## Layout Rules

- Start simple: fewer, larger elements are better than dense diagrams.
- Use 120×60 as the minimum labeled node size.
- Leave at least 30px between shapes.
- Use left-to-right for flows and top-to-bottom for lifecycle or sequence diagrams.
- Put a title at the top unless the file is a tiny one-off sketch.
- Use color intentionally: blue=input/frontend, purple=agent/logic, green=output/success, orange=external/warning, teal=data/storage, red=error.

## Color Palette

Use these friendly Excalidraw colors:

```text
blue: #a5d8ff
green: #b2f2bb
orange: #ffd8a8
purple: #d0bfff
red: #ffc9c9
yellow: #fff3bf
teal: #c3fae8
pink: #eebefa
```

## Verification

After creating a diagram, report:

- file path
- whether it is Obsidian `.excalidraw.md` or raw `.excalidraw`
- what it contains in one line
- how to open it: open the `.excalidraw.md` file in Obsidian and switch to Excalidraw view

Do not inline the full JSON unless the user explicitly asks.
