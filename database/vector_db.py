import chromadb
from core.config import DB_PATH
from core.logger import get_logger

logger = get_logger("VectorDB")

try:
    logger.info(f"Starting up ChromaDB:{DB_PATH} ")
    chroma_client = chromadb.PersistentClient(path=DB_PATH)
    collection = chroma_client.get_or_create_collection(name="agentic_databank")
    logger.info("successfully connected to ChromaDB")
except Exception as e:
    logger.error(f"Error connecting to ChromaDB: {e}")