from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from vrp.models import VRPRequest, VRPResponse
from vrp.solver import solve_vrp
from vrp.emissions import estimate_emissions

app = FastAPI()

# CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Backend is live"}

@app.post("/solve", response_model=VRPResponse)
def solve(data: VRPRequest):
    solution = solve_vrp(data)
    emissions = estimate_emissions(solution)
    return {**solution, "co2": emissions}