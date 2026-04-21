# backend/app/main.py
from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

import certifi

# macOS / 无系统 CA 场景下 urllib (高德 MCP key 可用性检查等) 默认找不到 CA
# 会 SSL CERTIFICATE_VERIFY_FAILED；显式绑到 certifi 提供的 CA bundle
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.infra.database import db
from app.infra.redis import redis_manager
from app.core.exceptions import BusinessError
from app.api.deps import get_task_service
from app.api import chat, sessions, memory


def configure_windows_event_loop_policy() -> None:
    """psycopg async 在 Windows 需要 selector event loop。"""
    if sys.platform != "win32":
        return
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


configure_windows_event_loop_policy()


def setup_logging() -> None:
    """集中配置 root logger。各模块只需 logging.getLogger(__name__)。"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    # 降低第三方噪声
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await db.connect()
    await redis_manager.connect()
    yield
    await get_task_service().cancel_all()
    await redis_manager.disconnect()
    await db.disconnect()


app = FastAPI(title="AI Assistant", lifespan=lifespan)


@app.exception_handler(BusinessError)
async def business_error_handler(request, exc: BusinessError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


# CORS — Next.js dev server 端口可能被占用自动切到 3001/3002/...
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(sessions.router)
app.include_router(memory.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)