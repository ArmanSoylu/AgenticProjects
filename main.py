from agent.gemini_core import run_reAct_agent
from tools.agent_tools import api_tools
from core.logger import get_logger

logger = get_logger("Main")

if __name__ == "__main__":
    logger.info("System started working!")


    question = "What is the weather in Antalya?"

    print("\n-----------------------------------")
    print("Question:", question)
    answer = run_reAct_agent(question, tools=api_tools)
    print("Answer:\n", answer)
    print("-----------------------------------\n")

    logger.info("System completed working!.")
