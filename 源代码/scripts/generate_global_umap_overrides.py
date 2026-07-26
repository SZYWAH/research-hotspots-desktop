#!/usr/bin/env python3
"""Generate isolated, deterministic global E5 UMAP coordinate overrides.

This development tool opens the V20 SQLite library in read-only mode. It emits
only JSON coordinate overrides and audit reports; it never updates snapshots,
memberships, representative ranks, evidence, or application version constants.
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

# These must be fixed before importing NumPy/numba/UMAP.
os.environ.setdefault("NUMBA_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("PYTHONHASHSEED", "42")

import numpy as np

EXPECTED_UMAP_VERSION = "0.5.5"
EXPECTED_SCIPY_VERSION = "1.12.0"
TARGET_HOTSPOT_P95_RADIUS = 92.0
RANDOM_STATE = 42
CANDIDATES = (
    ("A", 15, 0.0),
    ("B", 30, 0.02),
    ("C", 60, 0.05),
)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--project-id", default="project-default")
    parser.add_argument(
        "--candidate",
        action="append",
        choices=("A", "B", "C"),
        help="Generate only selected candidates. May be repeated; defaults to all.",
    )
    parser.add_argument(
        "--determinism-check",
        action="store_true",
        help="Fit every selected candidate twice and require identical coordinate hashes.",
    )
    return parser.parse_args()


def require_dependencies():
    try:
        import scipy
        import sklearn
        import umap
    except ImportError as error:
        raise RuntimeError(
            "Missing UMAP experiment dependency in the selected Python environment: {}".format(error)
        )
    if scipy.__version__ != EXPECTED_SCIPY_VERSION:
        raise RuntimeError(
            "Locked scipy version mismatch: expected {}, found {}.".format(
                EXPECTED_SCIPY_VERSION, scipy.__version__
            )
        )
    if umap.__version__ != EXPECTED_UMAP_VERSION:
        raise RuntimeError(
            "Locked umap-learn version mismatch: expected {}, found {}.".format(
                EXPECTED_UMAP_VERSION, umap.__version__
            )
        )
    return scipy, sklearn, umap


def open_read_only(database_path):
    resolved = Path(database_path).resolve(strict=True)
    uri = "{}?mode=ro&immutable=1".format(resolved.as_uri())
    connection = sqlite3.connect(uri, uri=True)
    connection.execute("PRAGMA query_only=ON")
    return resolved, connection


def load_snapshot(connection, project_id):
    row = connection.execute(
        """
        SELECT state.active_snapshot_id,
               snapshot.algorithm_version,
               snapshot.layout_version,
               snapshot.projection_version,
               snapshot.embedding_model_id,
               snapshot.embedding_model_revision,
               snapshot.hotspot_identity_version,
               snapshot.paper_count,
               snapshot.hotspot_count,
               snapshot.membership_count
        FROM v20_analysis_state AS state
        JOIN v20_analysis_snapshots AS snapshot
          ON snapshot.project_id=state.project_id
         AND snapshot.id=state.active_snapshot_id
        WHERE state.project_id=?
        """,
        (project_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("No active V20 snapshot for project {}.".format(project_id))
    keys = (
        "snapshotId",
        "algorithmVersion",
        "layoutVersion",
        "projectionVersion",
        "embeddingModelId",
        "embeddingModelRevision",
        "hotspotIdentityVersion",
        "paperCount",
        "hotspotCount",
        "membershipCount",
    )
    state = dict(zip(keys, row))
    if state["paperCount"] != state["membershipCount"]:
        raise RuntimeError("Active V20 snapshot paper/membership counts differ.")
    return state


def load_hotspots(connection, project_id, snapshot_id):
    rows = connection.execute(
        """
        SELECT hotspot_id,x,y,z,paper_count
        FROM v20_hotspots
        WHERE project_id=? AND snapshot_id=?
        ORDER BY hotspot_id
        """,
        (project_id, snapshot_id),
    ).fetchall()
    hotspot_ids = [row[0] for row in rows]
    coordinates = np.asarray([row[1:4] for row in rows], dtype=np.float64)
    paper_counts = np.asarray([row[4] for row in rows], dtype=np.int64)
    return hotspot_ids, coordinates, paper_counts


def load_memberships_and_embeddings(connection, project_id, state):
    rows = connection.execute(
        """
        SELECT membership.paper_id,
               membership.hotspot_id,
               membership.representative_rank,
               membership.x,
               membership.y,
               membership.z,
               embedding.dimensions,
               embedding.encoding,
               embedding.vector_blob
        FROM v20_paper_memberships AS membership
        JOIN paper_semantic_embeddings AS embedding
          ON embedding.project_id=membership.project_id
         AND embedding.paper_id=membership.paper_id
         AND embedding.model_id=?
         AND embedding.model_revision=?
        WHERE membership.project_id=? AND membership.snapshot_id=?
        ORDER BY membership.paper_id
        """,
        (
            state["embeddingModelId"],
            state["embeddingModelRevision"],
            project_id,
            state["snapshotId"],
        ),
    ).fetchall()
    if len(rows) != state["paperCount"]:
        raise RuntimeError(
            "Embedding join count mismatch: expected {}, received {}.".format(
                state["paperCount"], len(rows)
            )
        )
    paper_ids = []
    hotspot_ids = []
    representative_ranks = []
    current_coordinates = np.empty((len(rows), 3), dtype=np.float64)
    embeddings = None
    input_hash = hashlib.sha256()
    membership_hash = hashlib.sha256()
    for index, row in enumerate(rows):
        paper_id, hotspot_id, representative_rank, x, y, z, dimensions, encoding, blob = row
        if encoding != "float16-le":
            raise RuntimeError("Unexpected embedding encoding for {}: {}.".format(paper_id, encoding))
        if len(blob) != dimensions * 2:
            raise RuntimeError("Embedding blob size mismatch for {}.".format(paper_id))
        if embeddings is None:
            embeddings = np.empty((len(rows), dimensions), dtype=np.float32)
        elif dimensions != embeddings.shape[1]:
            raise RuntimeError("Embedding dimensions are inconsistent.")
        embeddings[index] = np.frombuffer(blob, dtype="<f2").astype(np.float32)
        paper_ids.append(paper_id)
        hotspot_ids.append(hotspot_id)
        representative_ranks.append(representative_rank)
        current_coordinates[index] = (x, y, z)
        rank_text = "" if representative_rank is None else str(representative_rank)
        membership_record = "{}\0{}\0{}\n".format(paper_id, hotspot_id, rank_text).encode("utf-8")
        membership_hash.update(membership_record)
        input_hash.update(membership_record)
        input_hash.update(blob)
    if embeddings is None:
        raise RuntimeError("No semantic embeddings found.")
    return {
        "paperIds": paper_ids,
        "hotspotIds": hotspot_ids,
        "representativeRanks": representative_ranks,
        "currentCoordinates": current_coordinates,
        "embeddings": embeddings,
        "membershipHash": membership_hash.hexdigest(),
        "inputHash": input_hash.hexdigest(),
    }


def percentile(values, percentile_value):
    return float(np.percentile(np.asarray(values, dtype=np.float64), percentile_value))


def centroid_coordinates(paper_coordinates, membership_indexes, hotspot_count):
    sums = np.zeros((hotspot_count, 3), dtype=np.float64)
    counts = np.zeros(hotspot_count, dtype=np.int64)
    np.add.at(sums, membership_indexes, paper_coordinates)
    np.add.at(counts, membership_indexes, 1)
    if np.any(counts == 0):
        raise RuntimeError("At least one hotspot has no member papers.")
    return sums / counts[:, None]


def align_to_current_hotspots(paper_coordinates, hotspot_coordinates, current_hotspots):
    source_center = hotspot_coordinates.mean(axis=0)
    target_center = current_hotspots.mean(axis=0)
    centered_hotspots = hotspot_coordinates - source_center
    source_radii = np.linalg.norm(centered_hotspots, axis=1)
    source_p95 = percentile(source_radii, 95)
    if source_p95 <= 1e-12:
        raise RuntimeError("UMAP hotspot P95 radius is zero.")
    isotropic_scale = TARGET_HOTSPOT_P95_RADIUS / source_p95
    scaled_hotspots = centered_hotspots * isotropic_scale
    scaled_papers = (paper_coordinates - source_center) * isotropic_scale
    target_centered = current_hotspots - target_center
    u_matrix, _, vt_matrix = np.linalg.svd(scaled_hotspots.T @ target_centered)
    rotation = u_matrix @ vt_matrix
    aligned_hotspots = scaled_hotspots @ rotation + target_center
    aligned_papers = scaled_papers @ rotation + target_center
    aligned_p95 = percentile(
        np.linalg.norm(aligned_hotspots - aligned_hotspots.mean(axis=0), axis=1),
        95,
    )
    return aligned_papers, aligned_hotspots, isotropic_scale, rotation, aligned_p95


def coordinate_digest(papers, hotspots):
    digest = hashlib.sha256()
    digest.update(np.asarray(papers, dtype="<f8").tobytes(order="C"))
    digest.update(np.asarray(hotspots, dtype="<f8").tobytes(order="C"))
    return digest.hexdigest()


def fit_candidate(umap_module, embeddings, neighbors, min_dist):
    reducer = umap_module.UMAP(
        n_neighbors=neighbors,
        min_dist=min_dist,
        n_components=3,
        metric="cosine",
        random_state=RANDOM_STATE,
        transform_seed=RANDOM_STATE,
        n_jobs=1,
        low_memory=True,
        verbose=False,
    )
    return np.asarray(reducer.fit_transform(embeddings), dtype=np.float64)


def semantic_neighbor_indexes(embeddings):
    from sklearn.neighbors import NearestNeighbors

    sample_count = min(4096, embeddings.shape[0])
    sample_indexes = np.linspace(0, embeddings.shape[0] - 1, sample_count, dtype=np.int64)
    model = NearestNeighbors(n_neighbors=2, metric="cosine", n_jobs=1)
    model.fit(embeddings)
    _, indexes = model.kneighbors(embeddings[sample_indexes])
    return sample_indexes, indexes[:, 1]


def low_dimension_neighbor_metric(coordinates, sample_indexes, neighbor_indexes):
    neighbor_distances = np.linalg.norm(
        coordinates[sample_indexes] - coordinates[neighbor_indexes],
        axis=1,
    )
    rng = np.random.RandomState(RANDOM_STATE)
    random_indexes = rng.randint(0, coordinates.shape[0], size=sample_indexes.shape[0])
    conflicts = random_indexes == sample_indexes
    random_indexes[conflicts] = (random_indexes[conflicts] + 1) % coordinates.shape[0]
    random_distances = np.linalg.norm(
        coordinates[sample_indexes] - coordinates[random_indexes],
        axis=1,
    )
    neighbor_mean = float(neighbor_distances.mean())
    random_mean = float(random_distances.mean())
    return {
        "sampleCount": int(sample_indexes.shape[0]),
        "semanticNeighborMeanDistance3d": neighbor_mean,
        "randomPairMeanDistance3d": random_mean,
        "neighborToRandomRatio": neighbor_mean / max(1e-12, random_mean),
        "semanticNeighborsClearlyCloser": neighbor_mean < random_mean * 0.75,
    }


def write_json(path, value):
    encoded = (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
        + "\n"
    ).encode("utf-8")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(encoded)
    temporary.replace(path)
    return hashlib.sha256(encoded).hexdigest()


def main():
    args = parse_args()
    scipy, sklearn, umap_module = require_dependencies()
    database_path, connection = open_read_only(args.database_path)
    try:
        state = load_snapshot(connection, args.project_id)
        hotspot_ids, current_hotspots, hotspot_paper_counts = load_hotspots(
            connection, args.project_id, state["snapshotId"]
        )
        loaded = load_memberships_and_embeddings(connection, args.project_id, state)
    finally:
        connection.close()

    if len(hotspot_ids) != state["hotspotCount"]:
        raise RuntimeError("Hotspot count mismatch.")
    hotspot_index_by_id = dict((hotspot_id, index) for index, hotspot_id in enumerate(hotspot_ids))
    membership_indexes = np.asarray(
        [hotspot_index_by_id[hotspot_id] for hotspot_id in loaded["hotspotIds"]],
        dtype=np.int64,
    )
    actual_counts = np.bincount(membership_indexes, minlength=len(hotspot_ids))
    hotspot_count_mismatches = [
        {
            "hotspotId": hotspot_ids[index],
            "recordPaperCount": int(hotspot_paper_counts[index]),
            "membershipCount": int(actual_counts[index]),
        }
        for index in range(len(hotspot_ids))
        if hotspot_paper_counts[index] != actual_counts[index]
    ]
    if np.any(actual_counts == 0):
        raise RuntimeError("At least one V20 hotspot has no active membership.")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    sample_indexes, neighbor_indexes = semantic_neighbor_indexes(loaded["embeddings"])
    selected = set(args.candidate or ("A", "B", "C"))
    reports = []

    for name, neighbors, min_dist in CANDIDATES:
        if name not in selected:
            continue
        raw_papers = fit_candidate(umap_module, loaded["embeddings"], neighbors, min_dist)
        raw_hotspots = centroid_coordinates(raw_papers, membership_indexes, len(hotspot_ids))
        papers, hotspots, isotropic_scale, rotation, hotspot_p95 = align_to_current_hotspots(
            raw_papers, raw_hotspots, current_hotspots
        )
        first_coordinate_hash = coordinate_digest(papers, hotspots)
        second_coordinate_hash = None
        if args.determinism_check:
            repeated_raw_papers = fit_candidate(
                umap_module, loaded["embeddings"], neighbors, min_dist
            )
            repeated_raw_hotspots = centroid_coordinates(
                repeated_raw_papers, membership_indexes, len(hotspot_ids)
            )
            repeated_papers, repeated_hotspots, _, _, _ = align_to_current_hotspots(
                repeated_raw_papers, repeated_raw_hotspots, current_hotspots
            )
            second_coordinate_hash = coordinate_digest(repeated_papers, repeated_hotspots)
            if second_coordinate_hash != first_coordinate_hash:
                raise RuntimeError("Candidate {} is not deterministic.".format(name))

        local_distances = np.linalg.norm(papers - hotspots[membership_indexes], axis=1)
        local_p95 = percentile(local_distances, 95)
        projection_version = "global-e5-umap3-n{}-md{}-cosine-r42-v1".format(
            neighbors, format(min_dist, "g")
        )
        override = {
            "schemaVersion": 1,
            "snapshotId": state["snapshotId"],
            "paperLayoutVersion": "semantic-global-umap3-v4-experimental",
            "projectionVersion": projection_version,
            "paperLayoutCoordinateSpace": "global",
            "paperLayoutScaleMode": "shared",
            "paperLayoutLocalP95Radius": local_p95,
            "paperLayoutSharedScale": 1.0,
            "papers": [
                {
                    "id": paper_id,
                    "hotspotId": loaded["hotspotIds"][index],
                    "x": float(papers[index, 0]),
                    "y": float(papers[index, 1]),
                    "z": float(papers[index, 2]),
                }
                for index, paper_id in enumerate(loaded["paperIds"])
            ],
            "hotspots": [
                {
                    "id": hotspot_id,
                    "x": float(hotspots[index, 0]),
                    "y": float(hotspots[index, 1]),
                    "z": float(hotspots[index, 2]),
                }
                for index, hotspot_id in enumerate(hotspot_ids)
            ],
        }
        override_path = output_dir / "umap-{}-coordinate-override.json".format(name.lower())
        file_hash = write_json(override_path, override)
        neighbor_metric = low_dimension_neighbor_metric(
            papers, sample_indexes, neighbor_indexes
        )
        report = {
            "candidate": name,
            "parameters": {
                "nNeighbors": neighbors,
                "minDist": min_dist,
                "metric": "cosine",
                "nComponents": 3,
                "randomState": RANDOM_STATE,
                "threads": 1,
            },
            "versions": {
                "python": sys.version.split()[0],
                "numpy": np.__version__,
                "scipy": scipy.__version__,
                "scikitLearn": sklearn.__version__,
                "umapLearn": umap_module.__version__,
            },
            "databasePath": str(database_path),
            "projectId": args.project_id,
            "snapshot": state,
            "inputHash": loaded["inputHash"],
            "membershipRepresentativeHash": loaded["membershipHash"],
            "existingHotspotPaperCountMismatchCount": len(hotspot_count_mismatches),
            "existingHotspotPaperCountMismatches": hotspot_count_mismatches,
            "paperCount": len(loaded["paperIds"]),
            "hotspotCount": len(hotspot_ids),
            "isotropicScale": isotropic_scale,
            "hotspotP95Radius": hotspot_p95,
            "localPaperToHotspotP95Radius": local_p95,
            "orthogonalAlignmentDeterminant": float(np.linalg.det(rotation)),
            "coordinateHashFirstRun": first_coordinate_hash,
            "coordinateHashSecondRun": second_coordinate_hash,
            "deterministic": (
                second_coordinate_hash == first_coordinate_hash
                if args.determinism_check
                else None
            ),
            "coordinateOverridePath": str(override_path),
            "coordinateOverrideSha256": file_hash,
            "semanticNeighborMetric": neighbor_metric,
            "businessDataChanged": False,
        }
        write_json(
            output_dir / "umap-{}-report.json".format(name.lower()),
            report,
        )
        reports.append(report)
        print(
            "UMAP-{}: papers={}, hotspots={}, sha256={}, neighbor/random={:.4f}".format(
                name,
                len(loaded["paperIds"]),
                len(hotspot_ids),
                file_hash,
                neighbor_metric["neighborToRandomRatio"],
            ),
            flush=True,
        )

    summary = {
        "schemaVersion": 1,
        "databaseReadOnly": True,
        "projectId": args.project_id,
        "snapshot": state,
        "paperCount": len(loaded["paperIds"]),
        "hotspotCount": len(hotspot_ids),
        "membershipRepresentativeHash": loaded["membershipHash"],
        "existingHotspotPaperCountMismatchCount": len(hotspot_count_mismatches),
        "existingHotspotPaperCountMismatches": hotspot_count_mismatches,
        "inputHash": loaded["inputHash"],
        "targetHotspotP95Radius": TARGET_HOTSPOT_P95_RADIUS,
        "candidates": reports,
    }
    write_json(output_dir / "umap-experiment-summary.json", summary)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("GLOBAL_UMAP_EXPERIMENT_FAILED: {}".format(error), file=sys.stderr)
        sys.exit(1)
