# facade-modeler

照片 → 细节立面建模（阶段一）。用户上传同一立面的照片（可附宽度），LM 在 Claude Desktop 中通过 MCP 工具
矫正照片、测量、建模、自查；产物与 house-viewer 的 typology 格式一致，并在查看页中带光影、带尺寸标注显示。

设计：`../../docs/superpowers/specs/2026-10-07-facade-modeler-design.md`（从 varenda_uiux 迁入）

本服务是 house-viewer 的一部分：在仓库根目录运行 `npm run dev` 即可同时启动本服务和前端（首次会自动 `uv sync`），
不需要单独进入本目录。数据写在仓库根目录的 `data/`（见 `../../data/README.md`）：
录入项目在 `data/intake/<id>/`，提交后自动发布到 `data/typologies/<id>/`，出现在 house-viewer 的 Typology 列表里。
照片默认是房子的**后立面**（spec `facade.side = "back"`，上传时可选 front）：builds 始终用建模坐标（立面朝 +Z）；
发布时按 side 重新生成，back 会把模型转 180°，立面朝向 house-viewer 的后院，安装墙段标为 back。

## 安装（Mac，一次即可）

```bash
brew install uv          # 若尚未安装
```

## 1. 启动

```bash
cd ~/Documents/house-viewer && npm run dev       # 开发：打开 Vite 显示的地址，Typology → + From photo
cd ~/Documents/house-viewer && npm start         # 或：构建后单端口运行 http://127.0.0.1:8765
```

单独运行本服务（调试用）：`uv run facade-modeler-http`（在本目录）。

## 2. 上传后自动建模

上传照片后，服务会在后台自动运行 Claude Code 的无界面模式（`claude -p`），由 LM 通过本项目的 MCP 工具完成建模。
照片录入页（/intake.html）显示进度，每生成一个版本就会自动刷新；失败时显示原因和日志末尾，并提供 Run again 按钮。

前提：Mac 上已安装 Claude Code 并登录（`claude --version` 能显示版本号），使用的是你的 Claude 账号，不需要 API key。

- 只允许本项目的 MCP 工具，内置工具全部关闭，因此无人值守运行不会弹出权限确认。
- 每次运行的日志在 `data/intake/<id>/jobs/run-N.log`。
- 找不到 `claude` 时，设置 `FACADE_CLAUDE_BIN=/path/to/claude`。
- 提交（submit）后自动发布为 typology；没有提交但已有 build 时，录入页提供 Save as typology 按钮（`POST /api/projects/<id>/publish`）。
- 关闭自动建模：`FACADE_AUTORUN=0 uv run facade-modeler-http`。
- 对已有项目手动重跑：`curl -X POST http://127.0.0.1:8765/api/projects/house-005/run`。

（仍可在 Claude Desktop 中手动接入 MCP：`command` 设为 `uv` 的完整路径，
`args` 为 `["run", "--directory", "<本目录>", "facade-modeler-mcp"]`。）

## 冒烟测试（不需要 LM）

服务启动后运行：

```bash
uv run python scripts/demo_sunningdale.py
```

脚本会合成一张 Sunningdale 后立面的斜拍照片并上传，然后通过真实的 MCP 连接模拟 LM 完成矫正、测量、建模、build。
在照片录入页的项目下拉框中选择新项目即可看到结果。

## 代码结构

| 目录 | 职责 |
|---|---|
| `spec/` | HouseSpec 数据结构、校验、JSON Schema |
| `project/` | 项目目录、操作日志、构建版本、写锁 |
| `photos/` | 照片矫正（透视 → 正视）与测量 |
| `assets/` + `../assets/` | 素材库：构件样式与材质 |
| `build/` | 体块、洞口、GLB、typology 导出、校验 |
| `preview/` | 正视图与叠加图 |
| `service/` | 三组操作：用户、LM 感知、LM 建模 |
| `adapters/` | MCP（给 LM）与 HTTP（给查看页） |

默认数值集中在 `config/defaults.toml`。

## 测试

```bash
uv run pytest
```
