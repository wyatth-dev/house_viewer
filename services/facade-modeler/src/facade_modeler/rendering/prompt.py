"""渲染提示词：仓库根目录 prompts/ 下的纯文本文件，每次出图都重新读取。

  render.txt              主提示词
  render-context.txt      有 Context 照片时，填进 render.txt 的 {details}
  render-no-context.txt   没有 Context 照片时，填进 {details}（可以没有这个文件）
  options.toml            氛围参数（风格、时间、天气、季节……）：每组一个 {参数}，每个选项一段提示词文字

render.txt 里没有写 {details} 时，细节段落接在最后（兼容旧写法）。

参数：
  {capture}        模型截图（第 1 张）           → "Image 1"
  {context}        Context 照片（第 2 张起）     → "Image 2" / "Images 2 to 4"
  {context_count}  Context 照片张数
  {details}        上面两个细节文件之一
  {<组 id>}        options.toml 里每一组，例如 {style}、{weather}：用选中选项（没选就用默认）的 text

FACADE_PROMPTS_DIR 可以换一个目录。
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover  Python 3.10
    import tomli as tomllib

from facade_modeler.paths import REPO_ROOT

PROMPTS_DIR = REPO_ROOT / "prompts"


class InvalidRenderOptions(ValueError):
    pass


def prompts_dir() -> Path:
    value = os.environ.get("FACADE_PROMPTS_DIR")
    return Path(value) if value else PROMPTS_DIR


def load_options(folder: Optional[Path] = None) -> list[dict]:
    """options.toml → [{id, label, default, options: [{id, label, icon, text}]}]，保持文件里的顺序。"""
    path = (folder or prompts_dir()) / "options.toml"
    if not path.is_file():
        return []
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as error:
        raise InvalidRenderOptions(f"prompts/options.toml cannot be read: {error}") from error
    groups = []
    for group_id, group in data.items():
        options = [{"id": option_id, "label": str(option.get("label", option_id)), "icon": option.get("icon"),
                    "text": str(option.get("text", ""))}
                   for option_id, option in (group.get("options") or {}).items()]
        if not options:
            continue
        ids = [option["id"] for option in options]
        default = group.get("default") if group.get("default") in ids else ids[0]
        groups.append({"id": group_id, "label": str(group.get("label", group_id)), "default": default,
                       "options": options})
    return groups


def resolve_options(choices: Optional[dict], groups: list[dict]) -> dict[str, str]:
    """把前端选的 {组: 选项} 补全成每组都有值；未知的组或选项抛 InvalidRenderOptions。"""
    choices = choices or {}
    if not isinstance(choices, dict):
        raise InvalidRenderOptions("options must be an object")
    known = {group["id"]: group for group in groups}
    unknown = [key for key in choices if key not in known]
    if unknown:
        raise InvalidRenderOptions(f"Unknown render option: {', '.join(unknown)}")
    resolved = {}
    for group in groups:
        value = choices.get(group["id"], group["default"])
        if value not in {option["id"] for option in group["options"]}:
            raise InvalidRenderOptions(f"Unknown {group['label']} option: {value}")
        resolved[group["id"]] = value
    return resolved


def prompt_parameters(context_count: int) -> dict[str, str]:
    """输入图片的顺序：截图在前，Context 照片在后（runner.py 按这个顺序发送）。"""
    if context_count <= 0:
        context = ""
    elif context_count == 1:
        context = "Image 2"
    else:
        context = f"Images 2 to {context_count + 1}"
    return {"capture": "Image 1", "context": context, "context_count": str(max(context_count, 0))}


def fill(text: str, parameters: dict[str, str]) -> str:
    """只替换已知参数；其他花括号原样保留，不会因为写错而报错。"""
    for key, value in parameters.items():
        text = text.replace("{" + key + "}", value)
    return text


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip() if path.is_file() else ""


def build_prompt(context_count: int, folder: Optional[Path] = None, choices: Optional[dict] = None) -> str:
    folder = folder or prompts_dir()
    text = _read(folder / "render.txt")
    details = _read(folder / ("render-context.txt" if context_count > 0 else "render-no-context.txt"))
    if "{details}" in text:
        text = text.replace("{details}", details)
    elif details:
        text = f"{text}\n\n{details}"
    groups = load_options(folder)
    selected = resolve_options(choices, groups)
    parameters = prompt_parameters(context_count)
    for group in groups:
        option = next(option for option in group["options"] if option["id"] == selected[group["id"]])
        parameters[group["id"]] = option["text"]
    text = fill(text, parameters)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
