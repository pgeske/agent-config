---
name: teastream-apple-tv
description: Deploy and troubleshoot TeaStream on a physical Apple TV. Use for Filmstream tvOS pairing, Xcode signing, devicectl installation and launch, Tailscale backend connectivity, or physical-device playback validation.
---

# TeaStream Apple TV Deployment

Use the repository workflow for normal deployments and reserve manual Xcode/CoreDevice work for initial pairing or recovery. Never store pairing PINs, Apple credentials, development-team IDs, provisioning profiles, device UDIDs, or tailnet addresses in this skill.

## Protect current work

1. Locate the Filmstream repository, normally under `~/repositories/filmstream`.
2. Inspect its branch and working tree before changing anything.
3. Preserve unrelated work. Use a separate worktree and a `pgeske/` branch for repository changes.
4. Before installing, confirm the Apple TV is not in the middle of playback if a relaunch would interrupt the user.

## Normal deployment

Read `clients/apple/README.md`, then run from the repository root:

```bash
make tvos-install
```

The command regenerates the Xcode project, discovers one paired physical Apple TV, detects one Apple Development team, builds with automatic provisioning, verifies the signature, installs the app, and relaunches it. It does not persist machine-specific identifiers.

When discovery or signing is ambiguous, pass values for that invocation only:

```bash
make tvos-install \
  TVOS_DEVICE_ID=<apple-tv-udid> \
  TVOS_DEVELOPMENT_TEAM=<team-id>
```

Do not add those values to the repository. Personal Team apps and profiles expire periodically; rerun the command to re-sign and reinstall.

## Verify pairing and availability

Use command-line state before opening Xcode:

```bash
xcrun devicectl list devices --columns '*'
xcodebuild \
  -project clients/apple/FilmstreamApple.xcodeproj \
  -scheme FilmstreamTV \
  -showdestinations
```

A usable device should be physical tvOS hardware with a paired state and should appear as a scheme destination.

For initial pairing:

1. Keep the Mac and Apple TV on the same LAN and nearby for Bluetooth discovery.
2. On Apple TV, open **Settings > Remotes and Devices > Remote App and Devices**.
3. In Xcode, open **Window > Devices and Simulators** and choose **Pair**.
4. Hand the verification-code entry to the user. Never ask them to paste the code into chat.
5. If pairing succeeds but only the manual-pairing Bonjour service remains, restart the Apple TV once and check `devicectl` again.

Do not direct the user to an iOS-style Developer Mode switch; current tvOS does not expose that workflow. Do not change firewall, AirPlay access, VPN settings, or privacy permissions without first inspecting current state and obtaining approval for consequential changes.

## Repair signing

If automatic signing fails:

1. Check `security find-identity -v -p codesigning`.
2. Open **Xcode > Settings > Apple Accounts** when no account or certificate is available.
3. Let the user enter credentials and two-factor codes directly in Xcode.
4. Retry `make tvos-install`, passing `TVOS_DEVELOPMENT_TEAM` only when automatic detection is unavailable or ambiguous.

`xcodebuild -allowProvisioningUpdates -allowProvisioningDeviceRegistration` can create or refresh the development certificate, app ID, device registration, and provisioning profile after Xcode has an authenticated account.

## Diagnose backend hostname failures

If TeaStream says that the specified hostname cannot be found, verify tailnet authorization before changing the app endpoint or ingress:

1. Read `FilmstreamServerURL` from `clients/apple/FilmstreamTV/Info.plist`.
2. Resolve and health-check that URL from an authenticated tailnet client.
3. From another tailnet node, inspect `tailscale status --json` for the Apple TV and ping its tailnet IP.
4. Treat `peer's node key has expired` or an offline device as an authentication failure even if tvOS still shows the VPN configuration enabled.
5. Have the user open Tailscale on Apple TV and reauthenticate with its QR flow. Do not handle or store authentication material.
6. Recheck tailnet status before relaunching TeaStream.

Only investigate DNS records, MagicDNS alternatives, or Traefik host rules after the Apple TV is confirmed online in the correct tailnet. Revert temporary diagnostic routing or app builds once the root cause is known.

## Verify the result

After installation, confirm both app registration and the running process:

```bash
xcrun devicectl device info apps --device <apple-tv-udid>
xcrun devicectl device info processes --device <apple-tv-udid>
```

Then ask the user to validate the physical screen: home catalog and artwork, search, HLS startup, audio/video synchronization, subtitles, progress, and resume. Keep raw MPV streaming and backend behavior unchanged while testing the tvOS client.
