"""OpenAI 图像接口（images/edits）：模型截图 + Context 照片 + 提示词 → 一张效果图（PNG 字节）。

配置写在仓库根目录的 .env：
  OPENAI_API_KEY                必填
  OPENAI_IMAGE_MODEL            默认 gpt-image-2.5-flare（要求更精确的编辑可以试 gpt-image-2.5-sunburst）
  OPENAI_IMAGE_QUALITY          low | medium | high | auto，2.5 系列另有 xhigh | max；默认 high
  OPENAI_IMAGE_INPUT_FIDELITY   high | low，只对 gpt-image-1 / 1.5 发送（默认 high）

按 OpenAI 文档（API reference: Create image edit，2026-10）：
- gpt-image-2 / 2.5 系列支持任意尺寸 WIDTHxHEIGHT：宽高都是 16 的倍数，比例在 1:3 到 3:1 之间，
  最大 3840x2160（2560x1440 以上是实验性的）。所以出图尺寸直接用截图的比例，构图不用补边。
  其他模型只有 1024x1024、1536x1024、1024x1536。
- input_fidelity：gpt-image-2 文档要求不要发送（输入图总是按高保真处理）；2.5 系列文档没有写，按同样处理不发送。
  gpt-image-1 / 1.5 支持 high；gpt-image-1-mini 只支持 low（这里不发送）。
  OPENAI_BASE_URL               默认 https://api.openai.com/v1
"""
from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

TIMEOUT_S = 300.0
DEFAULT_MODEL = "gpt-image-2.5-flare"
LANDSCAPE, PORTRAIT, SQUARE = "1536x1024", "1024x1536", "1024x1024"
CUSTOM_EDGE = 1536  # 任意尺寸时，长边取这个值（截图本身最长 1600）


def model_from_env() -> str:
    return os.environ.get("OPENAI_IMAGE_MODEL", "").strip() or DEFAULT_MODEL


def supports_custom_size(model: str) -> bool:
    return model.startswith("gpt-image-2")


def fidelity_for(model: str, configured: Optional[str]) -> Optional[str]:
    """只有 gpt-image-1 / gpt-image-1.5 接受 input_fidelity=high；其他模型不发送。"""
    if model.startswith("gpt-image-1") and "mini" not in model:
        return configured or "high"
    return None


class RenderError(Exception):
    """给用户看的出图失败原因（英文，界面直接显示）。"""


@dataclass
class OpenAIImageSettings:
    api_key: str
    model: str = DEFAULT_MODEL
    quality: str = "high"
    input_fidelity: Optional[str] = None  # 实际发送前还要经过 fidelity_for(model, …)
    base_url: str = "https://api.openai.com/v1"

    @classmethod
    def from_env(cls) -> Optional["OpenAIImageSettings"]:
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            return None
        fidelity = os.environ.get("OPENAI_IMAGE_INPUT_FIDELITY", "").strip()
        return cls(api_key=key,
                   model=model_from_env(),
                   quality=os.environ.get("OPENAI_IMAGE_QUALITY", "").strip() or "high",
                   input_fidelity=fidelity or None,
                   base_url=(os.environ.get("OPENAI_BASE_URL", "").strip() or "https://api.openai.com/v1").rstrip("/"))


def size_for(width: int, height: int, model: str = "gpt-image-1") -> str:
    """出图尺寸：支持任意尺寸的模型用截图的比例（16 的倍数）；其他模型选最接近的三种固定尺寸之一。"""
    ratio = width / height if height else 1.0
    if supports_custom_size(model):
        ratio = min(3.0, max(1 / 3, ratio))
        long_w = ratio >= 1
        w = CUSTOM_EDGE if long_w else CUSTOM_EDGE * ratio
        h = CUSTOM_EDGE / ratio if long_w else CUSTOM_EDGE
        return f"{max(16, round(w / 16) * 16)}x{max(16, round(h / 16) * 16)}"
    if ratio >= 1.2:
        return LANDSCAPE
    if ratio <= 1 / 1.2:
        return PORTRAIT
    return SQUARE


def _error_message(response: httpx.Response) -> str:
    try:
        detail = response.json().get("error", {}).get("message")
    except ValueError:
        detail = None
    if response.status_code == 401:
        return "OpenAI rejected the API key. Check OPENAI_API_KEY in .env."
    if response.status_code == 429:
        return f"OpenAI rate limit or quota reached. {detail or ''}".strip()
    return f"OpenAI image request failed (HTTP {response.status_code}). {detail or ''}".strip()


def edit_image(settings: OpenAIImageSettings, prompt: str, images: list[Path], size: str,
               client: Optional[httpx.Client] = None) -> bytes:
    files = [("image[]", (path.name, path.read_bytes(), "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg")
                          else "image/png")) for path in images]
    data = {"model": settings.model, "prompt": prompt, "size": size, "quality": settings.quality, "n": "1"}
    fidelity = fidelity_for(settings.model, settings.input_fidelity)
    if fidelity:
        data["input_fidelity"] = fidelity
    owner = client is None
    client = client or httpx.Client(timeout=TIMEOUT_S)
    try:
        response = client.post(f"{settings.base_url}/images/edits", data=data, files=files,
                               headers={"Authorization": f"Bearer {settings.api_key}"})
    except httpx.HTTPError as error:
        raise RenderError(f"Could not reach OpenAI: {error}") from error
    finally:
        if owner:
            client.close()
    if response.status_code != 200:
        raise RenderError(_error_message(response))
    try:
        encoded = response.json()["data"][0]["b64_json"]
        return base64.b64decode(encoded)
    except (ValueError, KeyError, IndexError, TypeError) as error:
        raise RenderError("OpenAI returned no image.") from error
