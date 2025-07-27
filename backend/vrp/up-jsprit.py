from fastapi import FastAPI, HTTPException

@app.post("/solve/up-jsprit")
def solve_with_jsprit(data: VRPRequest):
    try:
        # Convert to jsprit-friendly format or just dump JSON
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode='w')
        json.dump(data.dict(), temp_file)
        temp_file.close()

        result = subprocess.run(
            ["java", "-jar", "up-jsprit.jar", temp_file.name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            raise Exception(result.stderr)

        return json.loads(result.stdout)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))