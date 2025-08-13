# backend/config.py
from __future__ import annotations
from pathlib import Path
import os
from dotenv import load_dotenv

# Load exactly backend/.env (do NOT call load_dotenv() without a path)
ENV_FILE = Path(__file__).with_name(".env")
load_dotenv(ENV_FILE, override=False)

def get_data_dir() -> Path:
    # Fallback to backend/data when DATA_DIR is not set
    return Path(os.getenv("DATA_DIR", str(Path(__file__).with_name("data")))).resolve()

# Optional: a simple runtime override helper (handy in tests)
def set_data_dir(path: str | Path) -> Path:
    p = Path(path).resolve()
    os.environ["DATA_DIR"] = str(p)
    return p

def get_settings():
    return Settings


class Settings:
    DATA_DIR = "./backend/data"
    BENCHMARK_INCLUDE_FOLDERS = ["solomon", "vrp-set-xml100"]  # optional allow-list
    BENCHMARK_EXCLUDE_FOLDERS = [] 
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    ORS_API_KEY: str = os.getenv("ORS_API_KEY", "")
    USE_OFFLINE_MATRIX: bool = os.getenv("USE_OFFLINE_MATRIX", "false").lower() == "true"

settings = Settings