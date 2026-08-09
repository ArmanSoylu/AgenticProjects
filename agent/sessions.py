"""In-memory chat history, so a browser tab keeps its conversation.

Deliberately not persisted: the vector database is the agent's long-term
memory, this is only the short-term context of one open chat. Restarting the
server clears it.
"""

import threading
from collections import OrderedDict

from core.logger import get_logger

logger = get_logger("Sessions")

MAX_SESSIONS = 200
# One entry per message, so this is 30 user+agent exchanges.
MAX_HISTORY_ITEMS = 60


class SessionStore:
    def __init__(self):
        self._data = OrderedDict()
        self._lock = threading.Lock()

    @staticmethod
    def _key(session_id: str, agent_id: str) -> str:
        return f"{session_id}::{agent_id}"

    def get(self, session_id: str, agent_id: str) -> list:
        with self._lock:
            key = self._key(session_id, agent_id)
            history = self._data.get(key)
            if history is None:
                return []
            self._data.move_to_end(key)
            return list(history)

    def set(self, session_id: str, agent_id: str, history: list) -> None:
        with self._lock:
            key = self._key(session_id, agent_id)
            self._data[key] = list(history)[-MAX_HISTORY_ITEMS:]
            self._data.move_to_end(key)
            while len(self._data) > MAX_SESSIONS:
                dropped, _ = self._data.popitem(last=False)
                logger.info(f"Session store full, dropped the oldest chat: {dropped}")

    def reset(self, session_id: str, agent_id: str) -> None:
        with self._lock:
            self._data.pop(self._key(session_id, agent_id), None)


sessions = SessionStore()
