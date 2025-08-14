VRP Backend (FastAPI)
A modular backend for Vehicle Routing Problems (VRP): distance-matrix adapters, multiple solvers (OR-Tools, Pyomo, VROOM), dataset loaders (Solomon, VRP-Set-XML100), and handy endpoints for benchmarks and emissions.

TL;DR
# 1) Install
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# 2) (optional) set keys for online adapters
export ORS_API_KEY="<your-openrouteservice-key>"
# 3) Run the API
uvicorn main:app --reload
# 4)Open: http://127.0.0.1:8000/docs

Features
Adapters: haversine (offline), openrouteservice (online), google (if configured).
Solvers: ortools (CVRP/VRPTW/PD), pyomo (CVRPTW via CBC), vroom (index/coord mode with graceful fallback).
Datasets: Solomon .txt, VRP-Set-XML100 .xml (robust parsing), plus CSV/GeoJSON convenience loaders.
Benchmarks: browse, search, load instances; auto pair instance/solution when available.
Emissions: simple CO₂e estimation hooks & route enrichment.
Plugin system: one place to register new adapters/solvers.
Good tests: pytest suite with optional heavier benchmarks.

Architecture at a glance
Module diagram
flowchart LR
    subgraph API
      A1[adapters_routes] --> Core
      A2[solver_routes] --> Core
      A3[vrplib_routes] --> Files
      A4[files_routes] --> Files
      A5[emissions_routes] --> Core
      A6[status] --> Core
    end

    subgraph Core
      C1[load_plugins]
      C2[adapter_factory_registry]
      C3[solver_factory]
      C4[logic: constraints/costs]
      C5[emissions]
      C6[services/metrics]
    end

    subgraph Services
      S1[adapters/*]
      S2[solvers/ortools|pyomo|vroom]
    end

    subgraph Files
      F1[file_handler: solomon/xml/vrplib/...]
      F2[solution_loader]
      F3[index_cache]
    end

    M[models/*] --> API
    M --> Core
    M --> Services
    M --> Files

    API --> C1
    C1 --> C2 & C3
    C2 --> S1
    C3 --> S2
    API --> S1 & S2
    API --> F1 & F2 & F3
    S2 --> C6
    C6 --> API

Request flow
sequenceDiagram
  participant Client
  participant API as FastAPI (/solver)
  participant Core as load_plugins/registries
  participant Solver as OrTools/Pyomo/VROOM
  participant Metrics as services/metrics
  participant Files as loaders (optional)

  Client->>API: POST /solver (SolveRequest)
  API->>Core: get_solver(req.solver)
  Core-->>API: solver instance
  API->>Solver: solve(fleet, matrix, TW, demands, ...)
  Solver-->>API: Routes
  API->>Metrics: enrich_routes_with_metrics(Routes, Matrix, Fleet)
  Metrics-->>API: Routes (distance/duration/emissions filled)
  API-->>Client: 200 {status, data}

Running
Requirements
Python 3.10+ recommended.
OR-Tools: installed via pip (already in requirements).
Pyomo + CBC:
    pyomo (pip) + CBC solver on PATH (or switch to GLPK if you prefer).
VROOM (optional):
    If pyvroom is not available, backend falls back to a nearest-neighbor heuristic automatically.

Environment variables
DATA_DIR – root for datasets (default: ./backend/data).
ORS_API_KEY – for OpenRouteService adapter.
(Optional) GOOGLE_MAPS_API_KEY – if the Google adapter is enabled.

Endpoints (overview)
POST /distance-matrix — compute a matrix via adapter (haversine, openrouteservice, …).
POST /solver — solve a VRP via solver (ortools, pyomo, vroom).
GET /benchmarks — list available datasets.
GET /benchmarks/files — list/search dataset files.
GET /benchmarks/find — find instance/solution pair by base name.
GET /benchmarks/load — load and parse a benchmark instance to JSON.
POST /emissions/estimate — (if exposed) simple emissions estimator.
GET /status — basic health/readiness.

Open Swagger at /docs for full schemas.

API examples
1) Distance matrix (offline haversine)
curl -X POST http://127.0.0.1:8000/distance-matrix \
  -H "content-type: application/json" \
  -d '{
    "adapter": "haversine",
    "origins": [{"lat":37.7749,"lon":-122.4194},{"lat":34.0522,"lon":-118.2437}],
    "destinations": [{"lat":36.1699,"lon":-115.1398}],
    "mode": "driving"
}'

2) Solve (OR-Tools, index mode)
curl -X POST http://127.0.0.1:8000/solver \
  -H "content-type: application/json" \
  -d '{
    "solver": "ortools",
    "matrix": { "distances": [[0,5,4],[5,0,3],[4,3,0]] },
    "fleet": [{ "id":"veh-1", "capacity":[999], "start":0, "end":0 }],
    "depot_index": 0,
    "demands": [0,3,4],
    "node_service_times": [0,0,0]
  }'

3) Solve (VROOM, coordinate mode)
curl -X POST http://127.0.0.1:8000/solver \
  -H "content-type: application/json" \
  -d '{
    "solver": "vroom",
    "matrix": { "distances": [[0,5,4],[5,0,3],[4,3,0]] },
    "coordinates": [[-122.4194,37.7749],[-118.2437,34.0522],[-115.1398,36.1699]],
    "fleet": [{ "id":"veh-1", "capacity":[999], "start":0, "end":0 }],
    "depot_index": 0
  }'

4) Load a benchmark instance
curl "http://127.0.0.1:8000/benchmarks/load?dataset=solomon&name=C101"

Datasets & Benchmarks
By default the indexer scans DATA_DIR for known folders (e.g., solomon, Vrp-Set-XML100). Typical layout:
backend/data/
  solomon/
    Solomon-100/
      c101.txt
      r101.txt
      ...
  Vrp-Set-XML100/
    XML100_3375_23.xml
    ...

Useful routes:
GET /benchmarks → list datasets.
GET /benchmarks/files?dataset=solomon&limit=50&offset=0
GET /benchmarks/find?dataset=Vrp-Set-XML100&name=XML100_3375_23
GET /benchmarks/load?dataset=solomon&name=C101

Development
Project structure
api/                 # FastAPI routers (adapters, solver, files, benchmarks, emissions, status)
core/                # plugin loading, registries, logic helpers, emissions
models/              # pydantic models (matrix, fleet/vehicle, solver I/O, waypoints, emissions)
services/
  adapters/          # distance-matrix adapters (haversine, openrouteservice, ...)
  solvers/           # ortools / pyomo / vroom
  file_handler/      # loaders: solomon, vrp-set-xml, vrplib, csv, geojson
  metrics.py         # post-solve enrichment (distance/duration/emissions)

Plugin system
Adapters register in core/register_adapters.py via AdapterFactoryRegistry.
Solvers register in services/solver_factory.register_solvers().
main.py calls load_plugins() in the FastAPI lifespan so everything is available at startup.

Testing
# run all tests
pytest -q

# focus on solvers
pytest backend/tests/test_solvers_ortools.py -q

# heavier benchmark checks
RUN_PYOMO_BENCH=1 pytest -k solomon_instance_vs_solution_pyomo -q
# (VROOM benchmark may run by default; depends on your test markers)

Adding a solver or adapter

New adapter:
1) Implement DistanceMatrixAdapter subclass.
2) Register it in core/register_adapters.py.
3) Hit /distance-matrix with "adapter": "your-adapter-name".

New solver:

1) Implement VRPSolver.solve(...) (mirror the OR-Tools signature).
2) Add to services/solver_factory.register_solvers().
3) POST /solver with "solver": "your-solver-name".

Emissions
Core helpers in core/emissions.py.
Data model in models/emissions.py.
After solving, services/metrics.enrich_routes_with_metrics can attach total distance/duration/emissions to each route.

Troubleshooting
“Solver 'X' is not registered.”
    Ensure load_plugins() runs (it’s called via FastAPI lifespan in main.py). If using a custom TestClient, import the same app.

Solomon/VRP XML parsing fails
    Confirm the dataset path under DATA_DIR and file naming (e.g., c101.txt). The loaders are tolerant but need expected sections.

Pyomo “infeasible”
    Time windows or capacities may be too tight. The Pyomo model is conservative; try loosening windows or increase seconds in solver options.

VROOM quirks
    Some pyvroom builds require coordinates (location) instead of indices (location_index). The backend probes the signature and falls back to a NN heuristic if needed.

Contributing

Keep modules small and tested.
Prefer adding thin helpers to core/logic/constraints.py / core/logic/cost_functions.py for shared logic.
Add focused pytest tests alongside new loaders/solvers.
Document new endpoints in this README and ensure /docs still renders cleanly.