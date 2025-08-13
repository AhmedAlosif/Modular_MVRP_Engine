# backend/tests/conftest.py
import os, sys, pytest
from shutil import which
from fastapi.testclient import TestClient

# Make /Project/backend importable as top-level
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Now 'api', 'core', etc. resolve because backend/ is on sys.path
from main import app  # <-- import main from inside backend/

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

def solver_available(name: str) -> bool:
    return which(name) is not None

@pytest.fixture(scope="session")
def has_ors():
    return bool(os.getenv("ORS_API_KEY"))

@pytest.fixture(scope="session")
def has_cbc():
    return solver_available("cbc")

#@pytest.mark.slow
#def test_real_dataset_listing(client):
#    r = client.get("/benchmarks")
#    assert r.status_code == 200
