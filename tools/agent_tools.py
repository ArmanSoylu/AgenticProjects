import requests
import uuid
from simpleeval import simple_eval
from ddgs import DDGS

from core.logger import get_logger
from database.vector_db import collection



logger = get_logger("Tools")

def get_weather_withAPI(location: str) -> str:
    """
    Gets the current weather information for a specific city or location.
    Use this tool when the user asks about the weather.
    """



    try:
        #1.step Trying to get the geocoding
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
        geo_response = requests.get(geo_url).json()

        if "results"  not in geo_response:
            return "no information found for the city of {location}."

        lat = geo_response["results"][0]["latitude"]
        lon = geo_response["results"][0]["longitude"]

        #2.step Wİth coordinates find the weather
        weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        weather_response = requests.get(weather_url).json()

        current = weather_response["current_weather"]
        temperature = current["temperature"]
        wind_speed = current["windspeed"]


        return f"Current temperature in {location} is {temperature}°C. Wind speed is {wind_speed} km/h."

    except Exception as e:
        # just in case connections is established
        return f"API Error: {str(e)}"







def calculate(answer: str)-> str:
    """
    Evaluates a mathematical expression and returns the result.
    Use this tool for any math calculations (e.g., '5 + 5 * 2').
    """



    try:
        answer = answer.strip()
        result = simple_eval(answer)
        return f"Calculated answer: {result}"

    except Exception as e:
        return f"Calculation Error: {str(e)}"

def search_web(query: str)-> str:
    """
    Searches the internet for up-to-date information, news, or facts that the agent doesn't know.
    """


    try:
        results =  DDGS().text(query,max_results= 3 )
        if len(results)==0:
             return f"Search engine error: No results found for '{query}'"


        text = ""
        for result in results:
            title = result["title"]
            body = result["body"]
            text  += f"Title: {title}\nbody: {body}\n\n---\n\n"
        return text



    except Exception as e:
        return f"Seach engine error : {str(e)}"





def search_vector_database(query: str) -> str:
    """
    Searches the user's personal documents, past notes, memories, and general knowledge database.
    ALWAYS use this tool to find information about past events (like what the user ate), passwords,
    favorite items (consoles, games, food), or any saved free-text memory.
    """
    try:
        collec = collection.query(query_texts=[query],n_results=3)
        if len(collec["documents"][0]) > 0:
            found_chunks = collec["documents"][0]
            combined_context = "\n\n--- connecting context ---\n\n".join(found_chunks)
            return f"The resutls for the seach:\n{combined_context}."
        else:
            return "The searched term could not be found in the database."
    except Exception as e:
        return f"Error: {str(e)}"


def save_memory(memory_text: str) -> str:
    """
    Saves important user information, preferences, or memories to the database.
    Use this WHENEVER the user tells you something about themselves (e.g., name, age, likes, passwords) to remember for later.
    """
    try:
        # Anı için rastgele benzersiz bir ID oluşturuyoruz
        doc_id = str(uuid.uuid4())

        # Ajanın cümlesini ChromaDB'ye kaydediyoruz
        collection.add(
            documents=[memory_text],
            ids=[doc_id]
        )
        return f"Successfully saved to memory: '{memory_text}'"
    except Exception as e:
        return f"A problem occurred while saving: {str(e)}"




api_tools = [
    get_weather_withAPI,
    calculate,
    search_web,
    save_memory,
    search_vector_database
]


