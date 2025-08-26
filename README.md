# VRP Studio — Monorepo (Frontend + Backend)

A full‑stack playground for **Vehicle Routing Problems (VRP)**.  
It includes a **Next.js** frontend for map‑based experimentation and a **FastAPI** backend
with modular distance‑matrix adapters and multiple solvers (**OR‑Tools**, **Pyomo**, **VROOM**) plus
benchmark loaders and emissions enrichment.

---

## Highlights

- ✨ **Multiple solvers**: OR‑Tools (TSP/CVRP/VRPTW/PDPTW), Pyomo (CVRPTW via CBC), VROOM (coord/index; NN fallback), and a Mapbox Optimizer proxy.
- 🧭 **Distance‑matrix adapters**: `haversine` (offline), `openrouteservice` (online; optional key). Pluggable design.
- 🗺️ **Frontend**: Waypoint editing, fleet configuration, benchmarking, ETA overlays, traffic gradient, animated trips.
- 🧪 **Testing**: `pytest` for backend; `vitest`/`playwright` for frontend.
- 🧩 **Datasets**: Solomon TXT, VRP‑Set‑XML100, CSV/GeoJSON helpers.
- 🧱 **Modular**: Clean registries for adapters & solvers; easy to extend.

---

## Repository Layout

```text
.
├── backend/                 # FastAPI service (VRP core)
│   ├── api/                 # Routers: /distance-matrix, /solver, /benchmarks, ...
│   ├── core/                # plugin loading, registries, logic
│   ├── services/            # adapters & solvers + metrics
│   ├── models/              # Pydantic schemas
│   ├── data/                # (optional) datasets root
│   └── doc/                 # deep backend docs
├── frontend/                # Next.js application (map UI)
│   ├── src/                 # components, hooks, utils, pages/routes
│   └── public/              # static assets
├── tests/                   # cross‑cutting E2E or shared fixtures (optional)
├── README.md                # ← you are here
└── ...                      # tool configs (.env, lint, etc.)
```

---

## Quickstart (Local Dev)

### Prerequisites
- **Python 3.10+**
- **Node 18+ / pnpm or npm**
- (Optional) **Docker** for containerized runs
- Map token (optional): `NEXT_PUBLIC_MAPBOX_TOKEN` (frontend features)
- ORS key (optional): `ORS_API_KEY` (backend OpenRouteService adapter)

### 1) Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# optional, if you use the ORS adapter:
export ORS_API_KEY="your-ors-key"

uvicorn main:app --reload            # http://127.0.0.1:8000/docs
```

### 2) Frontend (Next.js)
```bash
cd frontend
npm i
# copy your env and set the API base if frontend and backend are on different hosts/ports
# e.g., echo "NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000" >> .env.local
#       echo "NEXT_PUBLIC_MAPBOX_TOKEN=..." >> .env.local
npm run dev                           # http://127.0.0.1:3000
```

> Frontend expects the API at `NEXT_PUBLIC_API_BASE` (default `/` if proxied).

---

## Configuration

### Backend env
- `DATA_DIR` — datasets root (default: `./backend/data`)
- `ORS_API_KEY` — OpenRouteService adapter access (optional)
- `GOOGLE_MAPS_API_KEY` — only if Google adapter is enabled (optional)

### Frontend env
- `NEXT_PUBLIC_API_BASE` — base URL for the backend (e.g., `http://127.0.0.1:8000`)
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Mapbox token for map/optimizer routing (optional but recommended)

---

## Dev Scripts (suggested)

Add a simple helper at repo root (optional) using `make`:

```makefile
dev:
\t( cd backend && . .venv/bin/activate 2>/dev/null || true && uvicorn main:app --reload ) & \\\n\t( cd frontend && npm run dev )

test:
\t( cd backend && pytest -q ) && ( cd frontend && npm run test )

build:
\t( cd frontend && npm run build )
```

---

## Testing

**Backend**
```bash
cd backend
pytest -q
```

**Frontend**
```bash
cd frontend
npm run test
# e2e (optional)
npm run test:e2e
```

---

## Roadmap (selected)

- Unified “Search” bar with dual providers (forward & reverse geocoding) that adds waypoints.
- Data Manager: multi‑format import (auto‑detect), de‑dupe, tagging, export controls.
- VRP Factors: auto‑balance presets, complexity & region detection, solver auto‑suggest.
- Real‑world datasets: place + bbox harvesting; save & export.
- Gap analysis & benchmark comparison UX polish.

See **Issues** for the living plan.

---

## Contributing

See **[backend/doc/contributing.md](backend/doc/contributing.md)** for style and PR guidelines.  

---

## License

MIT

---

## Acknowledgements

- Google OR‑Tools, Pyomo, CBC/GLPK, VROOM team
- OpenRouteService & Mapbox for routing/matrix APIs
- Deck.gl / MapLibre / Mapbox GL communities