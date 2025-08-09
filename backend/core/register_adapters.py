from core.adapter_factory_registry import AdapterFactoryRegistry
from adapters.online.google_matrix_adapter import GoogleMatrixAdapter
from adapters.online.openrouteservice_adapter import ORSDistanceMatrixAdapter
from adapters.offline.haversine_adapter import HaversineAdapter
from services.solvers.ortools_solver import OrToolsSolver
from config import Settings
from services.solver_factory import register_solver
print(">>> register_adapters.py loaded")

_registered = False
def register_adapters():
    global _registered
    if _registered:
        return  # prevent double-registration
    _registered = True

    print(">>> Registering ORS adapter")
    AdapterFactoryRegistry.register("google", lambda: GoogleMatrixAdapter(api_key=Settings.GOOGLE_API_KEY))
    AdapterFactoryRegistry.register("openrouteservice", lambda: ORSDistanceMatrixAdapter(api_key=Settings.ORS_API_KEY))
    AdapterFactoryRegistry.register("haversine", lambda: HaversineAdapter())
    AdapterFactoryRegistry.register("ortools", lambda: OrToolsSolver())
    register_solver("ortools", OrToolsSolver)