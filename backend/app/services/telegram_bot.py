from app.core.config import settings

DEFAULT_FRONTEND_URL = "https://englishlifesupport.vercel.app"


def get_frontend_url() -> str:
    return getattr(settings, "FRONTEND_URL", DEFAULT_FRONTEND_URL) or DEFAULT_FRONTEND_URL
