from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | str | None) -> datetime:
    """Robustly normalize any datetime or ISO string to UTC-aware datetime.
    Safe against None, naive datetimes, and string inputs."""
    if dt is None:
        return datetime.now(timezone.utc)
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def as_utc(dt: datetime | None) -> datetime:
    """SQLite (and some drivers) return naive datetimes; never compare them to aware ones."""
    return ensure_utc(dt)
