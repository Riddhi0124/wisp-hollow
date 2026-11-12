# Devpost submission draft (edit before posting)

**Name:** Wisp Hollow
**Tagline (140 max):** Your table becomes a tiny valley. Lay bridges, shelter storms and guide living wisps home with only your hands.
**Track:** Gaming  **Division:** New Experience

## Description (~330 words)
**Inspiration.** The best seated moments in VR are small and tactile. I wanted a game that only makes sense on *your* table, where your real room is part of the puzzle, and where your hands do things hands naturally do: lay a plank, cup something fragile, poke a curious creature.

**What it is.** Wisp Hollow is a mixed-reality tabletop game. Rest your palm on your table and a glowing valley blooms on it. Tiny wisps hatch at one end and want to reach the hearth at the other. They are autonomous agents, so you never steer them. You shape their world: pinch a log and lay it over the river, then hold an open palm over them when rain rolls in. The wisps run to your hand for cover. Objects Quest's scene understanding detects on your table (laptops, plants, boxes) become mountains automatically, and for anything it misses, a quick pinch above the object raises one there. Your real clutter reshapes the map.

**Why it fits the criteria.**
- *Hands-first, seated, short:* the whole game (menus included) works with hands only, inside a 2-foot reach, and a Dusk takes about 3 minutes.
- *Purposeful passthrough:* the valley is anchored to your detected table (WebXR plane detection), calibrated by your palm, and reshaped by objects found with mesh detection, with no room scan needed, so it works in any room. Detected real objects (WebXR mesh detection) become terrain.
- *Agentic:* each wisp scores goals (home, healing, shelter, company, curiosity), remembers where it got wet, and learns where bridges are. It runs on-device, with no third-party AI service.
- *Reason to come back:* rescued wisps move into a persistent valley with lanterns, and saplings grow in real time while you're away. A Daily Dusk adds a streak.
- *First five minutes:* no text wall. A glowing guide ring shows the log, the river, then the first storm. The first payoff (wisps reaching the fire) comes within the first minute or two.
- *Accessibility:* gaze-dwell mode, voice commands, high-contrast palette, one-handed play, and an optional controller fallback.
- *FoV-aware:* the HUD sits low and centred in a narrow cone.

**How I built it.** Immersive Web SDK on Three.js. Raw WebXR hand joints drive pinch, poke and palm-down shelter detection. Everything is procedural, with no asset downloads, so it cold-starts fast. Audio is synthesized with WebAudio.

**What's next.** Persistent spatial anchors, two-player co-op over shared table anchors, and mesh-detected real furniture as terrain.

**Hand interactions (optional field).** Pinch to carry wisps and logs; quick pinch-in-air to place mountains; open palm facing down as a shelter; two palms form a larger dome; fingertip poke; palm-flat-on-table calibration.

## Video checklist (under 3:00, real headset or XR emulator footage)
1. 0:00 Palm on table, valley blooms (the hook).
2. 0:15 Lay the bridge, wisps cross.
3. 0:40 Storm: palm umbrella, wisps run under it.
4. 1:05 Pinch a real mug to raise a mountain.
5. 1:30 Result, valley with residents, streak.
6. 1:50 Accessibility: gaze + voice, high contrast.
No AI-generated footage.
