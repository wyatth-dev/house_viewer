# facade-modeler

照片 → 细节立面建模（阶段一）。用户上传同一立面的照片（可附宽度），LM 在 Claude Desktop 中通过 MCP 工具
矫正照片、测量、建模、自查；产物与 house-viewer 的 typology 格式一致，并在查看页中带光影、带尺寸标注显示。

设计：`../../docs/superpowers/specs/2026-10-07-facade-modeler-design.md`（从 varenda_uiux 迁入）

本服务是 house-viewer 的一部分：在仓库根目录运行 `npm run dev` 即可同时启动本服务和前端（首次会自动 `uv sync`），
不需要单独进入本目录。数据写在仓库根目录的 `data/`（见 `../../data/README.md`）：
每个用户项目在 `data/projects/<pid>/`：照片模型在 `photo-models/<mid>/`，提交后自动发布到同一项目的
`typologies/<mid>/`，只出现在这个项目的 From photo 列表里。旧的 `data/intake/`、`data/typologies/` 在第一次启动时
复制进 “My first project”（`p-0001`）。
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
house-viewer 主页面里的照片录入（New from photo，或 `/?project=<pid>&photo=new`、`/?project=<pid>&photo=<mid>`）显示进度，每生成一个版本就会自动刷新；失败时显示原因和日志末尾，并提供 Run again 按钮。

前提：Mac 上已安装 Claude Code 并登录（`claude --version` 能显示版本号），使用的是你的 Claude 账号，不需要 API key。

- 只允许本项目的 MCP 工具，内置工具全部关闭，因此无人值守运行不会弹出权限确认。
- 每次运行的日志在 `data/projects/<pid>/photo-models/<mid>/jobs/run-N.log`。
- MCP 子进程通过 `FACADE_PHOTO_MODELS_DIR`、`FACADE_TYPOLOGIES_DIR` 拿到这个项目的两个目录；工具参数 `project_id` 指的是照片模型。
- 找不到 `claude` 时，设置 `FACADE_CLAUDE_BIN=/path/to/claude`。
- 提交（submit）后自动发布为 typology；没有提交但已有 build 时，录入面板提供 Save as typology 按钮（`POST /api/projects/<pid>/photo-models/<mid>/publish`）。
- 关闭自动建模：`FACADE_AUTORUN=0 uv run facade-modeler-http`。
- 对已有项目手动重跑：`curl -X POST http://127.0.0.1:8765/api/projects/p-0001/photo-models/house-005/run`。

（仍可在 Claude Desktop 中手动接入 MCP：`command` 设为 `uv` 的完整路径，
`args` 为 `["run", "--directory", "<本目录>", "facade-modeler-mcp"]`，`env` 里设置 `FACADE_PHOTO_MODELS_DIR`
和 `FACADE_TYPOLOGIES_DIR` 为某个项目的 `photo-models/` 和 `typologies/` 目录。）

## 冒烟测试（不需要 LM）

服务启动后运行：

```bash
uv run python scripts/demo_sunningdale.py
```

脚本会合成一张 Sunningdale 后立面的斜拍照片并上传，然后通过真实的 MCP 连接模拟 LM 完成矫正、测量、建模、build。
在 house-viewer 的 From photo 列表里点新项目的编辑按钮即可看到结果。

## 接口与环境变量

所有用户数据都挂在项目下（`pid` 如 `p-0001`）：

| 用途 | 接口 |
|---|---|
| 项目列表 / 新建 | `GET` / `POST /api/projects` |
| 读取 / 保存 / 删除项目 | `GET` / `PUT` / `DELETE /api/projects/<pid>`；保存的请求体是完整文档并带 `revision`，不一致返回 409 `{current}`，不合法返回 422 |
| 项目改名 | `PUT /api/projects/<pid>/name`（1–120 个字符；编辑器改名走自动保存，不用这个接口） |
| 照片模型 | `GET` / `POST /api/projects/<pid>/photo-models`，`GET …/<mid>`，`PUT …/<mid>/name`，`POST …/<mid>/run`，`POST …/<mid>/publish` |
| 照片模型文件 | `GET /files/<pid>/<mid>/<path>` |
| 已发布的照片房子 | `GET /api/projects/<pid>/typologies`，`DELETE …/<mid>`，`PUT …/<mid>/preview`；文件在 `GET /data/projects/<pid>/typologies/<mid>/<path>` |
| 项目素材 | `POST /api/projects/<pid>/media/<captures|context>`（multipart `files`），`DELETE /api/projects/<pid>/media/<path>`；文件在 `GET /data/projects/<pid>/media/<path>` |
| AI 出图 | `GET /api/render-options`（氛围参数，来自 `prompts/options.toml`）；`POST /api/projects/<pid>/renders` `{sourceUrl, contextUrls, options}`（未配置 `OPENAI_API_KEY` 时 409），`GET …/renders/<rid>` 轮询状态，done 时带 `resultUrl` |

旧接口 `/api/uploads`、`/api/typologies…`、`/data/typologies/…` 已删除，不保留兼容。

| 环境变量 | 作用 |
|---|---|
| `FACADE_HTTP_PORT` | HTTP 端口，默认 8765 |
| `FACADE_DATA_DIR` | 数据根目录，默认仓库的 `./data` |
| `FACADE_AUTORUN=0` | 关闭上传后的自动建模 |
| `OPENAI_API_KEY` | AI 出图（仓库根目录 `.env`，服务启动时读取；已有环境变量优先） |
| `OPENAI_IMAGE_MODEL` | 出图模型，默认 `gpt-image-2.5-flare`；另有 `OPENAI_IMAGE_QUALITY`（默认 high）、`OPENAI_IMAGE_INPUT_FIDELITY`（默认不发送） |
| `FACADE_PROMPTS_DIR` | 换一个提示词目录（默认仓库根目录 `prompts/`：`render.txt`、`render-context.txt`） |
| `FACADE_CLAUDE_BIN` | `claude` 的路径（找不到时设置） |
| `FACADE_PHOTO_MODELS_DIR`、`FACADE_TYPOLOGIES_DIR` | 仅 MCP 子进程使用：某个项目的 `photo-models/` 和 `typologies/` 目录（自动建模会自动设置） |

## 代码结构

| 目录 | 职责 |
|---|---|
| `spec/` | HouseSpec 数据结构、校验、JSON Schema |
| `project/` | 照片模型目录（PhotoModelStore）、操作日志、构建版本、写锁 |
| `projects/` | 用户项目：目录表、`project.json` 读写与校验、revision 检查、迁移 |
| `photos/` | 照片矫正（透视 → 正视）与测量 |
| `assets/` + `../assets/` | 素材库：构件样式与材质 |
| `build/` | 体块、洞口、GLB、typology 导出、校验 |
| `preview/` | 正视图与叠加图 |
| `service/` | 三组操作：用户、LM 感知、LM 建模 |
| `rendering/` | 项目素材（截图、Context 照片）与 AI 出图任务（OpenAI images/edits，提示词在仓库根目录 `prompts/`） |
| `adapters/` | MCP（给 LM）与 HTTP（给查看页） |

默认数值集中在 `config/defaults.toml`。

## 测试

```bash
uv run pytest
```
