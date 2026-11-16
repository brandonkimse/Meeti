# Meeti

**Meet in the middle, fairly.** Meeti helps friend groups decide where to meet. It finds spots that are fair for everyone's actual commute, lets the group vote, and then shows everyone arriving on a live map.

## Quick start

Meeti runs on [Supabase](https://supabase.com): Postgres, Auth and Realtime.

1. **Create a Supabase project.**
2. **Create the schema:** open the SQL editor and run [`supabase/migrations/20261116000000_meeti_init.sql`](supabase/migrations/20261116000000_meeti_init.sql). If you use the Supabase CLI, `supabase db push` does the same.
3. **Set the auth redirect URLs:** under Authentication → URL Configuration, set the Site URL to your app's URL, and add `http://localhost:3000/auth/callback` plus `https://YOUR-DOMAIN/auth/callback` to the redirect URLs.
4. **Configure env vars:** copy `.env.example` to `.env.local` and fill in the four Supabase values.
5. **Run it:**

```bash
npm install
npm run dev:demo      # demo mode: adds a "Try the live demo" button
# or
npm run dev
```

Open http://localhost:3000.

### Deploying to Vercel

Import the repo and add the same environment variables (plus `MEETI_DEMO_MODE=true` if you want the demo). For `DATABASE_URL`, use the **transaction pooler** connection string (port 6543). Also add your Vercel domain's `/auth/callback` to Supabase's redirect URLs.

## The flow

1. **Sign up**, then **create a group**. You can give it a photo or emoji and a description, and share its invite link or code.
2. **Start a hangout**: pick a title, day and time, the default way people are travelling, and optionally a kind of place.
3. **Everyone adds a starting point**: either a one-time GPS fix or a typed address or landmark. Each person can choose their own transport mode.
4. **Fair picks**: Meeti recommends real places. You can also search for any place and add it.
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
    db.ts                 # Postgres (Supabase) connection + query helpers
    auth.ts               # current user via Supabase Auth + profiles table
    supabase.ts           # request-bound and admin Supabase clients
    realtime.ts           # publishes events with realtime.send()
    background.ts         # after(): work that continues once the response is sent
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
    api/…                 # JSON route handlers
    auth/callback/        # Supabase email-link landing
    (auth)/, (app)/, join/ # pages
  lib/client/realtime.ts  # shared Supabase Realtime channels + presence
supabase/migrations/      # schema, RLS, realtime authorization
  components/             # UI, map (Leaflet), hangout views
```

- **Realtime:** Supabase private broadcast channels, with topics `user:<id>`, `group:<id>` and `hangout:<id>`.
  - The server publishes with `realtime.send()`.
  - Policies on `realtime.messages` only deliver a topic to the user it names, or to members of that group or hangout.
  - Online status uses Realtime presence on group channels.
- **Database:** Supabase Postgres. The server connects directly and enforces permissions in code. Every public table has RLS turned on with **no** policies, so the public anon key can't read or write app data through the REST API.
- **Serverless-safe:** nothing depends on a long-running process. Background work goes through `after()`. Demo journeys are stored in the database and moved forward by the live screen.
- **Privacy:**
  - Starting points are only visible to that hangout's members.
  - Live location needs explicit consent per hangout. The consent screen shows exactly who can see it and until when.
  - Coordinates are only served while sharing is active. Stopping deletes them.
  - Sharing expires at the hangout's end time, and completing a hangout wipes everyone's coordinates.

## External services & what needs configuration

| Capability | Default (keyless) | Production upgrade |
|---|---|---|
| Walking / cycling / driving times | OSRM public servers (rate-limited, queued politely) | Self-host OSRM; set `MEETI_OSRM_*_URL` |
| Public transit times | **Estimate** from real road distance, labelled in the UI | `GOOGLE_MAPS_API_KEY` (Distance Matrix, live schedules) |
| Place search & nearby places | Photon (OpenStreetMap) | `GOOGLE_MAPS_API_KEY` adds photos + ratings |
| Reverse geocoding | Nominatim | Self-host or set `MEETI_NOMINATIM_URL` |
| Map tiles | openstreetmap.org (dev only) | `NEXT_PUBLIC_MAP_TILE_URL` (MapTiler, Stadia…) |

If a routing server is unreachable, Meeti falls back to a straight-line estimate and **says so in the UI**. Times marked `*` are estimates. OpenStreetMap has no ratings or photos, so without Google, places show an illustrated category cover instead of a fake photo.

See `.env.example` for every option.

## Demo mode

With `MEETI_DEMO_MODE=true`, "Try the live demo" creates a private sample world for each visitor. It's set in San Francisco, with four simulated friends, group history, and a dinner plan already in progress. The simulated friends vote shortly after you change the poll. After you lock in a spot they travel along real routes so the live map has movement, and "Simulate my trip" moves you too. Each demo visitor gets a real Supabase account (on an `@demo.example.com` address) created with the service-role key, so you may want to clean those up now and then. None of this runs outside demo mode.
