# api/capabilities_routes.py
from fastapi import APIRouter
from core.capabilities import filter_registered
from services.solver_factory import list_solvers
from core.adapter_factory_registry import AdapterFactoryRegistry

router = APIRouter(prefix="/capabilities", tags=["capabilities"])

@router.get("", summary="List solver/adapter capabilities")
def get_capabilities():
    registered_solvers = list_solvers()
    registered_adapters = AdapterFactoryRegistry.list_adapters()
    data = filter_registered(registered_solvers, registered_adapters)
    # Consistent envelope like other routes
    return {"status": "success", "data": data}
