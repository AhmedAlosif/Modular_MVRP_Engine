# Backend Implementation Roadmap (TASKS.md)

This document serves as a development checklist for implementing and maintaining the modular backend structure.

---

## ✅ Core Infrastructure

- [ ] Create `core/plugin_factory.py`
- [ ] Create `core/plugin_registry.py`
- [ ] Define abstract interfaces for plugins (solver, dataset, adapter, etc.)

---

## 🔌 Adapters

- [ ] Implement `ortools_adapter.py`
- [ ] Implement `vroom_adapter.py`
- [ ] Implement `up_jsprit_adapter.py` (optional)
- [✅] Add distance engine adapters (e.g., haversine, Google, OSRM)

---

## 🧠 Services

- [ ] Create `services/solver_service.py` (main entry point for solving logic)
- [ ] Create `services/matrix_service.py` (distance matrix generation)
- [ ] Create `services/file_service.py` (handle input files)
- [ ] Create `services/weight_tuner.py` (optional)

---

## 🧾 Schemas

- [ ] Define `SolveRequest` and `SolveResponse`
- [ ] Define `Waypoint`, `Vehicle`, `Fleet`, `MatrixRequest`, etc.
- [ ] Define error and status models

---

## 🌐 API Endpoints (FastAPI)

- [ ] `api/solve.py` – Solve a problem instance
- [ ] `api/upload.py` – Upload instance or dataset file
- [ ] `api/status.py` – Backend system/health status

---

## 🗂️ File Handling

- [ ] Implement `file_handler/geojson_loader.py`
- [ ] Implement `file_handler/csv_loader.py`
- [ ] Implement deduplication, error handling, and format detection

---

## 📊 Benchmark Datasets

- [ ] Implement `benchmark/vrplib_loader.py`
- [ ] Add `benchmark_registry.py` with metadata for each dataset
- [ ] Optional: Add support for Solomon or other legacy formats

---

## 🌍 Data Acquisition (Optional)

- [ ] Create `data_factory.py` to standardize API access
- [ ] Add commercial providers (Google, OpenRouteService)
- [ ] Add open-source providers (OSRM, GraphHopper)

---

## 🧮 Geo Helpers

- [ ] Implement `geo_helpers/region_detection.py`
- [ ] Implement `geo_helpers/complexity_traits.py`
- [ ] Add `geo_helpers/distance_utils.py`

---

## ⚙️ Config and Environment

- [ ] Add `.env` and load with `python-dotenv`
- [ ] Implement `config.py` to access environment variables

---

## ❤️ Health Check & Logging

- [ ] Implement `healthcheck.py`
- [ ] Add `/api/status` route to check each component's availability
- [ ] Log version info for OR-Tools, VROOM, etc.

---

## 🧪 Testing (pytest)

- [ ] Add unit tests for each adapter
- [ ] Add unit tests for services and file handlers
- [ ] Add integration test for `/solve` endpoint with dummy data

---

## 🧰 Dev Tools

- [ ] Add `mypy`, `ruff`, `black`, and `pytest` to dev dependencies
- [ ] Add pre-commit hooks (optional)

---

## 🏁 Final Integration

- [ ] Wire everything into working `/api/solve`
- [ ] Connect frontend to backend (FastAPI + REST)
- [ ] Finalize Dockerfile (if needed) and deployment steps

---