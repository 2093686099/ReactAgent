# backend/app/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录：backend/app/config.py → backend/ → 项目根
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # 用绝对路径定位 .env，避免依赖进程 cwd
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # PostgreSQL
    db_uri: str = "postgresql://postgres:password@localhost:5432/neuron_ai_assistant?sslmode=disable"
    db_pool_min: int = 5
    db_pool_max: int = 10

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    session_ttl: int = 3600

    # LLM
    llm_type: str = "modelscope"
    dashscope_api_key: str = ""
    modelscope_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    tencent_api_key: str = ""
    amap_maps_api_key: str = ""

    # MySQL（data_analyst 子 Agent 使用，未配置则禁用 SQL 工具）
    mysql_uri: str = ""

    # 单用户默认标识（未来加登录时从 JWT 注入真实 user_id）
    default_user_id: str = "default"

    # 任务管理
    task_ttl: int = 3600  # Redis 中 task 元数据和事件流的 TTL (秒)

    # Server
    host: str = "0.0.0.0"
    port: int = 8001

    # RAG knowledge base (graph2 FastAPI service)
    rag_kb_url: str = "http://localhost:8765"
    rag_kb_read_timeout: float = 180.0

    # Logging
    log_file: str = "logs/app.log"
    log_max_bytes: int = 5 * 1024 * 1024
    log_backup_count: int = 3


settings = Settings()