use std::cmp::Ordering;
use std::collections::HashMap;

use half::f16;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SEMANTIC_LAYOUT_VERSION: &str = "semantic-e5-pca3-v1";
pub const SEMANTIC_PROJECTION_VERSION: &str = "robust-pca-whiten-v1";
pub const SEMANTIC_MODEL_ID: &str = "intfloat/multilingual-e5-small";
pub const SEMANTIC_MODEL_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
pub const SEMANTIC_EMBEDDING_DIMENSIONS: usize = 384;

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
    if let Some((pivot, _)) = vector.iter().enumerate().max_by(|left, right| {
        left.1
            .abs()
            .partial_cmp(&right.1.abs())
            .unwrap_or(Ordering::Equal)
    }) {
        if vector[pivot] < 0.0 {
            for value in &mut vector {
                *value = -*value;
            }
        }
    }
    vector
}

fn percentile_abs(values: &[f64], percentile: f64) -> f64 {
    let mut sorted = values.iter().map(|value| value.abs()).collect::<Vec<_>>();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    if sorted.is_empty() {
        return 1.0;
    }
    let index = ((sorted.len() - 1) as f64 * percentile.clamp(0.0, 1.0)).round() as usize;
    sorted[index].max(1e-9)
}

fn stable_unit(value: &str, axis: u8) -> f64 {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hasher.update([axis]);
    let digest = hasher.finalize();
    let bits = u64::from_le_bytes(digest[0..8].try_into().unwrap_or([0; 8]));
    bits as f64 / u64::MAX as f64
}

fn decorrelate_and_robust_scale(points: &mut [[f64; 3]]) {
    if points.is_empty() {
        return;
    }
    let mut means = [0.0; 3];
    for point in points.iter() {
        for axis in 0..3 {
            means[axis] += point[axis];
        }
    }
    for mean in &mut means {
        *mean /= points.len() as f64;
    }
    for point in points.iter_mut() {
        for axis in 0..3 {
            point[axis] -= means[axis];
        }
    }

    // A nonlinear radial envelope can reintroduce covariance after PCA. Remove it with a
    // deterministic residual whitening pass. The sequential residuals are equivalent to a
    // three-axis Gram-Schmidt operation in sample space and preserve the semantic neighbourhood.
    for axis in 1..3 {
        for previous in 0..axis {
            let variance = points
                .iter()
                .map(|point| point[previous] * point[previous])
                .sum::<f64>();
            if variance <= 1e-12 {
                continue;
            }
            let covariance = points
                .iter()
                .map(|point| point[axis] * point[previous])
                .sum::<f64>();
            let coefficient = covariance / variance;
            for point in points.iter_mut() {
                point[axis] -= coefficient * point[previous];
            }
        }
    }

    let scales = [0, 1, 2].map(|axis| {
        percentile_abs(
            &points
                .iter()
                .map(|point| point[axis])
                .collect::<Vec<_>>(),
            0.90,
        )
    });
    for point in points.iter_mut() {
        for axis in 0..3 {
            point[axis] /= scales[axis];
        }
    }
}

pub fn project_semantic_embeddings(
    records: &[SemanticEmbeddingRecord],
) -> Result<HashMap<String, SemanticPoint3>, String> {
    if records.is_empty() {
        return Ok(HashMap::new());
    }
    let dimensions = records[0].vector.len();
    if dimensions == 0
        || records
            .iter()
            .any(|record| record.vector.len() != dimensions)
    {
        return Err("SEMANTIC_EMBEDDING_DIMENSIONS_MISMATCH".into());
    }
    let mut means = vec![0.0; dimensions];
    for record in records {
        for (mean, value) in means.iter_mut().zip(&record.vector) {
            *mean += f64::from(*value);
        }
    }
    for mean in &mut means {
        *mean /= records.len() as f64;
    }
    let centered = records
        .iter()
        .map(|record| {
            record
                .vector
                .iter()
                .enumerate()
                .map(|(index, value)| f64::from(*value) - means[index])
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let mut basis = Vec::with_capacity(3);
    for component in 0..3 {
        basis.push(deterministic_component(&centered, &basis, component));
    }
    let mut axes = [
        Vec::with_capacity(records.len()),
        Vec::with_capacity(records.len()),
        Vec::with_capacity(records.len()),
    ];
    for row in &centered {
        for axis in 0..3 {
            axes[axis].push(dot(row, &basis[axis]));
        }
    }
    let scales = [
        percentile_abs(&axes[0], 0.90),
        percentile_abs(&axes[1], 0.90),
        percentile_abs(&axes[2], 0.90),
    ];
    let mut coordinates = Vec::with_capacity(records.len());
    for (index, record) in records.iter().enumerate() {
        let mut coordinate = [
            (axes[0][index] / scales[0]).tanh(),
            (axes[1][index] / scales[1]).tanh(),
            (axes[2][index] / scales[2]).tanh(),
        ];
        let jitter = [
            stable_unit(&record.paper_id, 0) * 2.0 - 1.0,
            stable_unit(&record.paper_id, 1) * 2.0 - 1.0,
            stable_unit(&record.paper_id, 2) * 2.0 - 1.0,
        ];
        let raw_radius = dot(&coordinate, &coordinate).sqrt();
        if raw_radius < 0.025 {
            for axis in 0..3 {
                coordinate[axis] += jitter[axis] * 0.015;
            }
        }
        let radius = dot(&coordinate, &coordinate).sqrt().max(1e-9);
        // Continuous soft-core mapping: keep the centre clear without collapsing papers onto a ring.
        let mapped_radius = 0.22 + 0.78 * (1.0 - (-1.15 * radius).exp());
        for value in &mut coordinate {
            *value = (*value / radius) * mapped_radius;
        }
        coordinates.push(coordinate);
    }
    decorrelate_and_robust_scale(&mut coordinates);

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
        assert!(minimum / maximum.max(1e-12) >= 0.55);
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
