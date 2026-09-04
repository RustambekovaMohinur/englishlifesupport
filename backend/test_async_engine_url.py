from app.db.session import _build_async_engine_url


def test_engine_strips_sslmode_and_enables_ssl():
    url = "postgresql+asyncpg://user:pass@host:5432/db?sslmode=require&channel_binding=require"
    clean_url, connect_args = _build_async_engine_url(url)
    engine_url = str(clean_url)
    assert "sslmode" not in engine_url
    assert "channel_binding" not in engine_url
    assert connect_args == {"ssl": True}


def test_engine_without_sslmode_does_not_enable_ssl():
    url = "postgresql+asyncpg://user:pass@host:5432/db"
    clean_url, connect_args = _build_async_engine_url(url)
    engine_url = str(clean_url)
    assert "sslmode" not in engine_url
    assert connect_args == {}

