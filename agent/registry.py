"""Single source of truth for the agents the workspace UI shows.

The frontend used to hard-code this list in JavaScript. It now reads it from
``GET /api/agents``, so adding an agent here is enough: the sidebar, the
dashboard cards and the routing all pick it up.
"""

from tools.agent_tools import api_tools

# Tool names shown in the chat trace come straight off the Python callables,
# so the UI can never drift from what the agent is actually allowed to call.
RESEARCH_TOOL_NAMES = [fn.__name__ for fn in api_tools]

AGENTS = [
    {
        "id": "research",
        "icon": "sparkles",
        "status": "live",
        "domain": "Agentic",
        "model": "flash-lite",
        "hue": 178,
        "stack": ["Python", "Gemini API", "ChromaDB", "FastAPI"],
        "tools": RESEARCH_TOOL_NAMES,
        "callables": api_tools,
        "i18n": {
            "en": {
                "name": "The Dreamer",
                "tagline": "Searches the web, checks the weather, does the math and remembers what you tell it.",
            },
            "de": {
                "name": "The Dreamer",
                "tagline": "Sucht im Web, prüft das Wetter, rechnet und merkt sich, was du ihm sagst.",
            },
            "tr": {
                "name": "The Dreamer",
                "tagline": "Web'de arar, havayı kontrol eder, hesap yapar ve söylediklerini hatırlar.",
            },
        },
    },
    {
        "id": "analyst",
        "icon": "terminal",
        "status": "soon",
        "domain": "Agentic",
        "model": "flash",
        "hue": 40,
        "stack": ["Python", "pandas", "code-exec"],
        "tools": ["run_python", "plot"],
        "callables": [],
        "i18n": {
            "en": {
                "name": "Data Analyst Agent",
                "tagline": "Upload a CSV, ask a question; it writes and runs the pandas code itself.",
            },
            "de": {
                "name": "Datenanalyse-Agent",
                "tagline": "CSV hochladen, Frage stellen; schreibt und führt den pandas-Code selbst aus.",
            },
            "tr": {
                "name": "Veri Analisti Ajanı",
                "tagline": "CSV yükle, soru sor; pandas kodunu kendisi yazıp çalıştırır.",
            },
        },
    },
    {
        "id": "vision",
        "icon": "eye",
        "status": "soon",
        "domain": "Computer Vision",
        "model": "flash",
        "hue": 255,
        "stack": ["PyTorch", "YOLO", "OpenCV"],
        "tools": ["detect", "annotate"],
        "callables": [],
        "i18n": {
            "en": {
                "name": "Object Detection Board",
                "tagline": "Upload an image and watch the boxes and confidence scores land live.",
            },
            "de": {
                "name": "Objekterkennungs-Board",
                "tagline": "Bild hochladen und Boxen samt Konfidenzwerten live sehen.",
            },
            "tr": {
                "name": "Nesne Tespit Panosu",
                "tagline": "Görsel yükle, tespit kutularını ve güven skorlarını canlı gör.",
            },
        },
    },
    {
        "id": "diffusion",
        "icon": "layers",
        "status": "soon",
        "domain": "Generative",
        "model": "pro",
        "hue": 312,
        "stack": ["PyTorch", "DDPM", "RTX 5070 Ti"],
        "tools": ["sample", "interpolate"],
        "callables": [],
        "i18n": {
            "en": {
                "name": "DDPM Image Generator",
                "tagline": "Watch a from-scratch diffusion model emerge out of pure noise.",
            },
            "de": {
                "name": "DDPM-Bildgenerator",
                "tagline": "Zeigt, wie das selbst trainierte Diffusionsmodell aus Rauschen entsteht.",
            },
            "tr": {
                "name": "DDPM Görsel Üretici",
                "tagline": "Sıfırdan eğitilen difüzyon modelinin gürültüden çıkışını izler.",
            },
        },
    },
    {
        "id": "rl",
        "icon": "gamepad",
        "status": "soon",
        "domain": "Reinforcement Learning",
        "model": "pro",
        "hue": 142,
        "stack": ["Gymnasium", "PPO", "PyTorch"],
        "tools": ["rollout", "reward_curve"],
        "callables": [],
        "i18n": {
            "en": {
                "name": "RL Agent Arena",
                "tagline": "Opens the PPO agent's reward curve and episode recordings side by side.",
            },
            "de": {
                "name": "RL-Agenten-Arena",
                "tagline": "Öffnet Belohnungskurve und Episodenaufzeichnungen des PPO-Agenten nebeneinander.",
            },
            "tr": {
                "name": "RL Ajan Arenası",
                "tagline": "PPO ajanının ödül eğrisini ve bölüm kayıtlarını yan yana açar.",
            },
        },
    },
]

AGENT_BY_ID = {a["id"]: a for a in AGENTS}


def get_agent(agent_id: str):
    return AGENT_BY_ID.get(agent_id)


def public_agents():
    """The registry without the Python callables, ready to be JSON encoded."""
    return [{k: v for k, v in a.items() if k != "callables"} for a in AGENTS]
