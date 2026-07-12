from google import genai
from google.genai import types
from core.config import GEMINI_API_KEY
from core.logger import get_logger


logger = get_logger("GeminiAgent")

system_prompt = """
You are an advanced AI assistant with access to several tools.
Think logically step-by-step to answer the user's questions.
If you need information you don't have, use the appropriate tool.
Once you have all the information you need, provide a clear, helpful final answer.
"""


def run_reAct_agent(user_query: str, tools: list):
    try:
        logger.info("Starting Gemini Agent...")
        client = genai.Client(api_key=GEMINI_API_KEY)

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=tools,
            temperature=0.1
        )

        chat = client.chats.create(model="gemini-3.5-flash", config=config)

        logger.info(f"User query: {user_query}")
        logger.info("Agent is thinking and starting up the tools")

        response = chat.send_message(user_query)
        final_answer  = response.text

        logger.info("Agent has created and answered successfully")
        return final_answer

    except Exception as e:
        logger.error(f"An error occured while agent was working: {e}")
        return "There has been an error."
