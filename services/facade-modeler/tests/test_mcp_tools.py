"""MCP server：只暴露 LM 的感知与建模操作。"""
import asyncio
import json

from facade_modeler.adapters.mcp_server import TOOL_NAMES, create_server
from facade_modeler.assets.catalog import Catalog
from facade_modeler.config import load_defaults
from facade_modeler.photo_model.store import PhotoModelStore
from facade_modeler.service.context import ServiceContext

PERCEPTION = {"get_context", "view_photo", "rectify_photo", "measure", "search_assets", "render_preview"}
MODELING = {"estimate_width", "set_roof", "set_materials", "add_opening", "update_opening", "remove_opening",
            "build", "submit"}


def make_server(tmp_path):
    ctx = ServiceContext(PhotoModelStore(tmp_path), Catalog.load(), load_defaults())
    return create_server(ctx), ctx


def test_mcp_lists_expected_tools(tmp_path):
    server, _ = make_server(tmp_path)
    tools = asyncio.run(server.list_tools())
    assert {tool.name for tool in tools} == PERCEPTION | MODELING == set(TOOL_NAMES)


def test_mcp_tool_returns_json_text(tmp_path):
    server, _ = make_server(tmp_path)
    result = asyncio.run(server.call_tool("search_assets", {"query": "brick"}))
    blocks = result if isinstance(result, list) else result[0] if isinstance(result, tuple) else result.content
    payload = json.loads(blocks[0].text)
    assert payload["ok"] and payload["result"]["assets"][0]["id"] == "mat/brick-red"


def call(server, name, arguments):
    result = asyncio.run(server.call_tool(name, arguments))
    blocks = result if isinstance(result, list) else result[0] if isinstance(result, tuple) else result.content
    return json.loads(blocks[0].text)


def test_unknown_project_returns_reason(tmp_path):
    """未知项目等异常应返回 ok:false 和原因，而不是不透明的错误（review I-3）。"""
    server, _ = make_server(tmp_path)
    payload = call(server, "get_context", {"project_id": "house-999"})
    assert payload["ok"] is False and "house-999" in payload["result"]["error"]


def test_bad_vertical_ref_returns_reason(tmp_path):
    from facade_modeler.service import user_actions
    from helpers import jpeg_bytes

    server, ctx = make_server(tmp_path)
    pid = user_actions.upload_photos(ctx, None, [(jpeg_bytes(), "a.jpg")], 8000).result["photoModelId"]
    payload = call(server, "rectify_photo", {"project_id": pid, "photo_id": "p1",
                                             "corners_px": [[50, 400], [600, 400], [600, 100], [50, 100]],
                                             "vertical_ref": {"box_px": [1, 2, 3, 4]}})
    assert payload["ok"] is False and payload["result"]["error"]


def test_measure_wrong_shape_returns_reason(tmp_path):
    from facade_modeler.service import user_actions
    from helpers import jpeg_bytes

    server, ctx = make_server(tmp_path)
    pid = user_actions.upload_photos(ctx, None, [(jpeg_bytes(), "a.jpg")], 8000).result["photoModelId"]
    call(server, "rectify_photo", {"project_id": pid, "photo_id": "p1",
                                   "corners_px": [[50, 400], [600, 400], [600, 100], [50, 100]]})
    payload = call(server, "measure", {"project_id": pid, "photo_id": "p1", "box_px": [1, 2, 3]})
    assert payload["ok"] is False and payload["result"]["error"]
