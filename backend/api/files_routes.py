# api/files_routes.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
from typing import Optional, Dict, Any

from file_handler.dataset_indexer import (
    get_data_dir, DEFAULT_EXTS, list_datasets, list_files, find_pair, ensure_index
)
from file_handler.file_factory import get_loader_for_filename
from file_handler.vrplib_writer import write_vrplib

router = APIRouter(prefix="/files", tags=["files"])
root = get_data_dir

def _safe_join(dataset: str, rel_path: str) -> Path:
    base = Path(root).resolve()
    target = (base / dataset / rel_path).resolve()
    if base not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid path")
    return target

@router.get("/datasets")
def datasets():
    return {"datasets": list_datasets()}

@router.get("/list")
def files(
    dataset: str = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=2000),
    q: Optional[str] = None,
    kind: Optional[str] = Query(None, description="'instances' | 'solutions'"),
    exts: Optional[str] = Query(None, description="Comma-separated: .vrp,.xml,.sol,..."),
    refresh: bool = False,
):
    ext_list = [e.strip() for e in exts.split(",")] if exts else list(DEFAULT_EXTS)
    return list_files(dataset=dataset, page=page, per_page=per_page, exts=ext_list, q=q, kind=kind, force_refresh=refresh)

@router.get("/find")
def find(dataset: str, name: str):
    ensure_index(dataset)
    res = find_pair(dataset, name)
    if not res or (not res["instance"] and not res["solution"]):
        raise HTTPException(status_code=404, detail="Not found")
    return res

@router.post("/parse")
def parse_file(dataset: str, rel_path: str):
    path = _safe_join(dataset, rel_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    loader = get_loader_for_filename(path)
    if not loader:
        raise HTTPException(status_code=400, detail=f"No loader for {path.suffix}")
    try:
        parsed = loader(path)  # each loader returns a dict or a small dataclass; normalize on return
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse failed: {e}")
    # Don’t leak absolute paths
    return {"dataset": dataset, "path": rel_path, "parsed": parsed}

@router.post("/write/vrplib")
def write_vrp(
    dataset: str,
    out_name: str,
    waypoints: list[Dict[str, Any]],
    fleet: Dict[str, Any],
):
    # Save into the dataset’s folder (or a dedicated export folder)
    target = _safe_join(dataset, out_name if out_name.endswith(".vrp") else f"{out_name}.vrp")
    try:
        from models.waypoints import Waypoint
        from models.fleet import Fleet
        wps = [Waypoint(**wp) for wp in waypoints]
        fl = Fleet(**fleet) if "vehicles" in fleet else Fleet(vehicles=fleet)  # accept both shapes
        write_vrplib(target, wps, fl, name=target.stem)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Write failed: {e}")
    # Return a relative path the frontend can download via a static route you control
    return {"status": "success", "file": f"{dataset}/{target.name}"}
