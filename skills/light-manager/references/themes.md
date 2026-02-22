# Themes Reference

Predefined lighting themes that combine colors, brightness, and effects for specific moods or events. Each theme specifies:

- **colors**: List of RGB tuples or single color to apply
- **brightness**: Optional brightness level (1-100)
- **transition**: Optional transition time in seconds
- **effect**: Optional effect name if supported (e.g., "rainbow", "strobe")

## Harry Potter Themes

Hogwarts house colors and magical ambiance:

- **gryffindor**: red and gold
  - colors: [(255, 0, 0), (255, 215, 0)]
  - brightness: 80
  - effect: "static" (alternating or blend)

- **slytherin**: green and silver
  - colors: [(0, 128, 0), (192, 192, 192)]
  - brightness: 70
  - effect: "static"

- **ravenclaw**: blue and bronze
  - colors: [(0, 0, 255), (205, 127, 50)]
  - brightness: 75

- **hufflepuff**: yellow and black
  - colors: [(255, 255, 0), (0, 0, 0)]
  - brightness: 80

- **hogwarts-castle**: deep blues and purples with warm candle accents
  - colors: [(0, 0, 139), (75, 0, 130), (255, 200, 100)]
  - brightness: 60
  - effect: "slow breathe"

- **lumos**: warm, soft white glow
  - colors: [(255, 240, 200)]
  - brightness: 90
  - effect: "soft"

- **nox**: very dim blue-tinted light
  - colors: [(30, 30, 100)]
  - brightness: 15

## Seasonal Themes

- **christmas**: red, green, and warm white
  - colors: [(255, 0, 0), (0, 128, 0), (255, 220, 180)]
  - brightness: 85
  - effect: "twinkle" if available

- **halloween**: orange, purple, eerie green
  - colors: [(255, 165, 0), (128, 0, 128), (0, 255, 100)]
  - brightness: 70
  - effect: "flicker"

- **easter**: pastel pinks, blues, yellows, greens
  - colors: [(255, 192, 203), (173, 216, 230), (255, 255, 150), (152, 255, 152)]
  - brightness: 80

- **thanksgiving**: warm oranges, golds, browns
  - colors: [(255, 165, 0), (255, 215, 0), (165, 42, 42)]
  - brightness: 75

- **valentines**: pink and red
  - colors: [(255, 0, 127), (255, 0, 0)]
  - brightness: 85

- **st-patrick**: various greens
  - colors: [(0, 255, 0), (0, 200, 0), (0, 150, 0)]
  - brightness: 80

## Time-of-Day Themes

- **sunrise**: warm oranges and yellows gradually increasing
  - colors: [(255, 94, 77), (255, 200, 100), (255, 255, 200)]
  - brightness: 40 → 90 (if ramp supported)

- **sunset**: deep oranges, pinks, purples
  - colors: [(255, 69, 0), (255, 105, 180), (75, 0, 130)]
  - brightness: 70

- **daylight**: bright cool white
  - colors: [(200, 220, 255)]
  - brightness: 100

- **twilight**: soft blue and warm white
  - colors: [(50, 50, 150), (255, 220, 180)]
  - brightness: 50

- **night**: very dim warm or blue
  - colors: [(255, 200, 150)] or [(20, 20, 60)]
  - brightness: 10-20

## Ambiance Themes

- **focus**: bright cool white or blue-tinted
  - colors: [(200, 220, 255)]
  - brightness: 90-100

- **relax**: warm dim light
  - colors: [(255, 220, 180)]
  - brightness: 40-60

- **romantic**: warm pink or red, dimmed
  - colors: [(255, 0, 127)] or [(255, 0, 0)]
  - brightness: 30-50

- **party**: vibrant colors, potentially cycling
  - colors: all colors or rainbow
  - brightness: 90-100
  - effect: "color_loop" or "party"

- **movie**: dim warm, avoid blue to preserve picture
  - colors: [(255, 220, 180)]
  - brightness: 20-30

- **reading**: bright warm white focused on reading areas
  - colors: [(255, 240, 200)]
  - brightness: 70-80

- **sleep**: very dim blue or red (nightlight mode)
  - colors: [(30, 30, 100)] or [(100, 0, 0)]
  - brightness: 10

## Nature Themes

- **ocean**: blues and aqua
  - colors: [(0, 119, 190), (0, 255, 255)]
  - brightness: 70-80

- **forest**: greens
  - colors: [(34, 139, 34), (0, 100, 0), (50, 205, 50)]
  - brightness: 60-70

- **sunset-nature**: warm oranges and pinks
  - colors: [(255, 94, 77), (255, 154, 158)]
  - brightness: 75

- **aurora**: greens and purples
  - colors: [(0, 255, 127), (138, 43, 226)]
  - brightness: 70

## Implementation Notes

- Not all Home Assistant lights support color or effects. The skill must check capabilities and gracefully fall back to what's supported (e.g., apply only brightness or white temperature).
- When multiple colors are specified, Home Assistant may support:
  - Single color (set to first)
  - Multi-zone lights (apply each to different zones)
  - Color cycling/transition (if supported)
- Brightness is optional; if omitted in a theme, use the light's current brightness or a reasonable default (80).
- If the theme includes unsupported effects, ignore them and apply color/brightness only.
- If the user references a theme not listed, use natural language inference to approximate (e.g., "underwater" → ocean/blue theme).
