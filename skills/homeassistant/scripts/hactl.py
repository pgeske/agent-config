#!/usr/bin/env python3
"""
Home Assistant Control (hactl)
Natural language → Home Assistant API
"""

import os
import sys
import json
import argparse
import requests
from typing import Dict, List, Optional, Tuple

# Color presets
COLOR_PRESETS = {
    "warm": {"color_temp_kelvin": 2700, "brightness": 255},
    "relax": {"color_temp_kelvin": 2200, "brightness": 255},  # 2200K is more orange/relaxed
    "orange": {"color_temp_kelvin": 2200, "brightness": 255},
    "red": {"rgb_color": [255, 0, 0], "brightness": 255},
    "blue": {"rgb_color": [0, 0, 255], "brightness": 255},
    "green": {"rgb_color": [0, 255, 0], "brightness": 255},
    "white": {"rgb_color": [255, 255, 255], "brightness": 255},
    "cool": {"color_temp_kelvin": 4000, "brightness": 255},  # cool white
    "daylight": {"color_temp_kelvin": 5000, "brightness": 255},  # daylight
    "tokyo": {"scene": "tokyo"},
    "suzuka": {"scene": "suzuka"},
}

BASE_URL = os.getenv("HOME_ASSISTANT_URL") or os.getenv("HA_URL") or "http://localhost:8123"
TOKEN = os.getenv("HOME_ASSISTANT_TOKEN") or os.getenv("HA_TOKEN")
SESSION = requests.Session()


def auth_headers() -> Dict[str, str]:
    if not TOKEN:
        raise RuntimeError("HOME_ASSISTANT_TOKEN not set")
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def try_conversation(command: str) -> Optional[str]:
    """Try HA's conversation API. Returns a result message if successful."""
    endpoints = ["/api/conversation/process", "/api/conversation/respond"]
    for ep in endpoints:
        try:
            resp = SESSION.post(
                BASE_URL + ep,
                headers=auth_headers(),
                json={"text": command},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                # Different HA versions may return differently.
                response = data.get("response") or data
                speech = response.get("speech", {}).get("plain", {}).get("speech")
                if speech:
                    return speech
                # Some return: {"response": "..."}
                if isinstance(response, str):
                    return response
                # If there's a 'result' containing 'speech'
                result = response.get("result", {})
                if result:
                    return str(result)
            elif resp.status_code == 404:
                continue  # try next endpoint
            else:
                # Other error; break and fallback
                break
        except Exception:
            continue
    return None


def fetch_states() -> List[Dict]:
    resp = SESSION.get(BASE_URL + "/api/states", headers=auth_headers(), timeout=10)
    resp.raise_for_status()
    return resp.json()


def fetch_services() -> Dict:
    resp = SESSION.get(BASE_URL + "/api/services", headers=auth_headers(), timeout=10)
    resp.raise_for_status()
    return resp.json()


def normalize(s: str) -> str:
    return s.lower().strip()


def fuzzy_match_entity(name: str, entities: List[Dict]) -> Optional[Dict]:
    target = normalize(name)
    # Exact friendly_name match
    for ent in entities:
        if normalize(ent["attributes"].get("friendly_name", "")) == target:
            return ent
    # Contains match
    for ent in entities:
        if target in normalize(ent["attributes"].get("friendly_name", "")):
            return ent
    # Use difflib-like closeness if available; simple substring or first word
    # Fallback: match the first word of command against friendly names
    first_word = target.split()[0] if target.split() else ""
    if first_word:
        for ent in entities:
            fn = normalize(ent["attributes"].get("friendly_name", ""))
            if fn.startswith(first_word) or first_word in fn:
                return ent
    return None


def parse_command(cmd: str) -> Tuple[Optional[str], Optional[str], Optional[str], Dict]:
    """
    Returns: (action, entity_name, service_params, extra_data)
    action: e.g., 'turn_on', 'turn_off', 'set_temperature', 'toggle', 'open', 'close', 'play', 'pause', 'stop', 'status'
    entity_name: the name to match
    service_params: dict with parameters (e.g., {'temperature': 70})
    extra_data: additional context
    """
    words = cmd.lower().split()
    if not words:
        return None, None, None, {}

    # Detect common patterns
    # turn on/off, switch on/off, toggle
    if words[0] in ("turn", "switch", "toggle"):
        if len(words) >= 3:
            action_word = words[1]
            if action_word in ("on", "off"):
                action = "turn_on" if action_word == "on" else "turn_off"
                entity_name = " ".join(words[2:])
                return action, entity_name, {}, {}
        # toggle doesn't need on/off; toggle the thing
        if words[0] == "toggle" and len(words) >= 2:
            entity_name = " ".join(words[1:])
            return "toggle", entity_name, {}, {}

    # "open" / "close" (covers, garage doors, etc.)
    if words[0] in ("open", "close"):
        if len(words) >= 2:
            action = "open_cover" if words[0] == "open" else "close_cover"
            entity_name = " ".join(words[1:])
            # cover domain uses open_cover/close_cover; user says "open blinds" -> open_cover
            return action, entity_name, {}, {}

    # "lock" / "unlock"
    if words[0] in ("lock", "unlock"):
        if len(words) >= 2:
            action = "lock" if words[0] == "lock" else "unlock"
            entity_name = " ".join(words[1:])
            return action, entity_name, {}, {}

    # "set" commands: "set bedroom to 72", "set temperature to 70", "set the light to 50%"
    if words[0] == "set":
        # Look for number after "to" or directly after entity
        if len(words) >= 4:
            # "set <entity> to <value>"
            # Find "to" index
            try:
                to_idx = words.index("to")
                entity_name = " ".join(words[1:to_idx])
                val_str = words[to_idx + 1]
                # Check for % or just number
                val = None
                if val_str.endswith('%'):
                    val = int(val_str.rstrip('%'))
                else:
                    try:
                        val = float(val_str)
                        if val.is_integer():
                            val = int(val)
                    except:
                        pass
                if val is not None:
                    # Guess service: if entity likely a light, set brightness; if climate, set temperature; if fan, set speed?
                    # We'll decide later based on entity type; return param 'value'
                    return "set", entity_name, {"value": val}, {}
            except ValueError:
                pass
        # "set temperature to 70" pattern might be 4+ words without a clear "to"? But we handled.
        # Could also be "set brightness 50"
        if len(words) >= 3:
            # Maybe pattern: set <param> <value> on <entity>? Not handling yet.
            pass

    # "increase" / "decrease" / "dim"/"brighten"
    if words[0] in ("increase", "decrease", "dim", "brighten"):
        if len(words) >= 2:
            action = words[0]
            entity_name = " ".join(words[1:])
            # For lights, increase/decrease brightness by step
            return action, entity_name, {}, {}

    # "play", "pause", "stop", "next", "previous"
    if words[0] in ("play", "pause", "stop", "next", "previous"):
        if len(words) >= 2:
            action = words[0]
            # media_player: media_player.play, etc.
            entity_name = " ".join(words[1:])
            return action, entity_name, {}, {}

    # Query state: "is the <thing> on/off/open/closed/locked?"
    if words[0] == "is" and len(words) >= 3:
        entity_name = " ".join(words[1:])  # catch: is living room light on
        # We'll treat as status query
        return "status", entity_name, {}, {}

    # Generic: assume first word is action, rest is entity
    action_map = {
        "on": "turn_on",
        "off": "turn_off",
        "activate": "turn_on",
        "deactivate": "turn_off",
        "disable": "turn_off",
        "enable": "turn_on",
    }
    if words[0] in action_map:
        if len(words) >= 2:
            entity_name = " ".join(words[1:])
            return action_map[words[0]], entity_name, {}, {}

    # Check for color preset patterns: "set light to warm", "turn on warm", "warm light", etc.
    cmd_lower = cmd.lower()
    for preset_name, preset_values in COLOR_PRESETS.items():
        if preset_name in cmd_lower:
            # Find what entity they're talking about
            entity_name = None
            
            # Pattern: "set <entity> to <color>"
            try:
                to_idx = words.index("to")
                if to_idx < len(words) - 1:
                    potential_color = words[to_idx + 1]
                    if potential_color in COLOR_PRESETS:
                        entity_name = " ".join(words[1:to_idx])
                        if not entity_name:
                            entity_name = "light"
                        return "turn_on", entity_name, {"color_preset": preset_name}, {}
            except ValueError:
                pass
            
            # Pattern: "turn on <color>" or "turn <color> on" or "<color> light"
            # remove the preset word and see what's left
            words_without_preset = [w for w in words if w not in COLOR_PRESETS]
            if words_without_preset:
                entity_name = " ".join(words_without_preset)
            if not entity_name or entity_name in ("turn", "on", "off", "set"):
                entity_name = "light"
            return "turn_on", entity_name, {"color_preset": preset_name}, {}

    return None, None, None, {}


def determine_service(action: str, entity: Dict, params: Dict = None) -> Tuple[str, str, Dict]:
    """
    Given an action and entity state dict, return (domain, service, service_data)
    """
    if params is None:
        params = {}
    entity_id = entity["entity_id"]
    domain = entity_id.split(".")[0]
    service_data = {"entity_id": entity_id}

    # Map action to service call
    if action == "turn_on":
        service = "turn_on"
        # Handle color presets
        if domain == "light" and "color_preset" in params:
            preset_name = params["color_preset"]
            if preset_name in COLOR_PRESETS:
                preset = COLOR_PRESETS[preset_name]
                # Support both rgb_color and color_temp_kelvin
                if "rgb_color" in preset:
                    service_data["rgb_color"] = preset["rgb_color"]
                if "color_temp_kelvin" in preset:
                    service_data["color_temp_kelvin"] = preset["color_temp_kelvin"]
                if "brightness" in preset:
                    service_data["brightness"] = preset["brightness"]
        if domain == "light" and "brightness" in params:
            service_data["brightness_pct"] = params["brightness"]
        elif domain == "climate" and "temperature" in params:
            service_data["temperature"] = params["temperature"]
    elif action == "turn_off":
        service = "turn_off"
    elif action == "toggle":
        # Use toggle service if available, else infer current state
        if domain in ("light", "switch", "fan", "cover"):
            service = "toggle"
        else:
            # fallback: check state and opposite
            current = entity["state"]
            if current in ("on", "playing", "open", "unlocked"):
                service = "turn_off"
            else:
                service = "turn_on"
    elif action == "open_cover":
        if domain in ("cover", "garage_door"):
            service = "open_cover"
        else:
            service = "turn_on"  # maybe?
    elif action == "close_cover":
        if domain in ("cover", "garage_door"):
            service = "close_cover"
        else:
            service = "turn_off"
    elif action == "lock":
        if domain == "lock":
            service = "lock"
        else:
            service = "turn_on"  # wrong domain but try?
    elif action == "unlock":
        if domain == "lock":
            service = "unlock"
        else:
            service = "turn_off"
    elif action == "set":
        # Determine what to set based on domain and params
        val = params.get("value")
        if domain == "climate" and val is not None:
            service = "set_temperature"
            service_data["temperature"] = val
        elif domain == "light" and val is not None:
            service = "turn_on"
            # if val likely percent
            if val > 1 and val <= 100:
                service_data["brightness_pct"] = val
            else:
                service_data["brightness"] = int(val * 255 / 100) if val <= 100 else int(val)
        elif domain == "fan" and val is not None:
            service = "set_speed"
            service_data["speed"] = str(val)
        else:
            service = "turn_on"  # fallback
    elif action in ("increase", "dim"):
        if domain == "light":
            service = "turn_on"
            # increase brightness step (e.g. 10%)
            service_data["brightness_pct"] = "increase"
        else:
            service = "turn_on"
    elif action in ("decrease", "brighten"):
        if domain == "light":
            service = "turn_on"
            service_data["brightness_pct"] = "decrease"
        else:
            service = "turn_on"
    elif action in ("play", "pause", "stop", "next", "previous"):
        if domain == "media_player":
            service = action
        else:
            service = "turn_on"
    else:
        # default: try turn_on
        service = "turn_on"

    return domain, service, service_data


def execute_service(domain: str, service: str, data: Dict) -> requests.Response:
    url = f"{BASE_URL}/api/services/{domain}/{service}"
    resp = SESSION.post(url, headers=auth_headers(), json=data, timeout=10)
    return resp


def query_entity(entity: Dict) -> str:
    state = entity["state"]
    attrs = entity["attributes"]
    name = attrs.get("friendly_name", entity["entity_id"])
    # Build concise status
    extra = []
    if "brightness" in attrs:
        extra.append(f"brightness {attrs['brightness']}")
    if "temperature" in attrs or "current_temperature" in attrs:
        temp = attrs.get("temperature", attrs.get("current_temperature", ""))
        extra.append(f"temp {temp}")
    if "volume_level" in attrs:
        extra.append(f"volume {int(attrs['volume_level']*100)}%")
    if state in ("on", "off"):
        extra.append(f"is {state}")
    return f"{name}: {state}" + (f" ({', '.join(extra)})" if extra else "")


def main():
    parser = argparse.ArgumentParser(description="Home Assistant Control")
    parser.add_argument("command", help="Natural language command")
    parser.add_argument("--ha-url", help="Override HA URL")
    parser.add_argument("--token", help="Override HA token")
    args = parser.parse_args()

    global BASE_URL, TOKEN
    if args.ha_url:
        BASE_URL = args.ha_url.rstrip("/")
    if args.token:
        TOKEN = args.token

    if not TOKEN:
        print("❌ error: HOME_ASSISTANT_TOKEN not set. Please set the environment variable or pass --token.")
        sys.exit(1)

    command = args.command.strip()

    # Step 1: Try conversation API
    print("🔍 trying conversation API...")
    conv_result = try_conversation(command)
    if conv_result:
        low = conv_result.lower()
        negative_markers = [
            "couldn't understand",
            "could not understand",
            "not aware of any device",
            "not aware of",
            "sorry",
            "i don't understand",
        ]
        if not any(m in low for m in negative_markers):
            print(f"✅ {conv_result}")
            return
        print(f"ℹ️ conversation api did not resolve command: {conv_result}")

    print("🔄 conversation API unsuccessful or unavailable; falling back to custom resolution...")

    # Step 2: Custom resolution
    try:
        entities = fetch_states()
        services = fetch_services()
    except requests.HTTPError as e:
        if e.response.status_code in (401, 403):
            print("❌ authentication failed: check your HOME_ASSISTANT_TOKEN")
        else:
            print(f"❌ failed to fetch HA data: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ error contacting Home Assistant: {e}")
        sys.exit(1)

    # Build service domain list
    if isinstance(services, list):
        available_domains = {s.get('domain') for s in services if isinstance(s, dict) and s.get('domain')}
    elif isinstance(services, dict):
        available_domains = set(services.keys())
    else:
        available_domains = set()

    # Parse command
    action, entity_name, params, _ = parse_command(command)
    if not action or not entity_name:
        print(f"❌ couldn't understand the command: '{command}'. Try rephrasing with a clear action and target.")
        sys.exit(1)

    # Match entity
    # Special case: if entity_name is "light" or "lights" and we have a color preset, get all lights
    if entity_name.lower() in ("light", "lights") and params.get("color_preset"):
        preset_name = params["color_preset"]
        
        # Check if this preset maps to a scene
        if preset_name in COLOR_PRESETS and "scene" in COLOR_PRESETS[preset_name]:
            # Try to find matching scenes
            scene_keyword = COLOR_PRESETS[preset_name]["scene"]
            scenes = [e for e in entities if e["entity_id"].startswith("scene.")]
            matching_scenes = [s for s in scenes if scene_keyword in s["entity_id"].lower()]
            if matching_scenes:
                for scene in matching_scenes:
                    # Check if we have brightness override
                    preset = COLOR_PRESETS.get(preset_name, {})
                    scene_data = {"entity_id": scene["entity_id"]}
                    if "brightness" in preset:
                        scene_data["brightness"] = preset["brightness"]
                    try:
                        resp = execute_service("scene", "turn_on", scene_data)
                        if resp.status_code not in (200, 201):
                            print(f"⚠️ failed to activate {scene['attributes'].get('friendly_name', scene['entity_id'])}")
                    except Exception as e:
                        print(f"⚠️ error activating {scene['attributes'].get('friendly_name', scene['entity_id'])}: {e}")
                print(f"✅ activated {len(matching_scenes)} scenes for '{preset_name}'")
                return
        
        # Fallback: get all light entities and apply RGB color
        light_entities = [e for e in entities if e["entity_id"].startswith("light.")]
        if light_entities:
            # Apply color preset to all lights
            for entity in light_entities:
                dom_used, service, service_data = determine_service(action, entity, params)
                service_data.pop("color_preset", None)
                try:
                    resp = execute_service(dom_used, service, service_data)
                    if resp.status_code not in (200, 201):
                        print(f"⚠️ failed to set {entity['attributes'].get('friendly_name', entity['entity_id'])}")
                except Exception as e:
                    print(f"⚠️ error setting {entity['attributes'].get('friendly_name', entity['entity_id'])}: {e}")
            print(f"✅ set {len(light_entities)} lights to {params['color_preset']}")
            return
        else:
            print("❌ no light entities found")
            sys.exit(1)

    entity = fuzzy_match_entity(entity_name, entities)
    if not entity:
        # Show top 3 matches
        name_lower = normalize(entity_name)
        matches = []
        for ent in entities:
            fn = normalize(ent["attributes"].get("friendly_name", ""))
            if name_lower in fn or fn in name_lower:
                matches.append(ent)
        if matches:
            print("❌ entity not found. best matches:")
            for m in matches[:3]:
                print(f"  - {m['attributes'].get('friendly_name')} ({m['entity_id']})")
        else:
            print(f"❌ no entity found matching '{entity_name}'")
        sys.exit(1)

    entity_id = entity["entity_id"]
    domain = entity_id.split(".")[0]

    # Determine service and service_data
    dom_used, service, service_data = determine_service(action, entity, params)
    # Override with domain from entity if necessary and ensure it's allowed
    if dom_used not in available_domains:
        print(f"❌ domain '{dom_used}' not available in your HA services")
        sys.exit(1)

    # Merge params from parse if any (but drop generic helper keys and color_preset)
    service_data.update(params)
    service_data.pop("value", None)
    service_data.pop("color_preset", None)  # already handled in determine_service

    # For status queries, just read state
    if action == "status":
        print(f"✅ {query_entity(entity)}")
        return

    # Execute
    try:
        resp = execute_service(dom_used, service, service_data)
        if resp.status_code in (200, 201):
            # fetch updated state for confirmation
            updated = SESSION.get(BASE_URL + f"/api/states/{entity_id}", headers=auth_headers(), timeout=10).json()
            new_state = updated["state"]
            name = entity["attributes"].get("friendly_name", entity_id)
            print(f"✅ {name} is now {new_state}")
        else:
            err = resp.text
            try:
                err = resp.json().get("message", err)
            except:
                pass
            print(f"❌ service {dom_used}.{service} failed: {err}")
            sys.exit(1)
    except requests.HTTPError as e:
        if e.response.status_code in (401, 403):
            print("❌ authentication failed: check your HOME_ASSISTANT_TOKEN")
        else:
            print(f"❌ service call failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ error executing service: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
