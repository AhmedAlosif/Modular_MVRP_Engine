# core/register_adapters.py
from __future__ import annotations

import os
from typing import Any

from core.adapter_factory_registry import AdapterFactoryRegistry

# Adapters
from adapters.offline.haversine_adapter import HaversineAdapter
from adapters.online.openrouteservice_adapter import ORSDistanceMatrixAdapter
from adapters.online.google_matrix_adapter import GoogleMatrixAdapter
from adapters.online.google_routes_adapter import GoogleRoutesAdapter  # if present

_registered = False


def _load_settings() -> Any | None:
    """
    Try several config.py shapes in this order:
      1) get_settings() -> instance
      2) settings       -> instance
      3) Settings()     -> instance
      4) Settings       -> object with attributes (legacy static)
    Return None if none are available.
    """
    try:
        from config import get_settings  # type: ignore
        return get_settings()
    except Exception:
        pass
    try:
        from config import settings  # type: ignore
        return settings
    except Exception:
        pass
    try:
        from config import Settings  # type: ignore
        try:
            # pydantic BaseSettings subclass or similar (callable)
            return Settings()  # type: ignore[call-arg]
        except Exception:
            # legacy static container with class attributes
            return Settings
    except Exception:
        return None


def _get_key(settings_obj: Any, attr_name: str, *env_fallbacks: str) -> str | None:
    """
    Pull API key from settings object if present; otherwise from env.
    Supports multiple env names as fallbacks.
    """
    if settings_obj is not None and hasattr(settings_obj, attr_name):
        val = getattr(settings_obj, attr_name)
        if val:
            return str(val)

    for env in env_fallbacks:
        val = os.getenv(env)
        if val:
            return val

    return None


def register_adapters() -> None:
    global _registered
    if _registered:
        return

    settings_obj = _load_settings()

    # Always register offline adapter
    AdapterFactoryRegistry.register("haversine", lambda: HaversineAdapter())

    # Resolve API keys (support common alt env names too)
    ors_key = _get_key(settings_obj, "ORS_API_KEY", "ORS_API_KEY", "OPENROUTESERVICE_API_KEY")
    google_key = _get_key(settings_obj, "GOOGLE_API_KEY", "GOOGLE_API_KEY")
    google_routes_key = _get_key(settings_obj, "GOOGLE_ROUTES_API_KEY", "GOOGLE_ROUTES_API_KEY")

    if ors_key:
        AdapterFactoryRegistry.register(
            "openrouteservice",
            lambda k=ors_key: ORSDistanceMatrixAdapter(api_key=k),
        )

    if google_key:
        AdapterFactoryRegistry.register(
            "google",
            lambda k=google_key: GoogleMatrixAdapter(api_key=k),
        )

    if google_routes_key:
        AdapterFactoryRegistry.register(
            "google_routes",
            lambda k=google_routes_key: GoogleRoutesAdapter(api_key=k),
        )

    _registered = True
