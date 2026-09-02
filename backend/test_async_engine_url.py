import importlib
import os

def _reload_session():
    """Reload the session module after changing environment vars."""
    import app.db.session as sess
    importlib.reload(sess)
    return sess

def test_engine_strips_sslmode_and_enables_ssl(monkeypatch):
    url = "postgresql+asyncpg://user:pass@host:5432/db?sslmode=require&channel_binding=require"
    monkeypatch.setenv("ASYNC_DATABASE_URL", url)
    sess = _reload_session()
    engine_url = str(sess.engine.url)
    assert "sslmode" not in engine_url
    assert "channel_binding" not in engine_url
    # ensure connect_args contain ssl=True
    assert getattr(sess, "connect_args", {}) == {"ssl": True}

def test_engine_without_sslmode_does_not_enable_ssl(monkeypatch):
    url = "postgresql+asyncpg://user:pass@host:5432/db"
    monkeypatch.setenv("ASYNC_DATABASE_URL", url)
    sess = _reload_session()
    engine_url = str(sess.engine.url)
    assert "sslmode" not in engine_url
    # no connect_args set
    assert getattr(sess, "connect_args", {}) == {}
