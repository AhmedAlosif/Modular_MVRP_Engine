from typing import Dict, Callable
from core.interfaces import VRPSolver

_solver_registry: Dict[str, Callable[[], VRPSolver]] = {}

def register_solver(name: str, constructor: Callable[[], VRPSolver]) -> None:
    if name in _solver_registry:
        raise ValueError(f"Solver '{name}' is already registered.")
    _solver_registry[name] = constructor

def get_solver(name: str) -> VRPSolver:
    if name not in _solver_registry:
        raise ValueError(f"Solver '{name}' is not registered.")
    return _solver_registry[name]()
