import json
import sys
import time
from pathlib import Path

from cleaner_worker import run_cleaner
from cluster_worker import run_cluster


TASK_REGISTRY = {
    "clean": run_cleaner,
    "cluster": run_cluster,
}


def run_one(task):
    name = str(task.get("taskName") or task.get("name") or "").strip()
    if name not in TASK_REGISTRY:
        raise ValueError(f"unknown worker task: {name}")

    payload = task.get("payload", [])
    started = time.perf_counter()
    result = TASK_REGISTRY[name](payload)
    result["workerTask"] = {
        "name": name,
        "durationMs": int((time.perf_counter() - started) * 1000),
    }
    return result


def run_queue(input_data):
    if isinstance(input_data, dict) and isinstance(input_data.get("tasks"), list):
        return {"results": [run_one(task) for task in input_data["tasks"]]}
    if isinstance(input_data, dict):
        return run_one(input_data)
    raise ValueError("task worker input must be an object with taskName/payload or tasks[]")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("missing input json path")
    input_path = Path(sys.argv[1])
    input_data = json.loads(input_path.read_text(encoding="utf-8-sig"))
    print(json.dumps(run_queue(input_data), ensure_ascii=False))


if __name__ == "__main__":
    main()
