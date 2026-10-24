# London Loop

A GTA-style playable London in the browser. Zone 1 is at true 1:1 scale, built from OpenStreetMap: Paddington to Tower Bridge, King's Cross to Vauxhall, and Battersea. It's a fork of mrdoob's [Slop New York](https://github.com/mrdoob/slop-newyork) (MIT), rebuilt for London on three.js r186 (WebGPURenderer + TSL, vendored in `vendor/three/`).

## Play
```bash
cd ~/Documents/london-loop
python3 -m http.server 8000
```
Then open http://localhost:8000 in Chrome, Edge or Safari 26+ (WebGPU).

URL flags:
- `?lite`: no screen-space reflections, for slower machines.
- `?webgl`: WebGL2 fallback.
- `?offline`: skip Supabase.
- `?tp=bigBen`: start at a teleport spot.
- `?time=midnight`: time of day (golden / midday / twilight / midnight).
- `?weather=drizzle`: clear / overcast / drizzle / fog.

| Key | |
|---|---|
| 1–6 | Walk · Black cab · RideLDN car · Hire bike · Police helicopter · Thames boat |
| W A S D | move / steer · Shift boost · Space handbrake (cars) / jump / climb (heli) · Q/C descend |
| 7 8 9 / 0 / V | chase, action, cockpit (right-hand drive) / Big Ben scenic cam / cycle cameras |
| M | London Street Atlas: click to teleport, right-click to set a GPS route |
| R · Enter · X | RideLDN app · accept job · decline |
| N | drive a London bus |
| J · F | Bus driver route picker · bus doors |
| G · K | horn · sound on/off |
| H / L | cab's TAXI light / helicopter searchlight |
| B | open / close Tower Bridge |
| U | hide the HUD |

**RideLDN** is the Uber-style ride-hail mode under our own made-up brand:
1. Switch to the RideLDN car (3) and go online in the app.
2. Accept a job and follow the GPS route to the pickup pin.
3. Stop by the pin to pick the passenger up, then drop them off.

The fare and your rating go to the leaderboard.

**Bus driver**: press J (or the Bus driver button) and pick one of 16 real London routes and a direction. Drive the route, pull into each stop's bay under 2 mph, open the doors with F, and close them once everyone's on. The shift is scored on passengers carried, timekeeping and comfort, and saved to Supabase (`slop_bus_shifts`).

## Supabase
Player profiles, saved position/mode/time/weather, finished rides and the leaderboard are stored in the **sim-london** Supabase project, in separate `slop_*` tables:
- `slop_players`
- `slop_rides`

Everything goes through RPCs (`slop_join`, `slop_load`, `slop_save`, `slop_finish_ride`, `slop_leaderboard`, …). Fares are computed on the server. The client is `js/backend.js` (plain fetch, publishable key). If Supabase can't be reached, the game falls back to a local offline mock and shows "Offline". A claude.ai artifact preview is always offline, because artifact pages can't call outside servers.

## Layout
- `js/main.js`: game shell (lead).
- `js/geo-frame.js`: world frame. Origin is Nelson's Column; +x east, +z south; metres.
- `js/ldn-geodata.js`, `js/london-world.js`, `js/london-config.js`: baked map data + world queries (ground height, bridges, water, nearest road).
- `js/london-city.js`, `js/city/*`, `js/street-details.js`, `js/trees.js`, `js/tsl-materials.js`: buildings, roads, Thames, bridges, parks, street furniture.
- `js/london-landmarks.js`, `js/landmarks/*`: Big Ben & Parliament, London Eye, Tower Bridge, the Shard, St Paul's, the Gherkin, Buckingham Palace, Trafalgar Square, Piccadilly Circus, Battersea Power Station.
- `js/london-vehicles.js`, `js/controllers.js`: vehicles and player physics.
- `js/road-network.js`, `js/traffic-sim.js`, `js/traffic.js`, `js/road-paint.js`, `js/pedestrians.js`: left-hand traffic, signals, roundabouts and pedestrians.
- `js/london-map.js`, `js/lighting.js`, `js/post-processing.js`, `js/london-ui.js`: map, time/weather and HUD.
- `js/rideldn.js`, `js/backend.js`: ride-hail game + Supabase.
- `tests/sandbox-*.html`: per-module test pages; `tests/*.test.mjs`: Node tests.
- `SPEC.md` / `INTEGRATION.md`: the contracts each part was built against.
- `reference/`: the original Slop New York modules and tools, for reference.

## Rebuilding the map data
1. Download `greater-london-latest.osm.pbf` from Geofabrik.
2. Extract the play area:
   ```bash
   node tools/osm-pbf-extract.mjs <pbf> tools/data/osm_central.json
   ```
3. Bake the game data:
   ```bash
   node --max-old-space-size=12000 tools/build-london-geodata.mjs
   ```
   This writes `data/ldn-geo.json` and `data/ldn-buildings.bin`.

`tools/build-dist.sh` copies a trimmed static build into `dist/` for hosting.

Map data © OpenStreetMap contributors (ODbL).
