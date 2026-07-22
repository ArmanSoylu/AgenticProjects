from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from duckduckgo_search import DDGS
import uvicorn


from mcp.server import Server
from mcp.server.sse import SseServerTransport
import mcp.types as types

from agent.gemini_core import run_reAct_agent
from tools.agent_tools import api_tools
from core.logger import get_logger

logger = get_logger("FastAPIServer")
app = FastAPI(
    title="GeminiAPIServer",
    description="An interface to interact with an agentic sytstem",


)
mcp_server = Server("gemini-agent-server")
sse_transport = SseServerTransport("/messages")

@mcp_server.tool()
async def search_web(query: str) -> str:
    """It uses DuckDuckGo to perform real-time internet searches.
    Use this tool for up-to-date news, weather, or specific information from the internet requested by the user."""
    logger.info(f"MCP üzerinden dışarıdan arama talebi geldi: {query}")
    try:
        results = DDGS().text(query, max_results=3)
        return str(results)
    except Exception as e:
        return f"An error has occured: {str(e)}"

@mcp_server.tool()
async def search_database(query: str) -> str:
    """
    Searches the system's local ChromaDB vector database (memory).
    Use this tool when querying past conversations, saved files, or system logs.
    """
    logger.info(f"MCP üzerinden veritabanı sorgusu geldi: {query}")


    return f"'{query}' The data have been read.MOCK"

#waiting query from outside the system
class ChatRequest(BaseModel):
    query: str

@app.post("/chat")
async def chat_with_agent(request: ChatRequest):
    logger.info(f"A new query arrived to API {request.query}")
    try:
        answer = run_reAct_agent(request.query, tools=api_tools)

        logger.info(f"The API is sending the answer.")
        return {"response": answer}

    except Exception as e:
        logger.error(f"An  API error occured: {e}")
        #error 500 server error has being send to the user
        raise HTTPException(status_code=500, detail="An error occured while Agent was working.")

@app.get("/sse")
async def sse_endpoint(request: Request):
    async with sse_transport.connect_sse(
        request.scope,request.receive,request._send
    ) as (read_stream, write_stream):
        await mcp_server.run(
            read_stream,
            write_stream,
            mcp_server.create_initialization_options()
        )

@app.post("/messages")
async def message_endpoint(request: Request):
    await sse_transport.handle_post_message(
        request.scope,request.receive,request._send
    )





if __name__ == "__main__":
    logger.info("Starting uvicorn server please go to http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)