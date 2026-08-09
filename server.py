import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from duckduckgo_search import DDGS
import uvicorn

from mcp.server.fastmcp import FastMCP

from agent.gemini_core import run_reAct_agent, run_agent_turn
from agent.registry import public_agents, get_agent
from agent.sessions import sessions
from tools.agent_tools import api_tools, search_vector_database
from core.config import MODELS, MODEL_BY_ID, DEFAULT_MODEL_ID, FRONTEND_DIR
from core.logger import get_logger

logger = get_logger("FastAPIServer")
app = FastAPI(
    title="GeminiAPIServer",
    description="An interface to interact with an agentic sytstem",
)

# The workspace UI is served from this same app, so same-origin calls need no
# CORS at all. This is only here for running the frontend from another port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

mcp = FastMCP("gemini-agent-server")


@mcp.tool()
async def search_web(query: str) -> str:
    """It uses DuckDuckGo to perform real-time internet searches.
    Use this tool for up-to-date news, weather, or specific information from the internet requested by the user."""
    logger.info(f"MCP üzerinden dışarıdan arama talebi geldi: {query}")
    try:
        results = DDGS().text(query, max_results=3)
        return str(results)
    except Exception as e:
        return f"An error has occured: {str(e)}"


@mcp.tool()
async def search_database(query: str) -> str:
    """
    Searches the system's local ChromaDB vector database (memory).
    Use this tool when querying past conversations, saved files, or system logs.
    """
    logger.info(f"MCP üzerinden veritabanı sorgusu geldi: {query}")
    return search_vector_database(query)


# ── API ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str


class AgentChatRequest(BaseModel):
    message: str
    agent: str = "research"
    model: str = DEFAULT_MODEL_ID
    session_id: str | None = None


@app.get("/api/agents")
async def list_agents():
    """Feeds the sidebar, the dashboard cards and the routing in the UI."""
    return {"agents": public_agents(), "models": MODELS, "default_model": DEFAULT_MODEL_ID}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/chat")
def chat(request: AgentChatRequest):
    """One turn of a conversation with a live agent."""
    agent = get_agent(request.agent)
    if agent is None:
        raise HTTPException(status_code=404, detail=f"Unknown agent: {request.agent}")
    if agent["status"] != "live" or not agent["callables"]:
        raise HTTPException(
            status_code=409, detail=f"Agent '{request.agent}' is still in development."
        )

    model = MODEL_BY_ID.get(request.model)
    if model is not None and not model["free_tier"]:
        raise HTTPException(
            status_code=402,
            detail=(
                f"{model['name']} needs a Gemini plan with billing enabled. "
                f"Pick Flash-Lite or Flash."
            ),
        )

    session_id = request.session_id or str(uuid.uuid4())
    logger.info(f"A new query arrived to API {request.message}")

    result = run_agent_turn(
        request.message,
        tools=agent["callables"],
        model_id=request.model,
        history=sessions.get(session_id, agent["id"]),
    )

    if result["ok"]:
        sessions.set(session_id, agent["id"], result["history"])
        logger.info("The API is sending the answer.")
    else:
        # A failed turn would poison the history with a half-finished exchange.
        raise HTTPException(status_code=502, detail=result["reply"])

    return {
        "reply": result["reply"],
        "tools": result["tools"],
        "model": result["model"],
        "session_id": session_id,
    }


@app.post("/api/chat/reset")
async def reset_chat(request: AgentChatRequest):
    if request.session_id:
        sessions.reset(request.session_id, request.agent)
    return {"status": "ok"}


@app.post("/chat")
def chat_with_agent(request: ChatRequest):
    """Legacy single-shot endpoint, still used by the Streamlit ui.py."""
    logger.info(f"A new query arrived to API {request.query}")
    try:
        answer = run_reAct_agent(request.query, tools=api_tools)
        logger.info("The API is sending the answer.")
        return {"response": answer}
    except Exception as e:
        logger.error(f"An  API error occured: {e}")
        raise HTTPException(status_code=500, detail="An error occured while Agent was working.")


# ── MCP (SSE) ──────────────────────────────────────────────────────────────
# Exposes search_web / search_database to any MCP client at /mcp/sse.
app.mount("/mcp", mcp.sse_app())


# ── Workspace UI ───────────────────────────────────────────────────────────
# Mounted last so it never shadows an /api route.
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    async def index():
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    logger.warning(f"Frontend directory not found at {FRONTEND_DIR}")


if __name__ == "__main__":
    logger.info("Starting uvicorn server please go to http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
