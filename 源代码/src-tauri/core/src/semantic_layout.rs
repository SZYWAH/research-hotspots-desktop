use std::cmp::Ordering;
use std::collections::HashMap;

use half::f16;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SEMANTIC_LAYOUT_VERSION: &str = "semantic-hierarchical-natural-pca3-v3";
pub const SEMANTIC_PROJECTION_VERSION: &str = "global-centroid-pca3-local-raw-pca3-v3";
pub const SEMANTIC_MODEL_ID: &str = "intfloat/multilingual-e5-small";
pub const SEMANTIC_MODEL_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
pub const SEMANTIC_EMBEDDING_DIMENSIONS: usize = 384;
pub const SEMANTIC_HOTSPOT_P95_RADIUS: f64 = 92.0;
pub const SEMANTIC_LOCAL_P95_RADIUS: f64 = 10.5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticPaperDocument {
    pub paper_id: String,
    pub title: String,
    pub field: String,
    pub categories: Option<String>,
    pub abstract_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEmbeddingRecord {
    pub paper_id: String,
    pub content_sha256: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticPoint3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SemanticLocalScaleSummary {
    pub raw_p95_radius: f64,
    pub raw_p99_radius: f64,
    pub shared_scale: f64,
    pub target_p95_radius: f64,
}

pub fn orthogonal_procrustes_3d(
    source: &[[f64; 3]],
    target: &[[f64; 3]],
) -> Result<[[f64; 3]; 3], String> {
    if source.len() != target.len() || source.len() < 3 {
        return Err("SEMANTIC_PROCRUSTES_INPUT_INVALID".into());
    }
    fn candidate(
        source: &[[f64; 3]],
        target: &[[f64; 3]],
        reflected: bool,
    ) -> ([[f64; 3]; 3], f64) {
        let mut cross = [[0.0; 3]; 3];
        for (from, to) in source.iter().zip(target) {
            let from = [
                if reflected { -from[0] } else { from[0] },
                from[1],
                from[2],
            ];
            for row in 0..3 {
                for column in 0..3 {
                    cross[row][column] += from[row] * to[column];
                }
            }
        }
        let [sxx, sxy, sxz] = cross[0];
        let [syx, syy, syz] = cross[1];
        let [szx, szy, szz] = cross[2];
        let mut horn = [
            [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
            [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
            [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
            [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
        ];
        let shift = horn
            .iter()
            .flat_map(|row| row.iter())
            .map(|value| value.abs())
            .sum::<f64>()
            .max(1.0);
        for (axis, row) in horn.iter_mut().enumerate() {
            row[axis] += shift;
        }
        let mut quaternion = [1.0, 0.0, 0.0, 0.0];
        for _ in 0..128 {
            let mut next = [0.0; 4];
            for row in 0..4 {
                next[row] = (0..4)
                    .map(|column| horn[row][column] * quaternion[column])
                    .sum();
            }
            let norm = next.iter().map(|value| value * value).sum::<f64>().sqrt();
            if norm <= 1e-12 {
                break;
            }
            for value in &mut next {
                *value /= norm;
            }
            quaternion = next;
        }
        let [w, x, y, z] = quaternion;
        let mut matrix = [
            [
                1.0 - 2.0 * (y * y + z * z),
                2.0 * (x * y - z * w),
                2.0 * (x * z + y * w),
            ],
            [
                2.0 * (x * y + z * w),
                1.0 - 2.0 * (x * x + z * z),
                2.0 * (y * z - x * w),
            ],
            [
                2.0 * (x * z - y * w),
                2.0 * (y * z + x * w),
                1.0 - 2.0 * (x * x + y * y),
            ],
        ];
        if reflected {
            for row in &mut matrix {
                row[0] = -row[0];
            }
        }
        let error = source
            .iter()
            .zip(target)
            .map(|(from, to)| {
                let aligned = multiply_matrix_vector_3d(&matrix, *from);
                (0..3)
                    .map(|axis| {
                        let delta = aligned[axis] - to[axis];
                        delta * delta
                    })
                    .sum::<f64>()
            })
            .sum();
        (matrix, error)
    }

    let proper = candidate(source, target, false);
    let reflected = candidate(source, target, true);
    Ok(if reflected.1 < proper.1 {
        reflected.0
    } else {
        proper.0
    })
}

pub fn multiply_matrix_vector_3d(matrix: &[[f64; 3]; 3], vector: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|row| {
        (0..3)
            .map(|column| matrix[row][column] * vector[column])
            .sum()
    })
}

pub fn semantic_hotspot_identity_key(field: &str, keyword: &str) -> String {
    fn normalize(value: &str) -> String {
        value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_lowercase()
    }
    format!("{}::{}", normalize(field), normalize(keyword))
}

pub fn semantic_hotspot_identity_sha256(identity_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(identity_key.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn stable_semantic_hotspot_id(project_id: &str, identity_key: &str) -> String {
    format!(
        "{project_id}:sqlite-cluster:v2:{}",
        semantic_hotspot_identity_sha256(identity_key)
    )
}

pub fn normalize_semantic_document(document: &SemanticPaperDocument) -> String {
    fn clean(value: &str) -> String {
        value.split_whitespace().collect::<Vec<_>>().join(" ")
    }
    let title = clean(&document.title);
    let field = clean(&document.field);
    let categories = clean(document.categories.as_deref().unwrap_or_default());
    let abstract_text = clean(&document.abstract_text);
    // E5 expects passage/query prefixes. Keep a deterministic character bound; the tokenizer
    // applies the authoritative 512-token limit at inference time.
    let mut value = format!(
        "passage: title: {title}\nfield: {field}\ncategories: {categories}\nabstract: {abstract_text}"
    );
    if value.chars().count() > 8_192 {
        value = value.chars().take(8_192).collect();
    }
    value
}

pub fn semantic_content_sha256(document: &SemanticPaperDocument) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_semantic_document(document).as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn encode_float16_le(vector: &[f32]) -> Vec<u8> {
    let mut encoded = Vec::with_capacity(vector.len() * 2);
    for value in vector {
        encoded.extend_from_slice(&f16::from_f32(*value).to_bits().to_le_bytes());
    }
    encoded
}

pub fn decode_float16_le(bytes: &[u8], dimensions: usize) -> Result<Vec<f32>, String> {
    if bytes.len() != dimensions.saturating_mul(2) {
        return Err("SEMANTIC_EMBEDDING_BLOB_SIZE_MISMATCH".into());
    }
    Ok(bytes
        .chunks_exact(2)
        .map(|chunk| f16::from_bits(u16::from_le_bytes([chunk[0], chunk[1]])).to_f32())
        .collect())
}

pub fn read_cached_embeddings(
    conn: &Connection,
    project_id: &str,
    documents: &[SemanticPaperDocument],
) -> Result<HashMap<String, SemanticEmbeddingRecord>, String> {
    let mut statement = conn
        .prepare(
            "SELECT content_sha256, dimensions, vector_blob
             FROM paper_semantic_embeddings
             WHERE project_id=?1 AND paper_id=?2 AND model_id=?3 AND model_revision=?4
               AND content_sha256=?5
             LIMIT 1",
        )
        .map_err(|error| error.to_string())?;
    let mut records = HashMap::new();
    for document in documents {
        let content_sha256 = semantic_content_sha256(document);
        let row = statement
            .query_row(
                params![
                    project_id,
                    document.paper_id,
                    SEMANTIC_MODEL_ID,
                    SEMANTIC_MODEL_REVISION,
                    content_sha256
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, Vec<u8>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if let Some((content_sha256, dimensions, blob)) = row {
            let dimensions = usize::try_from(dimensions)
                .map_err(|_| "SEMANTIC_EMBEDDING_DIMENSIONS_INVALID".to_string())?;
            let vector = decode_float16_le(&blob, dimensions)?;
            if dimensions != SEMANTIC_EMBEDDING_DIMENSIONS {
                return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
            }
            records.insert(
                document.paper_id.clone(),
                SemanticEmbeddingRecord {
                    paper_id: document.paper_id.clone(),
                    content_sha256,
                    vector,
                },
            );
        }
    }
    Ok(records)
}

pub fn write_cached_embeddings(
    tx: &Transaction<'_>,
    project_id: &str,
    records: &[SemanticEmbeddingRecord],
    now_ms: i64,
) -> Result<(), String> {
    let mut statement = tx
        .prepare(
            "INSERT OR IGNORE INTO paper_semantic_embeddings(
               project_id,paper_id,content_sha256,model_id,model_revision,
               dimensions,encoding,vector_blob,created_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,'float16-le',?7,?8)",
        )
        .map_err(|error| error.to_string())?;
    for record in records {
        if record.vector.len() != SEMANTIC_EMBEDDING_DIMENSIONS {
            return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
        }
        statement
            .execute(params![
                project_id,
                record.paper_id,
                record.content_sha256,
                SEMANTIC_MODEL_ID,
                SEMANTIC_MODEL_REVISION,
                SEMANTIC_EMBEDDING_DIMENSIONS as i64,
                encode_float16_le(&record.vector),
                now_ms
            ])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn write_cached_embeddings_autocommit(
    conn: &Connection,
    project_id: &str,
    records: &[SemanticEmbeddingRecord],
    now_ms: i64,
) -> Result<(), String> {
    let mut statement = conn
        .prepare(
            "INSERT OR IGNORE INTO paper_semantic_embeddings(
               project_id,paper_id,content_sha256,model_id,model_revision,
               dimensions,encoding,vector_blob,created_at_ms
             ) VALUES(?1,?2,?3,?4,?5,?6,'float16-le',?7,?8)",
        )
        .map_err(|error| error.to_string())?;
    for record in records {
        if record.vector.len() != SEMANTIC_EMBEDDING_DIMENSIONS {
            return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
        }
        statement
            .execute(params![
                project_id,
                record.paper_id,
                record.content_sha256,
                SEMANTIC_MODEL_ID,
                SEMANTIC_MODEL_REVISION,
                SEMANTIC_EMBEDDING_DIMENSIONS as i64,
                encode_float16_le(&record.vector),
                now_ms
            ])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter().zip(right).map(|(a, b)| a * b).sum()
}

fn normalize(vector: &mut [f64]) -> f64 {
    let norm = dot(vector, vector).sqrt();
    if norm > 1e-12 {
        for value in vector {
            *value /= norm;
        }
    }
    norm
}

fn covariance_mul(centered: &[Vec<f64>], vector: &[f64]) -> Vec<f64> {
    let mut output = vec![0.0; vector.len()];
    let denominator = centered.len().saturating_sub(1).max(1) as f64;
    for row in centered {
        let scale = dot(row, vector) / denominator;
        for (target, value) in output.iter_mut().zip(row) {
            *target += value * scale;
        }
    }
    output
}

fn deterministic_component(
    centered: &[Vec<f64>],
    previous: &[Vec<f64>],
    component_index: usize,
) -> Vec<f64> {
    let dimensions = centered.first().map_or(0, Vec::len);
    let mut vector = (0..dimensions)
        .map(|index| {
            let angle = ((index + 1) * (component_index + 3)) as f64;
            angle.sin() + 0.5 * (angle * 0.618_033_988_75).cos()
        })
        .collect::<Vec<_>>();
    for basis in previous {
        let projection = dot(&vector, basis);
        for (value, basis_value) in vector.iter_mut().zip(basis) {
            *value -= projection * basis_value;
        }
    }
    if normalize(&mut vector) <= 1e-12 && dimensions > component_index {
        vector.fill(0.0);
        vector[component_index] = 1.0;
    }
    for _ in 0..96 {
        let mut next = covariance_mul(centered, &vector);
        for basis in previous {
            let projection = dot(&next, basis);
            for (value, basis_value) in next.iter_mut().zip(basis) {
                *value -= projection * basis_value;
            }
        }
        if normalize(&mut next) <= 1e-12 {
            break;
        }
        vector = next;
    }
    let pivot = vector.iter().enumerate().fold(None, |best, (index, value)| {
        let magnitude = value.abs();
        match best {
            None => Some((index, magnitude)),
            Some((best_index, best_magnitude))
                if magnitude > best_magnitude + 1e-15
                    || ((magnitude - best_magnitude).abs() <= 1e-15
                        && index < best_index) =>
            {
                Some((index, magnitude))
            }
            Some(previous) => Some(previous),
        }
    });
    if let Some((pivot, _)) = pivot {
        if vector[pivot] < 0.0 {
            for value in &mut vector {
                *value = -*value;
            }
        }
    }
    vector
}

fn percentile(values: &[f64], percentile: f64) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    if sorted.is_empty() {
        return 0.0;
    }
    let index = ((sorted.len() - 1) as f64 * percentile.clamp(0.0, 1.0)).round() as usize;
    sorted[index]
}

fn point_radius(point: &[f64; 3]) -> f64 {
    dot(point, point).sqrt()
}

fn soft_cap_radius(point: &mut [f64; 3], p99_radius: f64) {
    let radius = point_radius(point);
    if radius <= p99_radius || radius <= 1e-12 || p99_radius <= 1e-12 {
        return;
    }
    let tail = 0.25 * p99_radius;
    let capped_radius = p99_radius + tail * ((radius - p99_radius) / tail).tanh();
    let scale = capped_radius / radius;
    for value in point {
        *value *= scale;
    }
}

fn normalized_centered_rows(
    records: &[SemanticEmbeddingRecord],
    expected_dimensions: Option<usize>,
) -> Result<Vec<Vec<f64>>, String> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let dimensions = records[0].vector.len();
    if dimensions == 0
        || expected_dimensions.is_some_and(|expected| expected != dimensions)
        || records.iter().any(|record| record.vector.len() != dimensions)
    {
        return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
    }
    let mut normalized = Vec::with_capacity(records.len());
    for record in records {
        let mut row = record
            .vector
            .iter()
            .map(|value| f64::from(*value))
            .collect::<Vec<_>>();
        if normalize(&mut row) <= 1e-12 {
            return Err("SEMANTIC_HOTSPOT_MEMBER_VECTOR_ZERO".into());
        }
        normalized.push(row);
    }
    let mut means = vec![0.0; dimensions];
    for row in &normalized {
        for (mean, value) in means.iter_mut().zip(row) {
            *mean += value;
        }
    }
    for mean in &mut means {
        *mean /= normalized.len() as f64;
    }
    Ok(normalized
        .into_iter()
        .map(|row| {
            row.into_iter()
                .zip(&means)
                .map(|(value, mean)| value - mean)
                .collect()
        })
        .collect())
}

fn project_raw_pca3(
    records: &[SemanticEmbeddingRecord],
    expected_dimensions: Option<usize>,
) -> Result<Vec<[f64; 3]>, String> {
    let centered = normalized_centered_rows(records, expected_dimensions)?;
    if centered.is_empty() {
        return Ok(Vec::new());
    }
    let mut basis = Vec::with_capacity(3);
    for component in 0..3 {
        basis.push(deterministic_component(&centered, &basis, component));
    }
    Ok(centered
        .iter()
        .map(|row| {
            [
                dot(row, &basis[0]),
                dot(row, &basis[1]),
                dot(row, &basis[2]),
            ]
        })
        .collect())
}

pub fn semantic_centroid_record(
    hotspot_id: &str,
    records: &[SemanticEmbeddingRecord],
) -> Result<SemanticEmbeddingRecord, String> {
    if records.is_empty() {
        return Err("SEMANTIC_HOTSPOT_CENTROID_EMPTY".into());
    }
    let dimensions = records[0].vector.len();
    if dimensions != SEMANTIC_EMBEDDING_DIMENSIONS
        || records.iter().any(|record| record.vector.len() != dimensions)
    {
        return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
    }
    let mut centroid = vec![0.0_f64; dimensions];
    let mut paper_ids = records
        .iter()
        .map(|record| record.paper_id.as_str())
        .collect::<Vec<_>>();
    paper_ids.sort_unstable();
    for record in records {
        let norm = record
            .vector
            .iter()
            .map(|value| f64::from(*value).powi(2))
            .sum::<f64>()
            .sqrt();
        if norm <= 1e-12 {
            return Err("SEMANTIC_HOTSPOT_MEMBER_VECTOR_ZERO".into());
        }
        for (target, value) in centroid.iter_mut().zip(&record.vector) {
            *target += f64::from(*value) / norm;
        }
    }
    let norm = centroid.iter().map(|value| value * value).sum::<f64>().sqrt();
    if norm <= 1e-12 {
        return Err("SEMANTIC_HOTSPOT_CENTROID_DEGENERATE".into());
    }
    let mut content_hasher = Sha256::new();
    for paper_id in paper_ids {
        content_hasher.update(paper_id.as_bytes());
        content_hasher.update([0]);
    }
    Ok(SemanticEmbeddingRecord {
        paper_id: hotspot_id.to_string(),
        content_sha256: format!("{:x}", content_hasher.finalize()),
        vector: centroid
            .into_iter()
            .map(|value| (value / norm) as f32)
            .collect(),
    })
}

pub fn project_semantic_hotspot_centroids(
    records: &[SemanticEmbeddingRecord],
) -> Result<HashMap<String, SemanticPoint3>, String> {
    if records.len() < 4 {
        return Err("SEMANTIC_HOTSPOT_PROJECTION_TOO_SMALL".into());
    }
    let mut coordinates =
        project_raw_pca3(records, Some(SEMANTIC_EMBEDDING_DIMENSIONS))?;
    let radii = coordinates.iter().map(point_radius).collect::<Vec<_>>();
    let p95_radius = percentile(&radii, 0.95);
    let p99_radius = percentile(&radii, 0.99);
    if p95_radius <= 1e-12 {
        return Err("SEMANTIC_HOTSPOT_PROJECTION_RANK_DEFICIENT".into());
    }
    for coordinate in &mut coordinates {
        soft_cap_radius(coordinate, p99_radius);
    }
    let scale = SEMANTIC_HOTSPOT_P95_RADIUS / p95_radius;
    let mut points = HashMap::with_capacity(records.len());
    for (record, coordinate) in records.iter().zip(coordinates) {
        points.insert(
            record.paper_id.clone(),
            SemanticPoint3 {
                x: coordinate[0] * scale,
                y: coordinate[1] * scale,
                z: coordinate[2] * scale,
            },
        );
    }
    Ok(points)
}

pub fn project_semantic_embeddings(
    records: &[SemanticEmbeddingRecord],
) -> Result<HashMap<String, SemanticPoint3>, String> {
    if records.is_empty() {
        return Ok(HashMap::new());
    }
    let coordinates = project_raw_pca3(records, None)?;
    let mut points = HashMap::with_capacity(records.len());
    for (record, coordinate) in records.iter().zip(coordinates) {
        points.insert(
            record.paper_id.clone(),
            SemanticPoint3 {
                x: coordinate[0],
                y: coordinate[1],
                z: coordinate[2],
            },
        );
    }
    Ok(points)
}

pub fn scale_semantic_local_point_sets(
    point_sets: &mut [HashMap<String, SemanticPoint3>],
) -> Result<SemanticLocalScaleSummary, String> {
    let radii = point_sets
        .iter()
        .flat_map(|points| points.values())
        .map(|point| (point.x * point.x + point.y * point.y + point.z * point.z).sqrt())
        .collect::<Vec<_>>();
    if radii.is_empty() {
        return Err("SEMANTIC_LOCAL_PROJECTION_EMPTY".into());
    }
    let raw_p95_radius = percentile(&radii, 0.95);
    let raw_p99_radius = percentile(&radii, 0.99);
    if raw_p95_radius <= 1e-12 || raw_p99_radius <= 1e-12 {
        return Err("SEMANTIC_LOCAL_PROJECTION_DEGENERATE".into());
    }
    let shared_scale = SEMANTIC_LOCAL_P95_RADIUS / raw_p95_radius;
    for point in point_sets.iter_mut().flat_map(HashMap::values_mut) {
        let mut coordinate = [point.x, point.y, point.z];
        soft_cap_radius(&mut coordinate, raw_p99_radius);
        point.x = coordinate[0] * shared_scale;
        point.y = coordinate[1] * shared_scale;
        point.z = coordinate[2] * shared_scale;
    }
    Ok(SemanticLocalScaleSummary {
        raw_p95_radius,
        raw_p99_radius,
        shared_scale,
        target_p95_radius: SEMANTIC_LOCAL_P95_RADIUS,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_records(count: usize) -> Vec<SemanticEmbeddingRecord> {
        (0..count)
            .map(|row| {
                let vector = (0..SEMANTIC_EMBEDDING_DIMENSIONS)
                    .map(|column| {
                        let a = (row + 1) as f32 * 0.071;
                        let b = (column + 3) as f32 * 0.013;
                        (a.sin() * b.cos()) + ((row * (column + 11)) % 17) as f32 * 0.004
                    })
                    .collect();
                SemanticEmbeddingRecord {
                    paper_id: format!("paper-{row:04}"),
                    content_sha256: format!("hash-{row}"),
                    vector,
                }
            })
            .collect()
    }

    #[test]
    fn float16_cache_round_trip_is_bounded() {
        let values = vec![-1.0, -0.12345, 0.0, 0.12345, 1.0];
        let decoded = decode_float16_le(&encode_float16_le(&values), values.len()).unwrap();
        assert!(values
            .iter()
            .zip(decoded)
            .all(|(expected, actual)| (expected - actual).abs() < 0.001));
    }

    #[test]
    fn projection_is_deterministic_and_three_dimensional() {
        let records = fixture_records(96);
        let first = project_semantic_embeddings(&records).unwrap();
        let second = project_semantic_embeddings(&records).unwrap();
        assert_eq!(first, second);
        let mut positive_octants = std::collections::HashSet::new();
        for point in first.values() {
            positive_octants.insert((point.x >= 0.0, point.y >= 0.0, point.z >= 0.0));
        }
        assert!(positive_octants.len() >= 6);
        let points = first.values().copied().collect::<Vec<_>>();
        let axes = [
            points.iter().map(|point| point.x).collect::<Vec<_>>(),
            points.iter().map(|point| point.y).collect::<Vec<_>>(),
            points.iter().map(|point| point.z).collect::<Vec<_>>(),
        ];
        fn correlation(left: &[f64], right: &[f64]) -> f64 {
            let left_mean = left.iter().sum::<f64>() / left.len() as f64;
            let right_mean = right.iter().sum::<f64>() / right.len() as f64;
            let covariance = left
                .iter()
                .zip(right)
                .map(|(a, b)| (a - left_mean) * (b - right_mean))
                .sum::<f64>();
            let left_norm = left
                .iter()
                .map(|value| (value - left_mean).powi(2))
                .sum::<f64>();
            let right_norm = right
                .iter()
                .map(|value| (value - right_mean).powi(2))
                .sum::<f64>();
            covariance / (left_norm * right_norm).sqrt().max(1e-12)
        }
        assert!(correlation(&axes[0], &axes[1]).abs() <= 0.10);
        assert!(correlation(&axes[0], &axes[2]).abs() <= 0.10);
        assert!(correlation(&axes[1], &axes[2]).abs() <= 0.10);
        let spans = axes.map(|axis| {
            let (minimum, maximum) = axis.iter().fold(
                (f64::INFINITY, f64::NEG_INFINITY),
                |(minimum, maximum), value| (minimum.min(*value), maximum.max(*value)),
            );
            maximum - minimum
        });
        let minimum = spans.iter().copied().fold(f64::INFINITY, f64::min);
        let maximum = spans.iter().copied().fold(0.0_f64, f64::max);
        let span_ratio = minimum / maximum.max(1e-12);
        assert!(span_ratio > 0.01, "the fixture must retain a non-zero third axis");
        assert!(span_ratio < 0.95, "raw PCA amplitudes must not be whitened into a sphere");
    }

    #[test]
    fn shared_local_scale_hits_the_global_target_without_per_hotspot_normalization() {
        let records = fixture_records(144);
        let mut point_sets = vec![
            project_semantic_embeddings(&records[..96]).unwrap(),
            project_semantic_embeddings(&records[96..]).unwrap(),
        ];
        let before_ratio = {
            let radii = point_sets
                .iter()
                .map(|points| {
                    let mut values = points
                        .values()
                        .map(|point| (point.x * point.x + point.y * point.y + point.z * point.z).sqrt())
                        .collect::<Vec<_>>();
                    values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
                    values[((values.len() - 1) as f64 * 0.90).round() as usize]
                })
                .collect::<Vec<_>>();
            radii[0] / radii[1].max(1e-12)
        };
        let summary = scale_semantic_local_point_sets(&mut point_sets).unwrap();
        let mut radii = point_sets
            .iter()
            .flat_map(|points| points.values())
            .map(|point| (point.x * point.x + point.y * point.y + point.z * point.z).sqrt())
            .collect::<Vec<_>>();
        radii.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
        let p95 = radii[((radii.len() - 1) as f64 * 0.95).round() as usize];
        let after_sets = point_sets
            .iter()
            .map(|points| {
                let mut values = points
                    .values()
                    .map(|point| (point.x * point.x + point.y * point.y + point.z * point.z).sqrt())
                    .collect::<Vec<_>>();
                values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
                values[((values.len() - 1) as f64 * 0.90).round() as usize]
            })
            .collect::<Vec<_>>();
        let after_ratio = after_sets[0] / after_sets[1].max(1e-12);
        assert!((p95 - SEMANTIC_LOCAL_P95_RADIUS).abs() <= 1e-6);
        assert!((before_ratio - after_ratio).abs() <= 1e-10);
        assert_eq!(summary.target_p95_radius, SEMANTIC_LOCAL_P95_RADIUS);
    }

    #[test]
    fn stable_hotspot_identity_does_not_depend_on_display_order() {
        let identity = semantic_hotspot_identity_key(" Quantum   Physics ", " Error Correction ");
        assert_eq!(identity, "quantum physics::error correction");
        let first = stable_semantic_hotspot_id("project", &identity);
        let second = stable_semantic_hotspot_id(
            "project",
            &semantic_hotspot_identity_key("quantum physics", "error correction"),
        );
        assert_eq!(first, second);
        assert_eq!(
            first,
            format!(
                "project:sqlite-cluster:v2:{}",
                semantic_hotspot_identity_sha256(&identity)
            )
        );
        assert_eq!(
            semantic_hotspot_identity_sha256(&identity).len(),
            64,
            "the complete SHA-256 must be retained"
        );
    }

    #[test]
    fn procrustes_recovers_rotation_and_reflection_without_rescaling() {
        let source = [
            [1.0, 2.0, 3.0],
            [-2.0, 1.0, 0.5],
            [0.25, -1.5, 2.0],
            [3.0, 0.5, -2.0],
        ];
        let expected = [[0.0, -1.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 0.0, 1.0]];
        let target = source.map(|point| multiply_matrix_vector_3d(&expected, point));
        let actual = orthogonal_procrustes_3d(&source, &target).expect("alignment");
        for (point, expected_point) in source.iter().zip(target) {
            let actual_point = multiply_matrix_vector_3d(&actual, *point);
            for axis in 0..3 {
                assert!((actual_point[axis] - expected_point[axis]).abs() < 1e-8);
            }
            let source_radius = point.iter().map(|value| value * value).sum::<f64>().sqrt();
            let actual_radius = actual_point
                .iter()
                .map(|value| value * value)
                .sum::<f64>()
                .sqrt();
            assert!((source_radius - actual_radius).abs() < 1e-10);
        }
    }

    #[test]
    fn hotspot_centroids_and_global_projection_are_deterministic_and_volumetric() {
        let member_records = fixture_records(160 * 4);
        let centroids = member_records
            .chunks_exact(4)
            .enumerate()
            .map(|(index, records)| {
                semantic_centroid_record(&format!("hotspot-{index:03}"), records).unwrap()
            })
            .collect::<Vec<_>>();
        let first = project_semantic_hotspot_centroids(&centroids).unwrap();
        let second = project_semantic_hotspot_centroids(&centroids).unwrap();
        assert_eq!(first, second);
        let mut octants = std::collections::HashSet::new();
        let points = first.values().copied().collect::<Vec<_>>();
        for point in &points {
            octants.insert((point.x >= 0.0, point.y >= 0.0, point.z >= 0.0));
        }
        assert!(octants.len() >= 6);
        let axes = [
            points.iter().map(|point| point.x).collect::<Vec<_>>(),
            points.iter().map(|point| point.y).collect::<Vec<_>>(),
            points.iter().map(|point| point.z).collect::<Vec<_>>(),
        ];
        fn correlation(left: &[f64], right: &[f64]) -> f64 {
            let left_mean = left.iter().sum::<f64>() / left.len() as f64;
            let right_mean = right.iter().sum::<f64>() / right.len() as f64;
            let covariance = left
                .iter()
                .zip(right)
                .map(|(a, b)| (a - left_mean) * (b - right_mean))
                .sum::<f64>();
            let left_norm = left
                .iter()
                .map(|value| (value - left_mean).powi(2))
                .sum::<f64>();
            let right_norm = right
                .iter()
                .map(|value| (value - right_mean).powi(2))
                .sum::<f64>();
            covariance / (left_norm * right_norm).sqrt().max(1e-12)
        }
        assert!(correlation(&axes[0], &axes[1]).abs() <= 0.10);
        assert!(correlation(&axes[0], &axes[2]).abs() <= 0.10);
        assert!(correlation(&axes[1], &axes[2]).abs() <= 0.10);
        let mut radii = points
            .iter()
            .map(|point| (point.x * point.x + point.y * point.y + point.z * point.z).sqrt())
            .collect::<Vec<_>>();
        radii.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
        let p95 = radii[((radii.len() - 1) as f64 * 0.95).round() as usize];
        assert!((p95 - SEMANTIC_HOTSPOT_P95_RADIUS).abs() <= 1e-6);
    }

    #[test]
    fn content_hash_changes_with_semantic_content() {
        let mut document = SemanticPaperDocument {
            paper_id: "paper".into(),
            title: "A title".into(),
            field: "Physics".into(),
            categories: Some("quantum".into()),
            abstract_text: "An abstract".into(),
        };
        let first = semantic_content_sha256(&document);
        document.abstract_text.push_str(" changed");
        assert_ne!(first, semantic_content_sha256(&document));
    }
}
