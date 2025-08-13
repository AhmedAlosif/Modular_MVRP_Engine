# file_handler/file_factory.py
from __future__ import annotations
from pathlib import Path
from typing import Callable, Dict, Any
from .vrplib_lib_wrapper import load_with_vrplib, VRPLIB_AVAILABLE
from .xml_loader import VRPSetXMLLoader
from .solomon_loader import load_solomon_txt  # new small loader (below)
from .vrplib_loader import load_vrplib as load_cvrplib_like  # your simple CVRPLIB-ish parser

_xml = VRPSetXMLLoader()

def _vrp_loader(path: str, **kw: Any):
    if VRPLIB_AVAILABLE:
        try:
            return load_with_vrplib(path, **kw)
        except Exception:
            pass
    text = Path(path).read_text(encoding="utf-8", errors="ignore").lstrip()
    if text.startswith("<"):
        return _xml.load_file(path, compute_matrix=kw.get("compute_matrix", True))
    if "VEHICLE" in text and "CUSTOMER" in text:
        return load_solomon_txt(path, **kw)
    return load_cvrplib_like(path, **kw)

def _xml_loader(path: str, **kw: Any):
    return _xml.load_file(path, compute_matrix=kw.get("compute_matrix", True))

def _txt_loader(path: str, **kw):
    try:
        with open(path, "r", errors="ignore") as f:
            head = f.read(500)
        head_upper = head.upper()
        if "VEHICLE" in head_upper and ("CUSTOMER" in head_upper or "CUST" in head_upper):
            return load_solomon_txt(path, **kw)
        # ... other detectors ...
    except Exception as e:
        raise
    return load_cvrplib_like(path, **kw)

_LOADER_REGISTRY: Dict[str, Callable] = {
    ".vrp": _vrp_loader,
    ".xml": _xml_loader,
    ".txt": _txt_loader,
}

def list_supported_extensions():
    return sorted(_LOADER_REGISTRY.keys())

def get_loader_for_filename(filename: str):
    ext = Path(filename).suffix.lower()
    if ext in _LOADER_REGISTRY:
        return _LOADER_REGISTRY[ext]
    raise ValueError(f"No loader for '{ext}'. Supported: {list_supported_extensions()}")
