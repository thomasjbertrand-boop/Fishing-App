# 🎣 Colorado Fly Fishing Dashboard

Live USGS stream gauges + AI-powered fly shop reports + Today's Best Bet.
Deploy once from your laptop → bookmark the URL → works on any phone, forever.

---

## Deploy to Vercel (free, ~5 minutes)

### Step 1 — Install Vercel CLI (one time)
```bash
npm install -g vercel
```

### Step 2 — Deploy
```bash
cd co-fishing-dashboard
npm install
vercel
```

When prompted:
- **Set up and deploy?** → Y
- **Which scope?** → your personal account
- **Link to existing project?** → N
- **Project name?** → co-fishing-dashboard (or anything)
- **Directory?** → ./ (just hit Enter)
- **Override settings?** → N

### Step 3 — Add your Anthropic API key
```bash
vercel env add ANTHROPIC_API_KEY
```
- **Value?** → paste your key (from console.anthropic.com)
- **Environments?** → Production, Preview, Development (select all with spacebar)

### Step 4 — Redeploy with the env var
```bash
vercel --prod
```

Vercel prints your URL: `https://co-fishing-dashboard-xxxx.vercel.app`

**Bookmark that URL on your phone. Done.**

---

## Add to iPhone Home Screen (feels like a native app)

1. Open the URL in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Name it "Fishing" → Add

It opens full-screen with no browser chrome, like a real app.

---

## How it works

- **USGS gauges** — fetched server-side (no CORS issues), auto-cached 24h in your browser
- **Shop reports** — Claude reads each shop's web page via AI search, extracts conditions + flies
- **Best Bet** — after all shops load, a second Claude call synthesizes a single top pick
- **24h cache** — localStorage saves everything; re-opens instantly without re-fetching
- **Auto-refresh** — if you leave the tab open, it refreshes automatically every 24h

## Shops covered
- Anglers Covey (Colorado Springs)
- Anglers All (Littleton)
- Golden Fly Shop (Golden)
- Minturn Anglers (Minturn)
- Vail Valley Anglers (Vail/Edwards)
- Avid Angler / Max (Denver)

## Gauges covered
- Roaring Fork @ Glenwood Springs
- Eagle River @ below Gypsum
- Colorado River @ Glenwood Canyon
- Colorado River @ near Cameo
- Fryingpan River @ Ruedi Outflow
- Blue River @ below Dillon Reservoir
- Colorado River @ near Granby
- Gunnison River @ near Grand Junction
