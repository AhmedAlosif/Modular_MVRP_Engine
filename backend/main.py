from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.adapters_routes import router as api_router
from api.solver_routes import router as solver_router
from core.load_plugins import load_plugins
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_plugins()  # <-- your plugin loading logic
    print(">>> After load_plugins")
    yield

app = FastAPI(title="VRP Adapter Backend", lifespan=lifespan)

# CORS (adjust for your frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(">>> main.py startup")

# Register API routes
app.include_router(api_router, prefix="/distance-matrix")
app.include_router(solver_router, prefix="/solver")
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)