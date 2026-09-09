# dgtui

> ⚡ **Proudly vibecoded.** This was built end-to-end by pair-programming with an AI agent (Pi) while driving with plain Spanish conversation — no design docs, no PRDs, just "mira a ver si es fácil..." and one iteration after another. Every feature on this page came out of that flow.

A terminal UI (TUI) for Spanish road traffic, built with [OpenTUI](https://github.com/sst/opentui) and [Bun](https://bun.com).

Browse the official DGT traffic cameras with live photos, road incidents, fixed speed cameras (radares) and — optionally — live traffic flow from TomTom, all from your terminal.

## Features

- **Traffic cameras** — browse the full DGT camera catalog (`.json` from dgt.es), filtered by road or by province + road. Photos refresh automatically every 5 minutes (configurable) plus manual refresh.
- **Live incidents** — road incidents (roadworks, closures, accidents, stopped vehicles…) parsed from the official DGT DATEX II feed. Shown under the photo with pk, description and province; scroll with `j`/`k`.
- **Fixed speed cameras (radares)** — the official DGT cinemometer inventory interleaved by pk into the camera list, so you can see at a glance where a radar sits between two cameras.
- **Traffic flow (optional, TomTom)** — with a free TomTom API key, shows the live traffic pressure at the selected camera's position: real speed vs. free-flow speed, color-coded (green ≥80%, amber 50–80%, red <50% or road closure).

## Requirements

- [Bun](https://bun.com) ≥ 1.1 (uses `bun:sqlite`-free, pure JS; any recent Bun works)
- A terminal with image support (Kitty graphics protocol or Sixel — e.g. **Kitty**, **WezTerm**, **iTerm2**, **Ghostty**) to display the camera photos.

## Install

### From source

```bash
git clone https://github.com/mjimeneznet/dgtui.git
cd dgtui
bun install
```

### Prebuilt binary (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/mjimeneznet/dgtui/main/install.sh | bash
```

Downloads the latest release binary (no Bun needed) and installs it to `~/.local/bin`.

Prebuilt binaries are produced by a GitHub Actions workflow on every `v*` tag push (darwin arm64/x64, linux x64/arm64).

## Run

```bash
bun run src/main.tsx [--carr ROAD] [--prov XX] [--interval SECONDS]
```

Examples:

```bash
bun run src/main.tsx                                   # A-42, Madrid, 5 min refresh
bun run src/main.tsx --carr A-42                       # road A-42, all provinces
bun run src/main.tsx --carr A-42 --prov 28             # road A-42, Madrid (INE code 28)
bun run src/main.tsx --carr A-6 --prov 15 --interval 120
```

Or build a standalone binary:

```bash
bun run build
./dgtui --carr A-42 --prov 28
```

## Keys

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move between cameras (radars are skipped; they're informational) |
| `j` / `k` | Scroll the incidents list |
| `p` | Pick province + road (two-pane picker) |
| `c` | Pick road directly (all provinces) |
| `r` | Refresh cameras and incidents |
| `q` | Quit |

## Optional: TomTom traffic flow

Without configuration, dgtui never calls TomTom and everything else works fine.

To enable live traffic at the selected camera's position:

1. Create a free account at [developer.tomtom.com](https://developer.tomtom.com) (free tier: 2,500 requests/day, no credit card).
2. Copy your API key from the dashboard.
3. Export it and run:

```bash
export TOMTOM_KEY=your_api_key_here
bun run src/main.tsx
```

Traffic requests are cached per point (~100 m) for 2 minutes, so normal use stays well inside the free tier. If the key is missing, invalid, or the road has no flow data, the traffic line is simply not shown — the app never breaks.

## Data sources

All official and public:

- **Camera catalog**: `https://www.dgt.es/.content/.assets/json/camaras.json`
- **Incidents** (DATEX II v3.7): `https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml`
- **Fixed radars** (DATEX II v1.0 inventory): `https://infocar.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml`
- **Camera photos**: `https://etraffic.dgt.es/camarasEtraffic/<id>.jpg`
- **Traffic flow** (optional): TomTom `flowSegmentData` API with your own key

Note: Catalonia and the Basque Country manage their own roads, so their incidents/radars may be missing from the state feeds (as stated by DGT itself).

## Development

Source lives in `src/`:

- `main.tsx` — entry point (parses CLI args, boots the TUI)
- `app.tsx` — UI layout, keyboard handling, state
- `dgt.ts` — data layer: cameras, incidents, radars, traffic

`bunx tsc --noEmit` type-checks; `bun run build` produces a standalone executable.
