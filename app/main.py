import sys
from pathlib import Path

# Add root and backend to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

for p in (ROOT_DIR, BACKEND_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from backend.app.main import app

__all__ = ["app"]
