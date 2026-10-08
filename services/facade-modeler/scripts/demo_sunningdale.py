"""End-to-end demo: a scripted stand-in for the LM (a smoke test, not a real LM).

1. Synthesise an oblique "photo" of the Sunningdale rear facade (known size and opening positions).
2. Upload it over HTTP into a user project (the same endpoint as the viewer's upload button);
   without --project a new project is created.
3. Drive the tools through an MCP stdio client: rectify → measure → add openings → set roof → build →
   preview → submit.

Usage (start uv run facade-modeler-http first):
    uv run python scripts/demo_sunningdale.py [--server http://127.0.0.1:8765] [--project p-0001] [--out preview.png]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
import os
import sys

import cv2
import httpx
import numpy as np
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

WIDTH, EAVE, PITCH = 11300.0, 5200.0, math.degrees(math.atan(0.85))
# (资产, 中心 u, 底边 sill, 宽, 高)，取自 house-viewer sunningdale_baseline.py 的 Rear_* 洞口
OPENINGS = [
    ("win/casement", 9550, 825, 1500, 1350), ("win/casement", 7000, 1150, 600, 900),
    ("door/patio", 4500, 0, 1800, 2100), ("win/casement", 1700, 1025, 1200, 1050),
    ("win/casement", 10000, 3850, 600, 900), ("win/casement", 7550, 3500, 1200, 1200),
    ("win/casement", 4800, 3500, 1200, 1200), ("win/casement", 1800, 3500, 1200, 1200),
]
PX_PER_MM = 0.1  # 立面贴图：每米 100 像素


def facade_image() -> np.ndarray:
    """正视立面：浅色挂板、石材勒脚、深色门窗。"""
    w, h = int(WIDTH * PX_PER_MM), int(EAVE * PX_PER_MM)
    image = np.full((h, w, 3), (205, 215, 222), dtype=np.uint8)
    for y in range(0, h, 16):
        image[y:y + 1] = (180, 190, 196)
    image[h - int(520 * PX_PER_MM):] = (110, 125, 130)
    for _, u, sill, ow, oh in OPENINGS:
        x0, x1 = int((u - ow / 2) * PX_PER_MM), int((u + ow / 2) * PX_PER_MM)
        y0, y1 = h - int((sill + oh) * PX_PER_MM), h - int(sill * PX_PER_MM)
        cv2.rectangle(image, (x0 - 6, y0 - 6), (x1 + 6, y1 + 6), (245, 245, 245), -1)
        cv2.rectangle(image, (x0, y0), (x1, y1), (95, 80, 60), -1)
    return image


def oblique_photo(texture: np.ndarray, yaw_deg=28.0, pitch_deg=4.0, focal_px=1300.0, size=(1600, 1200)):
    """用针孔相机斜着"拍"正视立面，返回照片与四角像素（左下、右下、右上、左上）。"""
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    distance, eye = WIDTH * 1.5, 1600.0  # 相机离立面中心的距离、相机高度（毫米）
    corners = []
    for x, y in ((-WIDTH / 2, 0), (WIDTH / 2, 0), (WIDTH / 2, EAVE), (-WIDTH / 2, EAVE)):
        px, py, pz = x * math.cos(yaw), y - eye, distance + x * math.sin(yaw)
        py, pz = py * math.cos(pitch) - pz * math.sin(pitch), py * math.sin(pitch) + pz * math.cos(pitch)
        corners.append((size[0] / 2 + focal_px * px / pz, size[1] / 2 - focal_px * py / pz))
    th, tw = texture.shape[:2]
    matrix = cv2.getPerspectiveTransform(np.float32([(0, th), (tw, th), (tw, 0), (0, 0)]), np.float32(corners))
    photo = cv2.warpPerspective(texture, matrix, size, borderValue=(190, 170, 150))
    return photo, [list(map(float, c)) for c in corners]


def text_of(result) -> dict:
    return json.loads(result.content[0].text)


def save_images(result, prefix: str) -> list[str]:
    paths = []
    for index, block in enumerate(result.content[1:]):
        path = f"{prefix}-{index}.png"
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(block.data))
        paths.append(path)
    return paths


async def model_with_mcp(pid: str, project_id: str, corners, out: str) -> None:
    """project_id 是照片模型 id（MCP 工具的参数名）；pid 是它所在的用户项目。"""
    from facade_modeler.paths import projects_dir
    env = {**os.environ, "FACADE_PHOTO_MODELS_DIR": str(projects_dir() / pid / "photo-models"),
           "FACADE_TYPOLOGIES_DIR": str(projects_dir() / pid / "typologies")}
    params = StdioServerParameters(command=sys.executable, args=["-m", "facade_modeler.adapters.mcp_server"],
                                   env=env)
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
        print("MCP tools:", ", ".join(sorted(t.name for t in tools.tools)))
        context = text_of(await session.call_tool("get_context", {"project_id": project_id}))
        print("Width:", context["result"]["width"])
        rect = text_of(await session.call_tool("rectify_photo", {"project_id": project_id, "photo_id": "p1",
                                                                 "corners_px": corners}))
        print("Rectified:", rect["result"]["method"], f"aspect={rect['result']['aspect']:.3f} (true {EAVE / WIDTH:.3f})")
        (ox, oy), scale = rect["result"]["originPx"], rect["result"]["pxPerWidth"] / WIDTH
        for asset, u, sill, ow, oh in OPENINGS:
            box = [ox + (u - ow / 2) * scale, oy - (sill + oh) * scale, ox + (u + ow / 2) * scale, oy - sill * scale]
            measured = text_of(await session.call_tool("measure", {"project_id": project_id, "photo_id": "p1",
                                                                   "box_px": box}))
            added = text_of(await session.call_tool("add_opening", {"project_id": project_id, "asset": asset,
                                                                    "measurement": measured["result"]["id"]}))
            if sill == 0:  # 门：底边落地
                await session.call_tool("update_opening", {"project_id": project_id,
                                                           "opening_id": added["result"]["opening"]["id"],
                                                           "sill_mm": 0})
        await session.call_tool("set_roof", {"project_id": project_id, "type": "gable", "ridge": "parallel",
                                             "eave_height_mm": EAVE, "pitch_deg": PITCH})
        built = text_of(await session.call_tool("build", {"project_id": project_id}))
        print("Build:", built["result"], "issues:", [i["code"] for i in built["issues"]])
        preview = await session.call_tool("render_preview", {"project_id": project_id, "kind": "overlay"})
        print("Preview images:", save_images(preview, out.removesuffix(".png")))
        await session.call_tool("submit", {"project_id": project_id, "note": "Demo: Sunningdale rear facade (synthetic photo)"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="http://127.0.0.1:8765")
    parser.add_argument("--project", default=None, help="user project id (default: create a new project)")
    parser.add_argument("--out", default="demo-preview.png")
    args = parser.parse_args()
    pid = args.project
    if pid is None:
        created = httpx.post(f"{args.server}/api/projects", json={"name": "Sunningdale demo"})
        created.raise_for_status()
        pid = created.json()["result"]["id"]
    photo, corners = oblique_photo(facade_image())
    encoded = cv2.imencode(".jpg", photo)[1].tobytes()
    response = httpx.post(f"{args.server}/api/projects/{pid}/photo-models", data={"widthMm": str(WIDTH)},
                          files=[("files", ("sunningdale-back.jpg", encoded, "image/jpeg"))])
    response.raise_for_status()
    project_id = response.json()["result"]["photoModelId"]
    print("Uploaded:", pid, project_id)
    asyncio.run(model_with_mcp(pid, project_id, corners, args.out))


if __name__ == "__main__":
    main()
