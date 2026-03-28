---
name: browser-testing
description: Use when launching and controlling browsers for testing, especially when needing non-headless mode for video playback, media verification, or GUI visibility
---

# Browser Testing

## Overview

Launch and control browsers for testing web applications. Covers both headless mode (fast, automated) and non-headless mode (required for video/media, visual debugging).

## When to Use

**Use Non-Headless When:**
- Testing video/audio playback (headless shows black box)
- Verifying interactive media players
- Debugging visual/layout issues
- Testing WebRTC, WebGL, hardware-accelerated content
- Need to see what the user actually sees

**Use Headless When:**
- Taking screenshots of static content
- Automated testing without media
- Faster execution needed
- CI/CD pipelines

## Quick Reference

| Mode | Command | Use Case |
|------|---------|----------|
| Non-headless | `chromium --window-size=1280,720 <url> &` | Video, media, visual testing |
| Headless | `chromium --headless --screenshot=out.png <url>` | Screenshots, automation |
| Check DISPLAY | `echo $DISPLAY` | Verify GUI environment |
| List displays | `ls -la /tmp/.X11-unix/` | Find available displays |

## Core Pattern: Non-Headless Browser

### Step 1: Set DISPLAY Environment

```bash
# Check current display
echo "DISPLAY=$DISPLAY"
# Should output something like: DISPLAY=:10

# If empty, set it to your GUI display
export DISPLAY=:10  # or :0, :1, etc.
```

**Finding Your Display:**
```bash
# List available X displays
ls -la /tmp/.X11-unix/
# Shows: X0, X10 (socket files)

# Try different displays
for disp in :0 :1 :10; do
    export DISPLAY=$disp
    xclock & 2>/dev/null && echo "Display $disp works" && break
done
```

### Step 2: Launch Browser

```bash
export DISPLAY=:10
chromium --window-size=1280,720 "http://localhost:8080" &
```

**Critical: Use `&` (background)**
- Browser blocks terminal until closed
- `&` lets you continue using the terminal
- Browser window still visible on remote desktop

### Step 3: Verify Launch

```bash
# Check process is running
ps aux | grep chromium | grep -v grep

# Count browser processes
pgrep chromium | wc -l
```

## Headless vs Non-Headless

### Headless Mode (Default for Automation)

```bash
# Screenshot only
chromium --headless --screenshot=output.png \
    --window-size=1280,720 \
    "http://localhost:8080"

# PDF generation
chromium --headless --print-to-pdf=output.pdf \
    --window-size=1280,720 \
    "http://localhost:8080"
```

**Limitations:**
- ❌ Video shows as black box
- ❌ WebRTC/ webcam doesn't work
- ❌ No GPU acceleration
- ❌ Audio playback issues

### Non-Headless Mode (GUI Required)

```bash
export DISPLAY=:10
chromium --window-size=1280,720 \
    --no-first-run \
    --no-default-browser-check \
    "http://localhost:8080" &
```

**When Required:**
- ✅ Video playback verification
- ✅ Media player controls testing
- ✅ Visual regression testing
- ✅ WebGL/WebRTC testing

## Common Patterns

### Pattern 1: Open and Wait

```bash
export DISPLAY=:10

# Open browser
chromium --window-size=1280,720 "http://localhost:8080" &
BROWSER_PID=$!

# Wait for page to load
sleep 5

# Do other work while browser runs...
# User can interact via remote desktop

# Later: kill browser
kill $BROWSER_PID
```

### Pattern 2: Screenshot After Interaction

```bash
export DISPLAY=:10

# 1. Open browser non-headless (let user/media load)
chromium --window-size=1280,720 "http://localhost:8080/player" &

# 2. Wait for content to be ready
sleep 30  # Adjust based on your app

# 3. Take screenshot with headless browser
chromium --headless --screenshot=/tmp/verify.png \
    --window-size=1280,720 \
    "http://localhost:8080/player"
```

**Why this works:**
- Non-headless loads video/media properly
- Headless screenshot captures the result
- Best of both worlds

### Pattern 3: Extract Video Frame

When you need to prove video is actually playing:

```bash
# Extract frame from video segment
ffmpeg -y -i /path/to/video.ts \
    -ss 00:00:05 \
    -vframes 1 \
    -q:v 2 \
    /tmp/video_frame.jpg

# Verify it's valid
file /tmp/video_frame.jpg
# Should show: JPEG image data, JFIF standard 1.01...
```

## Troubleshooting

### Browser Won't Start (No DISPLAY)

**Symptom:**
```
[ERROR:ozone_platform_x11.cc(244)] Missing X server or $DISPLAY
```

**Fix:**
```bash
# Find your display
ls /tmp/.X11-unix/

# Set and test
export DISPLAY=:10
xclock &  # Should show clock window
```

### Browser Blocks Terminal

**Symptom:** Terminal hangs after launching browser

**Fix:**
```bash
# ❌ Forgot the &
chromium http://localhost:8080
# ^ Blocks here

# ✅ Background the process
chromium http://localhost:8080 &
# ^ Returns immediately
```

### Video Shows Black Box

**In headless:** Expected behavior - video requires real browser

**In non-headless:** Check these:
1. **DISPLAY set?** `echo $DISPLAY`
2. **Right URL?** Verify with `curl`
3. **Video ready?** Check backend status
4. **Codec support?** H.264 required for most browsers

### Multiple Browser Instances

```bash
# List all chromium processes
pgrep -a chromium

# Kill all chromium
killall chromium

# Or kill specific PID
kill 12345
```

## Browser Flags Reference

| Flag | Purpose |
|------|---------|
| `--window-size=WxH` | Set window dimensions |
| `--headless` | Run without GUI |
| `--screenshot=file.png` | Capture screenshot (headless only) |
| `--no-first-run` | Skip first-run setup |
| `--no-default-browser-check` | Skip default browser prompt |
| `--disable-gpu` | Disable GPU acceleration |
| `--disable-dev-shm-usage` | Fix /dev/shm issues in containers |

## Real-World Example

Complete workflow for testing a video player:

```bash
#!/bin/bash
set -e

echo "Opening video player..."

# 1. Verify GUI environment
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:10
fi
echo "Using DISPLAY=$DISPLAY"

# 2. Verify backend is up
curl -s http://localhost:8080/healthz || {
    echo "Backend not responding"
    exit 1
}

# 3. Launch browser (non-headless for video)
chromium --window-size=1280,720 \
    --no-first-run \
    --no-default-browser-check \
    "http://localhost:8080/player" &

BROWSER_PID=$!
echo "Browser PID: $BROWSER_PID"

# 4. Wait for video to buffer/start
echo "Waiting for video to load..."
sleep 10

# 5. Verify browser still running
if ! kill -0 $BROWSER_PID 2>/dev/null; then
    echo "Browser crashed!"
    exit 1
fi

echo "Browser running - check remote desktop to see video"
echo "Press Enter to close browser"
read

# 6. Cleanup
kill $BROWSER_PID
```

## Key Principles

1. **Always set DISPLAY** for non-headless browser
2. **Use `&` to background** - don't block terminal
3. **Headless for screenshots** of static content
4. **Non-headless for video/media** - shows actual content
5. **Verify with `pgrep`** - ensure browser actually started

## See Also

- `writing-skills` - How to create skills like this one
- `skill-registry-workflow` - How to register and share skills