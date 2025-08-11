from __future__ import annotations
from core.adapter_factory_registry import AdapterFactoryRegistry
from config import Settings
# --- Matrix adapters ---
from adapters.offline.haversine_adapter import HaversineAdapter
from adapters.online.openrouteservice_adapter import ORSDistanceMatrixAdapter
from adapters.online.google_matrix_adapter import GoogleMatrixAdapter
from adapters.online.google_routes_adapter import GoogleRoutesAdapter
# --- Solvers ---
from services.solver_factory import register_solver
from services.solvers.ortools_solver import OrToolsSolver
from services.solvers.vroom_solver import VroomSolver
from services.solvers.pyomo_solver import PyomoSolver

_registered = False
def register_adapters() -> None:
    global _registered
    if _registered:
        return
    _registered = True

    # Distance-matrix adapters ONLY in AdapterFactoryRegistry
    AdapterFactoryRegistry.register("haversine", lambda: HaversineAdapter())

    if Settings.ORS_API_KEY:
        AdapterFactoryRegistry.register("openrouteservice", lambda: ORSDistanceMatrixAdapter(api_key=Settings.ORS_API_KEY))

    if Settings.GOOGLE_API_KEY:
        AdapterFactoryRegistry.register("google", lambda: GoogleMatrixAdapter(api_key=Settings.GOOGLE_API_KEY))

    if Settings.GOOGLE_API_KEY:
        AdapterFactoryRegistry.register("google_routes", lambda: GoogleRoutesAdapter(api_key=Settings.GOOGLE_ROUTES_API_KEY))

    # Register solvers via solver_factory (NOT the adapter registry)
    register_solver("ortools", OrToolsSolver)
    register_solver("vroom", VroomSolver)
    register_solver("pyomo", PyomoSolver)
