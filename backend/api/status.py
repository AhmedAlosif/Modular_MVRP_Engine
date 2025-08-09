def success_response(message: str = "Success", data: dict | None = None):
    return {
        "status": "success",
        "message": message,
        "data": data or {}
    }

def error_response(message: str, details: str = ""):
    return {
        "status": "error",
        "message": message,
        "details": details
    }