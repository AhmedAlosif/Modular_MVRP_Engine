from fastapi import FastAPI, HTTPException

@app.post("/solve/vroom")
def solve_with_vroom(data: VRPRequest):
    try:
        vroom_payload = {
            "vehicles": [
                {
                    "id": v.id,
                    "start": [v.start.longitude, v.start.latitude],
                    "end": [v.end.longitude, v.end.latitude] if v.end else None
                }
                for v in data.vehicles
            ],
            "jobs": [
                {
                    "id": j.id,
                    "location": [j.location.longitude, j.location.latitude],
                    "service": j.service
                }
                for j in data.jobs
            ]
        }

        response = requests.post("http://localhost:3000", json=vroom_payload)
        response.raise_for_status()
        return response.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
