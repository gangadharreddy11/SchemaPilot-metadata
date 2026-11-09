import os
import sys
from pathlib import Path

# Ensure backend directory and app are in python search path
BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent

for p in (BACKEND_DIR, ROOT_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

try:
    from app.main import *  # noqa: F401, F403
    from app.main import app
except ImportError:
    from backend.app.main import *  # noqa: F401, F403
    from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

