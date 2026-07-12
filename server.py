from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from agent.gemini_core import run_reAct_agent
from tools.agent_tools import api_tools
from core.logger import get_logger

logger = get_logger("FastAPIServer")
app = FastAPI(
    title="GeminiAPIServer",
    description="An interface to interact with an agentic sytstem",

)

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



if __name__ == "__main__":
    logger.info("Starting uvicorn server please go to http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)