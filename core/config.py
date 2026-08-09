import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv():
    """Reads the .env file next to the project root into os.environ.

    Docker passes the key through docker-compose, but a local `python server.py`
    run has nothing to read it, so the agent would start without a key.
    Existing environment variables always win.
    """
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

GEMINI_API_KEY = os.environ.get("gemini_api_key")

# Inside Docker this is set to /app/agent_memory_db by docker-compose.
DB_PATH = os.environ.get("AGENT_DB_PATH", "C:/Agents/agent_memory_db")

# Where the static workspace UI lives.
FRONTEND_DIR = BASE_DIR / "frontend"

# UI model id -> real Gemini model. The picker in the chat header sends the
# left-hand id; everything below is what actually reaches the API.
MODELS = [
    {
        "id": "flash-lite",
        "name": "Flash-Lite",
        "gemini_model": os.environ.get("MODEL_FLASH_LITE", "gemini-3.5-flash-lite"),
        "latency": "~0.4s",
    },
    {
        "id": "flash",
        "name": "Flash",
        "gemini_model": os.environ.get("MODEL_FLASH", "gemini-3.5-flash"),
        "latency": "~1.2s",
    },
    {
        "id": "pro",
        "name": "Pro",
        "gemini_model": os.environ.get("MODEL_PRO", "gemini-pro-latest"),
        "latency": "~3.0s",
    },
]

DEFAULT_MODEL_ID = "flash-lite"

MODEL_BY_ID = {m["id"]: m for m in MODELS}


def resolve_model(model_id: str) -> str:
    """UI model id -> Gemini model name, falling back to the default."""
    entry = MODEL_BY_ID.get(model_id) or MODEL_BY_ID[DEFAULT_MODEL_ID]
    return entry["gemini_model"]
