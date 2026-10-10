"""
Password hashing (Argon2id) and JWT access/refresh token handling.

Design notes:
- Argon2id via passlib is used for password hashing (memory-hard, resistant
  to GPU cracking, recommended over bcrypt for new systems).
- Access tokens are short-lived (default 15 min) and carry the user's role
  and id. Refresh tokens are longer-lived, stored (hashed) server-side in the
  RefreshToken table so they can be revoked/rotated on logout or reuse.
- We NEVER trust a role claim from the frontend independently of the signed
  JWT issued by this server.
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

TokenType = Literal["access", "refresh"]


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def _create_token(subject: str, role: str, token_type: TokenType, expires_delta: timedelta, jti: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": jti or str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, role: str) -> str:
    return _create_token(
        subject=user_id,
        role=role,
        token_type="access",
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str, role: str, jti: Optional[str] = None) -> tuple[str, str]:
    """Returns (token, jti) so the caller can persist the jti for revocation."""
    jti = jti or str(uuid.uuid4())
    token = _create_token(
        subject=user_id,
        role=role,
        token_type="refresh",
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        jti=jti,
    )
    return token, jti


def decode_token(token: str) -> dict:
    """Raises JWTError if invalid/expired. Caller is responsible for handling."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def generate_opaque_token() -> str:
    """Used for things like password-reset tokens if needed later."""
    return secrets.token_urlsafe(32)
