"""MCP 适配：把 LM 的感知与建模操作暴露给 Claude Desktop（stdio）。

只做协议转换：参数原样转给 service 层，结果转成"JSON 文本 + PNG 图片"。
一个 MCP 进程只处理一个用户项目：目录由环境变量 FACADE_PHOTO_MODELS_DIR、FACADE_TYPOLOGIES_DIR 给出
（JobRunner 写进 mcp.json）。工具参数 project_id 沿用旧名，指的是这个项目里的照片模型（house-001）。
"""
from __future__ import annotations

import functools
import io
import json
from pathlib import Path
from typing import Literal, Optional

from mcp.server.mcpserver import Image, MCPServer
from pydantic import ValidationError

from facade_modeler.service import modeling, perception
from facade_modeler.service.context import ServiceContext
from facade_modeler.service.results import Result, fail

INSTRUCTIONS = (Path(__file__).parent / "mcp_instructions.md").read_text(encoding="utf-8")
TOOL_NAMES = ["get_context", "view_photo", "rectify_photo", "measure", "search_assets", "render_preview",
              "estimate_width", "set_roof", "set_materials", "add_opening", "update_opening", "remove_opening",
              "build", "submit"]


def _reply(result: Result) -> list:
    blocks: list = [json.dumps(result.to_dict(), ensure_ascii=False, indent=1)]
    for image in result.images:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        blocks.append(Image(data=buffer.getvalue(), format="png"))
    return blocks


def _guarded(function):
    """把参数类错误转成 ok:false + 原因。mcp 2.x 默认只返回"Error executing tool"，LM 无法据此修正（review I-3）。"""
    @functools.wraps(function)
    def wrapper(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except KeyError as error:
            return _reply(fail(str(error.args[0]) if error.args else "The referenced object does not exist"))
        except (ValueError, TypeError, ValidationError) as error:
            return _reply(fail(f"Invalid arguments: {error}"))
    return wrapper


def create_server(ctx: ServiceContext) -> MCPServer:
    server = MCPServer(name="facade-modeler", instructions=INSTRUCTIONS)
    register = server.tool(structured_output=False)

    def tool(function):
        return register(_guarded(function))

    # ---- 感知：只观察，不改动几何 ----------------------------------------------
    @tool
    def get_context(project_id: str) -> list:
        """Photo model overview: photos, width status, current HouseSpec summary, issues, latest build and submission
        status. In every tool, project_id is the photo model ID (e.g. house-001) given in your task."""
        return _reply(perception.get_context(ctx, project_id))

    @tool
    def view_photo(project_id: str, photo_id: str, rectified: bool = False, grid: bool = True) -> list:
        """View the original photo (rectified=false) or the rectified image (true). Grid numbers are that image's pixel coordinates."""
        return _reply(perception.view_photo(ctx, project_id, photo_id, grid, rectified))

    @tool
    def rectify_photo(project_id: str, photo_id: str, corners_px: list[list[float]],
                      vertical_ref: Optional[dict] = None) -> list:
        """Rectify a photo. corners_px: the facade wall's four corners in original-photo pixels [[x,y]×4], ordered
        bottom-left, bottom-right, top-right, top-left (top corners at eave height).
        vertical_ref (optional): {"corners_px": reference object's four corners, "width_mm": real width,
        "height_mm": real height}, used to calibrate the vertical scale."""
        return _reply(perception.rectify_photo(ctx, project_id, photo_id, corners_px, vertical_ref))

    @tool
    def measure(project_id: str, photo_id: str, box_px: Optional[list[float]] = None,
                point_px: Optional[list[float]] = None, label: str = "") -> list:
        """Measure on the rectified image: box_px=[x0,y0,x1,y1] or point_px=[x,y] (rectified pixels). Returns a measurement ID and facade coordinates."""
        return _reply(perception.measure(ctx, project_id, photo_id, box_px, point_px, label))

    @tool
    def search_assets(query: str = "", category: Optional[Literal["component", "material"]] = None) -> list:
        """Search the asset library: component (window, door and vent styles) or material (wall and roof materials)."""
        return _reply(perception.search_assets(ctx, query, category))

    @tool
    def render_preview(project_id: str, kind: Literal["overlay", "elevation"] = "overlay") -> list:
        """View the current model: overlay draws it on the primary photo's rectified image; elevation is a plain front view."""
        return _reply(perception.render_preview(ctx, project_id, kind))

    # ---- 建模：修改 HouseSpec ---------------------------------------------------
    @tool
    def estimate_width(project_id: str, width_mm: float, basis: str) -> list:
        """Only allowed when the user skipped the width. basis states the evidence (e.g. "door m3 assumed 2100 mm high")."""
        return _reply(modeling.estimate_width(ctx, project_id, width_mm, basis))

    @tool
    def set_roof(project_id: str, type: Optional[Literal["gable", "hip", "mono", "flat"]] = None,
                 ridge: Optional[Literal["parallel", "perpendicular"]] = None,
                 eave_height_mm: Optional[float] = None, pitch_deg: Optional[float] = None,
                 overhang_mm: Optional[float] = None, material: Optional[str] = None) -> list:
        """Set the roof (only the given fields change). ridge: parallel = ridge parallel to the facade; perpendicular = the facade is a gable end."""
        fields = {"type": type, "ridge": ridge, "eave_height_mm": eave_height_mm, "pitch_deg": pitch_deg,
                  "overhang_mm": overhang_mm}
        return _reply(modeling.set_roof(ctx, project_id, material=material,
                                        **{k: v for k, v in fields.items() if v is not None}))

    @tool
    def set_materials(project_id: str, plinth: Optional[str] = None, wall: Optional[str] = None,
                      gable: Optional[str] = None, plinth_height_mm: Optional[float] = None) -> list:
        """Set facade materials: plinth, wall and gable (asset IDs such as mat/brick-red) and the plinth height."""
        return _reply(modeling.set_materials(ctx, project_id, plinth, wall, gable, plinth_height_mm))

    @tool
    def add_opening(project_id: str, asset: str, measurement: Optional[str] = None,
                    u_mm: Optional[float] = None, sill_mm: Optional[float] = None,
                    width_mm: Optional[float] = None, height_mm: Optional[float] = None,
                    params: Optional[dict] = None) -> list:
        """Add an opening. Prefer passing measurement (a box measurement ID from measure); explicit dimensions override the measured values."""
        return _reply(modeling.add_opening(ctx, project_id, asset, measurement, u_mm, sill_mm, width_mm,
                                           height_mm, params))

    @tool
    def update_opening(project_id: str, opening_id: str, asset: Optional[str] = None,
                       measurement: Optional[str] = None, u_mm: Optional[float] = None,
                       sill_mm: Optional[float] = None, width_mm: Optional[float] = None,
                       height_mm: Optional[float] = None, params: Optional[dict] = None) -> list:
        """Update an opening (only the given fields change)."""
        return _reply(modeling.update_opening(ctx, project_id, opening_id, asset, measurement, u_mm, sill_mm,
                                              width_mm, height_mm, params))

    @tool
    def remove_opening(project_id: str, opening_id: str) -> list:
        """Remove an opening."""
        return _reply(modeling.remove_opening(ctx, project_id, opening_id))

    @tool
    def build(project_id: str) -> list:
        """Build a new version (three GLBs + scene.json + dimension labels). The viewer refreshes automatically."""
        return _reply(modeling.build(ctx, project_id))

    @tool
    def submit(project_id: str, note: str) -> list:
        """Finish: include a note on what was done and which values are estimates."""
        return _reply(modeling.submit(ctx, project_id, note))

    return server


def main() -> None:
    create_server(ServiceContext.from_env()).run("stdio")


if __name__ == "__main__":
    main()
