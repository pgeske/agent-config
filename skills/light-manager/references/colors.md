# Color Reference

Common color names mapped to RGB values. Use these when translating natural language color requests into Home Assistant color values.

## Basic Colors

- **red**: (255, 0, 0)
- **green**: (0, 255, 0)
- **blue**: (0, 0, 255)
- **yellow**: (255, 255, 0)
- **cyan**: (0, 255, 255)
- **magenta**: (255, 0, 255)
- **white**: (255, 255, 255)
- **black**: (0, 0, 0)  # note: typically just turn off or minimum brightness
- **orange**: (255, 165, 0)
- **purple**: (128, 0, 128)
- **pink**: (255, 192, 203)
- **brown**: (165, 42, 42)
- **teal**: (0, 128, 128)
- **lime**: (0, 255, 0)  # same as green
- **navy**: (0, 0, 128)
- **maroon**: (128, 0, 0)
- **olive**: (128, 128, 0)
- **silver**: (192, 192, 192)
- **gray** / **grey**: (128, 128, 128)
- **gold**: (255, 215, 0)

## Descriptive Colors

- **warm white**: (255, 220, 180) - soft, yellowish white
- **cool white**: (200, 220, 255) - bluish white
- **daylight**: (255, 255, 200) - bright neutral
- **soft white**: (255, 240, 200)
- **sunset orange**: (255, 94, 77)
- **sunset pink**: (255, 154, 158)
- **sky blue**: (135, 206, 235)
- **forest green**: (34, 139, 34)
- **ocean blue**: (0, 119, 190)
- **lavender**: (230, 230, 250)
- **peach**: (255, 218, 185)
- **coral**: (255, 127, 80)
- **mint**: (152, 255, 152)
- **rose**: (255, 0, 127)
- **amber**: (255, 191, 0)

## Ambiguous Descriptors

These require context or defaults:
- **primary**: use home's primary accent color or ask user
- **accent**: same as primary
- **neutral**: gray or white - ask for clarification
- **pastel**: lighten the base color (increase brightness, reduce saturation)
- **neon**: highly saturated, bright version
- **muted**: desaturated, softer version
- **dark**: reduce brightness, keep hue
- **light**: increase brightness

When encountering ambiguous terms, default to asking the user for a specific color or use the theme system if a theme was requested.
