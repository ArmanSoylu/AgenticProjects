from google import genai
from google.genai import types

from core.config import GEMINI_API_KEY, DEFAULT_MODEL_ID, resolve_model
from core.logger import get_logger


logger = get_logger("GeminiAgent")

system_prompt = """
You are an advanced AI assistant with access to several tools.
Think logically step-by-step to answer the user's questions.
If you need information you don't have, use the appropriate tool.
Once you have all the information you need, provide a clear, helpful final answer.
"""


def _client():
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "gemini_api_key is not set. Put it in the .env file at the project root."
        )
    return genai.Client(api_key=GEMINI_API_KEY)


def _tool_trace(response) -> list:
    """Names of the tools the model actually called, in call order.

    The SDK runs function calling automatically, so the only record of what
    happened is the transcript it hands back on the response.
    """
    names = []
    for content in getattr(response, "automatic_function_calling_history", None) or []:
        for part in getattr(content, "parts", None) or []:
            call = getattr(part, "function_call", None)
            if call is not None and call.name and call.name not in names:
                names.append(call.name)
    return names


def run_agent_turn(user_query: str, tools: list, model_id: str = DEFAULT_MODEL_ID,
                   history: list | None = None) -> dict:
    """Runs one turn and reports what the agent did, not just what it said.

    ``history`` is the conversation so far as returned by a previous turn, which
    is what makes the chat multi-turn instead of five one-shot questions.
    Returns ``{"reply", "tools", "model", "history", "ok"}``.
    """
    gemini_model = resolve_model(model_id)

    try:
        logger.info(f"Starting Gemini Agent on {gemini_model}...")
        client = _client()

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=tools,
            temperature=0.1,
        )

        chat = client.chats.create(
            model=gemini_model,
            config=config,
            history=history or [],
        )

        logger.info(f"User query: {user_query}")
        logger.info("Agent is thinking and starting up the tools")

        response = chat.send_message(user_query)
        used_tools = _tool_trace(response)

        if used_tools:
            logger.info(f"Tools used: {' -> '.join(used_tools)}")
        logger.info("Agent has created and answered successfully")

        return {
            "reply": response.text,
            "tools": used_tools,
            "model": model_id,
            "history": chat.get_history(),
            "ok": True,
        }

    except Exception as e:
        logger.error(f"An error occured while agent was working: {e}")
        return {
            "reply": f"There has been an error: {e}",
            "tools": [],
            "model": model_id,
            "history": history or [],
            "ok": False,
        }


def run_reAct_agent(user_query: str, tools: list, model_id: str = DEFAULT_MODEL_ID) -> str:
    """Single-shot entry point kept for main.py and the legacy /chat endpoint."""
    return run_agent_turn(user_query, tools, model_id=model_id)["reply"]
