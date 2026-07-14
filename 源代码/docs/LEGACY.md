# Legacy Runtime Notes

V3 keeps the final user-facing runtime as a Tauri desktop executable.

The following files are retained as historical migration references only:

- `app17.py`: legacy Streamlit-style integrated application.
- `Dockerfile`, `Dockerfile_app17_cnki`, `.dockerignore`, `docker-compose.yml`: old container deployment path.
- `init.sql`: old MySQL schema/bootstrap reference.
- `requirements_docker_cnki.txt`: dependency list for the old Docker/CNKI route.
- `chuli2.py`: heavy BERTopic/UMAP/HDBSCAN hotspot-modeling prototype. V3 migrates its idea into `workers/cluster_worker.py` with a lightweight local keyword clustering worker.

These files are not required to run the V3 desktop application. The active runtime path is:

1. `src/` React desktop UI.
2. `src/data/researchStore.ts` IndexedDB local data layer.
3. `src-tauri/` Rust/Tauri desktop backend.
4. `workers/task_worker.py` Python worker dispatcher.
5. `workers/cleaner_worker.py` and `workers/cluster_worker.py` local worker tasks.

Do not introduce Streamlit, Docker, or MySQL as required dependencies for the desktop executable unless a later version explicitly changes the product direction.
