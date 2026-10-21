import sys
from pathlib import Path

# Add backend directory to sys.path so app module can be found
BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = BASE_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from mangum import Mangum
    from app.main import app

    handler = Mangum(app, lifespan="off")
except Exception as err:
    def handler(event, context):
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": f'{{"error": "Failed to initialize FastAPI handler", "detail": "{str(err)}"}}'
        }
