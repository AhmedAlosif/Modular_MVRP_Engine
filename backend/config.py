import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

class Settings:
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    ORS_API_KEY: str = os.getenv("ORS_API_KEY", "")
    USE_OFFLINE_MATRIX: bool = os.getenv("USE_OFFLINE_MATRIX", "false").lower() == "true"

settings = Settings()
