from fastapi import FastAPI, HTTPException,UploadFile, File
from pydantic import BaseModel
from typing import List
import vrplib
import tempfile

app = FastAPI()

# -----------------------------
# Supported dataset listing
# -----------------------------
@app.get("/vrplib/datasets")
def list_datasets():
    return {
        "datasets": list(vrplib.list_instances().keys())  # ['A-n32-k5.vrp', ...]
    }

# -----------------------------
# Load specific VRP instance
# -----------------------------
@app.get("/vrplib/load")
def load_instance(name: str):
    try:
        instance = vrplib.read_instance(name)
        return {
            "name": name,
            "metadata": instance.get("metadata", {}),
            "coordinates": instance["coordinates"],
            "demands": instance["demands"],
            "capacity": instance["capacity"],
            "depot": instance["depot"]
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Instance '{name}' not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------
# Upload VRP instance
# -----------------------------

@app.post("/vrplib/upload")
def upload_vrp_file(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    try:
        instance = vrplib.read_instance(tmp_path)
        return instance
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
