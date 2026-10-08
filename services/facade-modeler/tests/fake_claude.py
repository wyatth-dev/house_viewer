"""假的 claude 命令：用于测试自动建模任务，不调用真正的 Claude。

行为由环境变量控制：
  FAKE_CLAUDE_EXIT   退出码（默认 0）
  FAKE_CLAUDE_SLEEP  运行多少秒（默认 0）
  FAKE_CLAUDE_MARK   每次运行在这个文件里追加一行参数，便于测试检查调用次数和参数
"""
import json
import os
import sys
import time

mark = os.environ.get("FAKE_CLAUDE_MARK")
if mark:
    with open(mark, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(sys.argv[1:]) + "\n")
print(json.dumps({"type": "system", "subtype": "init"}), flush=True)
time.sleep(float(os.environ.get("FAKE_CLAUDE_SLEEP", "0")))
code = int(os.environ.get("FAKE_CLAUDE_EXIT", "0"))
if code:
    print("fake failure: something went wrong", file=sys.stderr, flush=True)
print(json.dumps({"type": "result", "subtype": "success" if code == 0 else "error"}), flush=True)
sys.exit(code)
