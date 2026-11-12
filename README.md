# Wisp Hollow

**Tagline:** Your table becomes a tiny valley. Lay bridges, shelter storms, and guide autonomous wisps home using only your hands.

A seated, hands-first mixed-reality game for Meta Quest, built on the Immersive Web SDK (WebXR).
Track: **Gaming**. Division: **New Experience**.

## How it plays (3-minute "Dusk")
- **Rest your palm on your table**: the valley blooms on your real surface (plane detection finds it first; your palm sets the exact height, so it works in any room).
- **Pinch a log and lay it over the river**: wisps are autonomous agents (utility AI); they route over the bridges you build.
- **Hold an open palm over them when it rains**: wisps run to your hand for cover. Two hands make a bigger dome.
- **Real objects become mountains:** objects Quest's scene understanding detects on your table are turned into mountains automatically (WebXR mesh detection). For anything it misses, pinch the air above the object to raise one by hand.
- **Poke** a wisp to startle it. Wisps remember where they got wet.

## Reason to come back
Rescued wisps move into your persistent valley (lanterns light up, saplings grow in real time while you're away). A new Daily Dusk each day, with a streak.

## Accessibility
Gaze-dwell mode (no hands needed), voice commands ("home", "shelter", "bridge"), high-contrast palette, one-handed play (a single palm shelters), ferrying wisps by hand as an alternative to bridges.

## Develop
```bash
npm install
npm run dev            # HTTPS dev server + emulator (installs a Playwright browser the first time)
WISP_HTTP=1 npx iwsdk dev restart --no-open --foreground   # plain HTTP, no browser download
npm run build          # outputs dist/
```
Controllers also work (trigger = pinch, hold grip = open palm).
Desktop testing: mouse = hand (hold to pinch, `S` held = open palm, wheel = hand height).

## Deploy (judges need a public HTTPS link)
Push to GitHub, enable Settings, Pages, Source: GitHub Actions. The included workflow builds and publishes `dist/` on every push to `main`. Vite uses a relative base, so any subpath works.
Alternative: `npx vercel@latest deploy --prod --yes`.

## Credits
Everything is procedural: no external assets, models, or audio files. Sound is synthesized with WebAudio.
