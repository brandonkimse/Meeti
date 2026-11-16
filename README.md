# Where2

**Meet in the middle, fairly.** Where2 helps friend groups decide where to meet. It finds spots that are fair for everyone's actual commute, lets the group vote, and then shows everyone arriving on a live map.

## Quick start

```bash
npm install
npm run dev:demo      # demo mode: adds a "Try the live demo" button
# or
npm run dev           # normal mode
```

Open http://localhost:3000. Requires Node 22.13+ (it uses the built-in `node:sqlite`). You don't need any external accounts or keys.

## The flow

1. **Sign up**, then **create a group**. You can give it a photo or emoji and a description, and share its invite link or code.
2. **Start a hangout**: pick a title, day and time, the default way people are travelling, and optionally a kind of place.
3. **Everyone adds a starting point**: either a one-time GPS fix or a typed address or landmark. Each person can choose their own transport mode.
4. **Fair picks**: Where2 recommends real places. You can also search for any place and add it.
5. **Vote** with live counts. You can change your vote, and badges mark the *Most popular* and *Fairest trip* options. The host locks in the winner.
6. **Live map**: each person opts in to sharing their location for this hangout. Everyone sees avatars moving, ETAs, distances and status (*Not started*, *On the way*, *Arrived*).
7. **Wrap up**: the hangout goes into the group's history. Location sharing ends and live coordinates are deleted.

## How the fair recommendations work

`src/server/geo/recommend.ts`

1. Lay a 7×7 grid of candidate meeting areas over everyone's starting points, plus the centroid.
2. Get **real travel times** from every participant, in their own mode, to every grid point. This uses one OSRM table request per routing network.
3. Score each point with `fairnessCost` (`src/server/geo/util.ts`): `0.55·mean + 0.45·max`, plus a steep penalty when one person's trip is far longer than the median. This balances the group's total time against the worst single trip.
4. Keep the three best well-separated areas and look up **actual places** of the chosen category around them.
5. Re-score those places with real travel times. Return up to six, with at most three per area for variety.

Every option shows per-person times, the average, the longest trip, and a fairness score. The fairness score is [Jain's index](https://en.wikipedia.org/wiki/Fairness_measure) over travel times, where 100% means everyone travels equally long.

## Architecture

```
src/
  server/                 # server-only modules
    db.ts                 # SQLite (node:sqlite) schema + query helpers
    auth.ts               # scrypt passwords, DB-backed sessions (httpOnly cookie)
    realtime.ts           # pub/sub + presence used by the SSE stream
    config.ts             # providers & env configuration
    geo/
      routing.ts          # OSRM / Google travel-time matrices, rate limiting, fallbacks
      places.ts           # Photon (OSM) / Google Places search & nearby
      recommend.ts        # the fair meeting-spot algorithm
      util.ts             # haversine, fairness cost, transit model, caches
    services/
      groups.ts           # groups, memberships, invites
      hangouts.ts         # hangouts, starting points, suggestions, votes, lifecycle
      live.ts             # opt-in live location, ETAs, arrival detection, expiry
      demo.ts             # demo world + simulated journeys (demo mode only)
  app/
    api/…                 # JSON route handlers + /api/events (Server-Sent Events)
    (auth)/, (app)/, join/ # pages
  components/             # UI, map (Leaflet), hangout views
```

- **Realtime:** `/api/events` is an SSE stream. Its subscriptions are scoped to the user, their groups, and the hangout they're viewing, and membership is checked on connect. Votes, suggestions, presence and live locations all go through it.
  To scale beyond one server process, swap `realtime.ts` for Redis pub/sub, Postgres `LISTEN/NOTIFY`, or a hosted realtime service.
- **Database:** SQLite file at `./data/where2.db`, created automatically. All SQL goes through `db.ts`.
- **Privacy:**
  - Starting points are only visible to that hangout's members.
  - Live location needs explicit consent per hangout. The consent screen shows exactly who can see it and until when.
  - Coordinates are only served while sharing is active. Stopping deletes them.
  - Sharing expires at the hangout's end time, and completing a hangout wipes everyone's coordinates.

## External services & what needs configuration

| Capability | Default (keyless) | Production upgrade |
|---|---|---|
| Walking / cycling / driving times | OSRM public servers (rate-limited, queued politely) | Self-host OSRM; set `WHERE2_OSRM_*_URL` |
| Public transit times | **Estimate** from real road distance, labelled in the UI | `GOOGLE_MAPS_API_KEY` (Distance Matrix, live schedules) |
| Place search & nearby places | Photon (OpenStreetMap) | `GOOGLE_MAPS_API_KEY` adds photos + ratings |
| Reverse geocoding | Nominatim | Self-host or set `WHERE2_NOMINATIM_URL` |
| Map tiles | openstreetmap.org (dev only) | `NEXT_PUBLIC_MAP_TILE_URL` (MapTiler, Stadia…) |

If a routing server is unreachable, Where2 falls back to a straight-line estimate and **says so in the UI**. Times marked `*` are estimates. OpenStreetMap has no ratings or photos, so without Google, places show an illustrated category cover instead of a fake photo.

See `.env.example` for every option.

## Demo mode

With `WHERE2_DEMO_MODE=true`, "Try the live demo" creates a private sample world for each visitor. It's set in San Francisco, with four simulated friends, group history, and a dinner plan already in progress. The simulated friends vote shortly after you change the poll. After you lock in a spot they travel along real routes so the live map has movement, and "Simulate my trip" moves you too. None of this runs outside demo mode.
