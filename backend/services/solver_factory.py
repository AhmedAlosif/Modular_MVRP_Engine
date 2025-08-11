from __future__ import annotations
from typing import Callable, Dict, Union, Type
from core.interfaces import VRPSolver

# supports either classes (to be instantiated) or factories returning instances
_solver_registry: Dict[str, Union[Type[VRPSolver], Callable[[], VRPSolver]]] = {}

def register_solver(name: str, ctor: Union[Type[VRPSolver], Callable[[], VRPSolver]]) -> None:
    key = name.lower()
    if key in _solver_registry:
        raise ValueError(f"Solver '{name}' is already registered.")
    _solver_registry[key] = ctor

def get_solver(name: str) -> VRPSolver:
    key = name.lower()
    if key not in _solver_registry:
        raise ValueError(f"Solver '{name}' is not registered.")
    ctor = _solver_registry[key]
    return ctor() if callable(ctor) else ctor()  # type: ignore

def list_solvers() -> Dict[str, str]:
    return {k: (v.__name__ if hasattr(v, "__name__") else str(v)) for k, v in _solver_registry.items()}
