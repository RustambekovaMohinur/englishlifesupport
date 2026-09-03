"""
Simple in-process rate limiting for sensitive endpoints (login/register)
using slowapi (backed by the client IP). For multi-instance deployments,
back this with Redis instead (slowapi supports a storage_uri).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.ENVIRONMENT != "test",
)
