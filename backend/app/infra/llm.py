# backend/app/infra/llm.py
from __future__ import annotations

import logging
import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from app.config import settings


logger = logging.getLogger(__name__)


DEFAULT_TEMPERATURE = 0


def _model_configs() -> dict:
    """
    模型配置字典。使用函数延迟构建，保证读取的是最新的 settings。
    来源：07/utils/llms.py MODEL_CONFIGS
    """
    return {
        "openai": {
            "base_url": settings.openai_base_url,
            "api_key": settings.openai_api_key,
            "chat_model": "gpt-4o-mini",
            "embedding_model": "text-embedding-3-small",
        },
        "qwen": {
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "api_key": settings.dashscope_api_key,
            "chat_model": "qwen-max",
            "embedding_model": "text-embedding-v1",
        },
        "ollama": {
            "base_url": "http://localhost:11434/v1",
            "api_key": "ollama",
            "chat_model": "llama3.1:8b",
            "embedding_model": "nomic-embed-text:latest",
        },
        "modelscope": {
            "base_url": "https://api-inference.modelscope.cn/v1",
            "api_key": settings.modelscope_api_key,
            "chat_model": "MiniMax/MiniMax-M2.5",
            "embedding_model": "BAAI/bge-m3",
        },
        "tencent": {
            "base_url": "https://tokenhub.tencentmaas.com/v1",
            "api_key": settings.tencent_api_key,
            "chat_model": "glm-5",
            "embedding_base_url": "https://api-inference.modelscope.cn/v1",
            "embedding_api_key": settings.modelscope_api_key,
            "embedding_model": "BAAI/bge-m3",
        },
    }


class LLMInitializationError(Exception):
    """自定义异常类用于 LLM 初始化错误"""


def initialize_llm(llm_type: str | None = None) -> tuple[ChatOpenAI, OpenAIEmbeddings]:
    """
    初始化 LLM 实例。

    Args:
        llm_type: LLM 类型，可选值为 'openai' / 'qwen' / 'ollama' / 'modelscope'。
                  省略时使用 settings.llm_type。

    Returns:
        (ChatOpenAI, OpenAIEmbeddings)

    Raises:
        LLMInitializationError: 当 LLM 初始化失败时抛出
    """
    llm_type = llm_type or settings.llm_type
    configs = _model_configs()

    if llm_type not in configs:
        raise LLMInitializationError(
            f"不支持的 LLM 类型: {llm_type}. 可用的类型: {list(configs.keys())}"
        )

    config = configs[llm_type]

    # Ollama 本地模型不需要真实 API key，langchain_openai 仍会校验环境变量
    if llm_type == "ollama":
        os.environ.setdefault("OPENAI_API_KEY", "NA")

    try:
        llm_chat = ChatOpenAI(
            base_url=config["base_url"],
            api_key=config["api_key"],
            model=config["chat_model"],
            temperature=DEFAULT_TEMPERATURE,
            timeout=30,
            max_retries=2,
        )

        emb_base_url = config.get("embedding_base_url", config["base_url"])
        emb_api_key = config.get("embedding_api_key", config["api_key"])
        llm_embedding = OpenAIEmbeddings(
            base_url=emb_base_url,
            api_key=emb_api_key,
            model=config["embedding_model"],
            deployment=config["embedding_model"],
        )
    except Exception as e:
        logger.error(f"初始化 LLM 失败: {e}")
        raise LLMInitializationError(f"初始化 LLM 失败: {e}") from e

    logger.info(f"成功初始化 {llm_type} LLM")
    return llm_chat, llm_embedding


_llm_cache: dict[str, tuple[ChatOpenAI, OpenAIEmbeddings]] = {}


def get_llm(llm_type: str | None = None) -> tuple[ChatOpenAI, OpenAIEmbeddings]:
    """
    获取 LLM 实例的封装函数，按 llm_type 缓存复用。

    如果传入的 llm_type 初始化失败，且不是默认类型，会回退到默认类型重试。
    """
    llm_type = llm_type or settings.llm_type
    if llm_type in _llm_cache:
        return _llm_cache[llm_type]
    try:
        result = initialize_llm(llm_type)
    except LLMInitializationError as e:
        if llm_type != settings.llm_type:
            logger.warning(f"{e}，使用默认 LLM 类型 {settings.llm_type} 重试")
            result = initialize_llm(settings.llm_type)
            llm_type = settings.llm_type
        else:
            raise
    _llm_cache[llm_type] = result
    return result
