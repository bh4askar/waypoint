# Waypoint

[Live demo](https://waypoint-bhaskar-20261121.azurewebsites.net/) | [Azure setup](README-AZURE.md)

A Node.js and vanilla JavaScript travel application with CPU-based local AI, sourced itineraries, Google login, interactive maps, saved trips and PDF exports. This is the completed Azure version.

A local-first AI travel chatbot and trip planner with an animated scenic homepage, a frosted glass planning bar, dark mode, a photographic destination explorer, detailed visual itineraries, a floating FAQ assistant and illustrated PDF downloads.

## Run

Install **Node.js 22 or newer** from [nodejs.org](https://nodejs.org/). Install the image-processing dependency once with `npm ci`.

```sh
cd waypoint
npm ci
npm start
```

On Windows, double-click **`START.cmd`**. The launcher starts the server, waits until it is ready, then opens your browser. Keep its terminal open while using the website. `npm start` uses the same launcher. If the default port is occupied, it picks an available port from 3000–3010; it reopens an already-running copy of this project. An explicitly configured `PORT` or `APP_URL` is preserved.

**Do not open `public/index.html` directly.** The planner, maps, saving and PDF export need the server. If you open that file, it now shows launch instructions. The default address is **http://localhost:3000**; use the address printed by the launcher. For a server-only deployment, run `npm run serve`.

The homepage starts with a preference conversation. Describe an adventure, beach holiday, food trail or a destination; choose a suggested place, then enter your budget, dates, group size and pace to generate the plan. Search by city or state using the alternate search bar, or browse the full catalogue.

## What works now

- 1,100 real geographic destinations: **950 in India and 150 abroad**, searchable by city, state, country and alternate names.
- 312 included destination guides, with source links and snapshot dates. The planner can also use geolocated attractions from nearby sourced guides, keeping them within 60 km and labelling those transfers. 718 destinations currently have enough local source information to generate a plan. Other destinations can look up nearby attractions using the public OpenStreetMap Overpass service when online. Some destinations have too little source coverage to produce a useful plan; the app says so instead of inventing attractions.
- Six priority Jharkhand cities: Hazaribagh, Ranchi, Koderma, Ramgarh, Dhanbad and Jamshedpur, with separately researched attraction descriptions.
- The same planning and visual-card system for the entire catalogue. Jharkhand is one collection, not the limit of the app.
- One-to-seven-day itineraries with visit-length estimates, transfer guidance, lunch breaks, practical notes, unused alternatives, interactive street maps and group budget breakdowns.
- Chat-led preference discovery with recommendations before entering budget and group details.
- Interactive Leaflet/OpenStreetMap street maps for the trip and individual stops, numbered markers, photo popups and optional driving routes. Unresolved coordinates and unavailable map services are clearly labelled.
- A 25-photo crossfade hero with 20 night or sunset scenes and 5 daytime landscapes, purple/orange/red colour grading, subtle scroll entrances and hover animations, reduced-motion support, responsive layouts and a remembered light/dark preference. Only two hero image layers are kept in the page; the next scene loads in advance.
- Favourite destinations, saved device trips, editable interests and pace, rainy-day/later-start scenarios and stop swaps.
- Real PDF downloads, including destination photographs where available, budget guidance, itinerary detail and source attribution.
- A floating Ask Waypoint FAQ assistant, using an included knowledge base and no paid AI calls.

## AI and itinerary quality

The included planner combines geographic scheduling with a small **multinomial Naive Bayes preference model**, trained on examples included in `lib/preference-model.mjs`. It uses travel notes to supplement selected interests. It does not call a paid language model.

The planner selects real guide-listed attractions. Times are flexible planning blocks, not live appointment slots. Transfers are approximate distance-based or manually indicated planning estimates; the map can request driving routes from OSRM when online, with dashed visit-order lines as a fallback. Live traffic and weather are not used. Budget allowances include food, activities, local transport and `days - 1` nights of accommodation for the whole group. Flights, visas and intercity travel are excluded. Currency conversions are illustrative; they are not live foreign-exchange rates.

Community guide information can be out of date. The interface links to sources and venue information so visitors can check current opening hours, tickets, access and conditions. Longer trips to places with short guides have explicit flexible days. Rain is a user-selected scenario, not a forecast.

## Conversational AI and responsiveness

The main chat and floating Ask Waypoint chat use a real local **Qwen3 0.6B Q4 model** through llama.cpp on Windows x64 and Ubuntu Linux x64. Replies stream as they are generated; source-backed destination cards appear immediately. Your latest explicit preference replaces the older interest, while follow-ups retain region, duration, group size and budget. Clicking a card opens the full-page trip form with those details prefilled.

This source repository excludes model weights and generated native binaries. Run `npm run setup-ai` once to download them; the server then starts the model automatically. No paid inference API or sign-in is required. The model is small so it can run on this laptop; generated conversational answers can still be imperfect. Attraction cards and the planner use source data rather than generated venue facts.

For a source checkout on Windows x64 or Ubuntu Linux x64, run `npm run setup-ai` once to download the approximately 400 MB model and 25 MB runtime, then start Waypoint. Model: [Qwen3 0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), Apache 2.0; quantisation: [Unsloth](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF). Runtime: [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT. Licences are in `licenses/`. Ubuntu setup requires `tar` and `dpkg-deb`; Windows uses its bundled `tar`. Linux binaries are downloaded to `native/`, Windows binaries to `data/ai/runtime/`, and model weights to `data/ai/`. These generated files are excluded from Git. `LLAMA_SERVER_PATH` can point to a compatible custom binary.

Itinerary responses no longer wait for network photo searches. Included and cached photographs are applied immediately; additional photo lookup happens in the background with at most two jobs. Cities without enough local data attempt online discovery and show clickable ready-to-plan alternatives when it fails. The interface retains glass surfaces, photo-based colours and crossfades while avoiding nested blur filters, continuous scene-colour animation and expensive photo drift.

Local loopback requests are exempt from the public-server rate limits. A local runtime file directs older server tabs to the latest launched app, and the launcher compares all core source files before reusing a process.

## Optional itinerary language-model enrichment

Install [Ollama](https://ollama.com/) separately and download a small model:

```sh
ollama pull qwen2.5:1.5b
```

Copy `.env.example` to `.env` and set:

```ini
ENABLE_LOCAL_AI=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b
```

Restart Waypoint. The planner offers an optional local-AI enrichment switch. It rewrites source descriptions; it does not create new stops, change prices or set opening hours. If the model is unavailable, the sourced plan is kept. AI-generated descriptions still need checking against sources. This integration is supplied but cannot be verified end-to-end until Ollama and the selected model are installed. On modest hardware, leave it off for faster planning.

## Activate Google sign-in

Google sign-in is active on the live Azure demo for approved test accounts. A fresh source clone needs **your own credentials**. Device planning, saving and PDF exports work while it is disconnected. The interface clearly identifies this state.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project and configure its OAuth consent screen for basic profile and email access.
2. Create an OAuth client with application type **Web application**.
3. Add this exact authorised redirect URI:

   `http://localhost:3000/auth/google/callback`

4. Copy `.env.example` to `.env` and enter the client ID and secret:

```ini
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
APP_URL=http://localhost:3000
```

5. Restart the server. If your Google project is in testing, add permitted test users. For public use, complete Google’s applicable publishing requirements and register your production callback URL.

Reference: [Google’s web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

The server uses an authorization-code flow, PKCE, a cookie-bound random state, server-side token exchange, Google userinfo, and HttpOnly SameSite cookies. Only name, email and Google user ID are stored. Tokens and client secrets are never sent to the frontend. Sessions expire after a day and are held in memory, so a server restart requires signing in again. Account trips remain in `data/accounts.json`; device trips remain in browser local storage.

## Free operation and network use

There are no required subscriptions, paid APIs or remote databases. Included data, images, fonts, preference inference, planning and PDF generation run locally. First-time discovery of places or additional photos needs internet access and uses public services with their own availability and usage limits. Results are cached in `data/`. Do not treat those public services as unlimited production infrastructure.

Google login needs internet access. An Ollama model requires an initial download and local compute. A public multi-user deployment needs a Node server, persistent storage, HTTPS and resources for any shared language-model inference. Hosting costs and provider free tiers depend on the chosen deployment; forever-free public hosting is not promised.

## Data and photo credits

- Geographic catalogue: [GeoNames](https://www.geonames.org/), CC BY 4.0, snapshot from `cities5000.zip` and admin/country files. The catalogue is a set of real places to explore, not a claim that every city has a complete tourist guide.
- Included travel-guide descriptions: [Wikivoyage contributors](https://en.wikivoyage.org/), CC BY-SA 4.0. Each imported guide records its source URL and revision timestamp. Adapted guide text remains under CC BY-SA 4.0.
- Jharkhand guide additions: original descriptions based on linked district administration and Jharkhand Forest Department pages. No live prices or opening times are asserted.
- Discovered place data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Cached discovery records keep source links and retrieval dates.
- Hero images: Unsplash. The Dolomites asset is called `switzerland.jpg` for historical implementation reasons; the displayed location is correctly labelled Lago di Braies, Italy. The `lisbon.jpg` asset depicts Porto and is used for Porto. See `public/assets/photo-credits.json`.
- All 1,100 destinations have included, source-attributed local JPEG photographs; 700 have multiple views. Matched photographs cover 997 of 3,679 guide entries, and 306 have multiple views. Source identity uses geographic entity IDs, article coordinates, named captions and reviewed venue addresses. This is source matching, not an independent human review of every scene. Unmatched entries have an explicit missing-photo state; landmark cards never substitute a city cover. Individual sources, artists and rights remain in the credit files. See [photo sourcing](docs/Photo-sourcing.md) and the [coverage report](public/assets/photo-coverage.json).
- Manrope font: SIL Open Font License. See `public/assets/Manrope-OFL.txt`.

Keep the data and photo credits when sharing this project. Source-code licensing is in `LICENSE` and does not replace third-party data or image licences.

## Tests and maintenance

```sh
npm test
```

Tests additionally check preference changes, conversational follow-ups, duplicate names, Goa matching, and generation for every one of the 718 locally ready destinations. Tests cover destination counts, the requested Jharkhand guides, sourced itineraries, calendar validation, budgets, guide exhaustion, rain/pace changes, alternatives, preference inference and PDF structure. Browser checks during development covered generation, theme switching, FAQ chat, device saving, mobile overflow and downloading a PDF. Google sign-in, account saving, maps, PDF downloads and streamed Qwen chat were verified on the Azure demo. Optional Ollama enrichment has not been verified with an installed model.

Core source files:

- `server.mjs`: local HTTP server, Google OAuth and account trips.
- `lib/planner.mjs`: input validation, preference matching, geographic scheduling and budget allowances.
- `lib/photos.mjs`: included and cached photo resolution.
- `lib/pdf.mjs`: dependency-free PDF generation with JPEG imagery.
- `lib/catalogue.json`, `guides.json`, `jharkhand.mjs`: geography and source-backed travel information.
- `public/`: interface, animation styles, images and fonts.

Back up `data/accounts.json` before moving a server. Refresh guides and photos when source content changes. Dataset/asset preparation scripts are included under `scripts/`; they are optional maintenance tools and require Python plus Pillow for image processing. They are not needed to run the website.

## Deployment

For a public Node deployment set `HOST=0.0.0.0`, the platform’s `PORT`, and the HTTPS `APP_URL`. Keep `data/` on persistent storage. Register the corresponding Google callback URL. For Azure F1 and Linux runtime preparation, see `README-AZURE.md`. Avoid deploying this backend as a static-only site: login, account saving and PDF routes require the server.

The application uses Node.js built-ins plus Sharp for resizing and converting source photos into JPEGs. Python and Pillow are used by optional data and image preparation scripts.

Original publisher and venue references are stored in `lib/external-photo-sources.json`; downloaded file paths are recorded in `lib/source-photo-files.json`. Only downloaded, validated files appear in these galleries. The registered-source cache can convert older remote references with Sharp and is bounded to 96 MB. Original publishers retain their rights, and source links and credits remain visible. Source-code licensing is separate.
