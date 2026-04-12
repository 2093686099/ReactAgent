# backend/app/main.py
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.infra.database import db
from app.infra.redis import redis_manager
from app.core.exceptions import BusinessError
from app.api.deps import get_task_service
from app.api import chat, sessions, memory


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


# CORS — Next.js 前端跑在 3000 端口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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