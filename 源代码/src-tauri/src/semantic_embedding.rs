use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use fastembed::{
    InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel,
};
#[cfg(windows)]
use ort::ep::DirectML;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use research_hotspots_core::semantic_layout::{
    decode_float16_le, encode_float16_le, normalize_semantic_document, read_cached_embeddings,
    semantic_content_sha256, write_cached_embeddings, write_cached_embeddings_autocommit,
    SemanticEmbeddingRecord, SemanticPaperDocument, SEMANTIC_EMBEDDING_DIMENSIONS,
    SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION,
};
use rusqlite::Connection;

pub const SEMANTIC_EMBEDDING_CHUNK_SIZE: usize = 256;
pub const DOCUMENT_INDEX_EMBEDDING_BATCH_SIZE: usize = 16;
const DOCUMENT_INDEX_CPU_INTRA_THREADS: usize = 2;
const DEFAULT_SEMANTIC_CPU_INTRA_THREADS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SemanticEmbeddingDevice {
    Cpu,
    Gpu,
}

impl SemanticEmbeddingDevice {
    pub fn parse(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("cpu").trim().to_ascii_lowercase().as_str() {
            "cpu" => Ok(Self::Cpu),
            "gpu" => Ok(Self::Gpu),
            _ => Err("SEMANTIC_EMBEDDING_DEVICE_INVALID".into()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticModelManifest {
    schema_version: u32,
    model_id: String,
    revision: String,
    dimensions: usize,
    files: SemanticModelFiles,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticModelFiles {
    cpu: SemanticModelFile,
    cpu_portable: SemanticModelFile,
    gpu: SemanticModelFile,
    tokenizer: SemanticModelFile,
    config: SemanticModelFile,
    special_tokens: SemanticModelFile,
    tokenizer_config: SemanticModelFile,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SemanticModelFile {
    target: String,
    size: u64,
    sha256: Option<String>,
}

fn safe_model_target(target: &str) -> Result<PathBuf, String> {
    if target.is_empty() || target.len() > 512 || target.contains('\0') {
        return Err("SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string());
    }
    let path = Path::new(target);
    if path.is_absolute() {
        return Err("SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string());
    }
    let mut has_component = false;
    for component in path.components() {
        match component {
            Component::Normal(value) if !value.to_string_lossy().contains(':') => {
                has_component = true;
            }
            _ => return Err("SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string()),
        }
    }
    has_component
        .then(|| path.to_path_buf())
        .ok_or_else(|| "SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string())
}

fn validate_manifest_targets(manifest: &SemanticModelManifest) -> Result<(), String> {
    for file in [
        &manifest.files.cpu,
        &manifest.files.cpu_portable,
        &manifest.files.gpu,
        &manifest.files.tokenizer,
        &manifest.files.config,
        &manifest.files.special_tokens,
        &manifest.files.tokenizer_config,
    ] {
        safe_model_target(&file.target)?;
    }
    Ok(())
}

fn select_cpu_model_file<'a>(
    model_root: &Path,
    manifest: &'a SemanticModelManifest,
    prefer_optimized: bool,
) -> &'a SemanticModelFile {
    if prefer_optimized && canonical_model_file_path(model_root, &manifest.files.cpu).is_ok() {
        &manifest.files.cpu
    } else {
        &manifest.files.cpu_portable
    }
}

pub fn stable_semantic_embedding_error_code(error: &str) -> String {
    if error.len() > 1_024 {
        return "SEMANTIC_EMBEDDING_FAILED".to_string();
    }
    let code = error.split(':').next().unwrap_or_default();
    match code {
        "SEMANTIC_EMBEDDING_CACHE_INCOMPLETE"
        | "SEMANTIC_EMBEDDING_DEVICE_INVALID"
        | "SEMANTIC_EMBEDDING_INFERENCE_FAILED"
        | "SEMANTIC_EMBEDDING_OUTPUT_SHAPE_MISMATCH"
        | "SEMANTIC_GPU_FALLBACK"
        | "SEMANTIC_MODEL_FILE_HASH_MISMATCH"
        | "SEMANTIC_MODEL_FILE_READ_FAILED"
        | "SEMANTIC_MODEL_FILE_SIZE_MISMATCH"
        | "SEMANTIC_MODEL_FILE_TARGET_INVALID"
        | "SEMANTIC_MODEL_INITIALIZATION_FAILED"
        | "SEMANTIC_MODEL_MANIFEST_INVALID"
        | "SEMANTIC_MODEL_MANIFEST_MISMATCH"
        | "SEMANTIC_MODEL_MANIFEST_READ_FAILED"
        | "SEMANTIC_MODEL_UNAVAILABLE"
        | "SEMANTIC_MODELING_CANCELLED"
        | "SEMANTIC_PASSAGE_INPUT_INVALID"
        | "SEMANTIC_QUERY_INFERENCE_FAILED"
        | "SEMANTIC_QUERY_INVALID"
        | "SEMANTIC_QUERY_OUTPUT_SHAPE_MISMATCH" => code.to_string(),
        _ => "SEMANTIC_EMBEDDING_FAILED".to_string(),
    }
}

pub struct SemanticEmbeddingRuntime {
    model: TextEmbedding,
    provider: &'static str,
    fallback_reason: Option<String>,
}

#[derive(Clone, Default)]
pub struct SemanticEmbeddingControl {
    paused: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
}

impl SemanticEmbeddingControl {
    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    fn wait_for_permission(&self) -> Result<(), String> {
        while self.is_paused() {
            if self.is_cancelled() {
                return Err("SEMANTIC_MODELING_CANCELLED".into());
            }
            thread::sleep(Duration::from_millis(100));
        }
        if self.is_cancelled() {
            return Err("SEMANTIC_MODELING_CANCELLED".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEmbeddingProgress {
    pub stage: String,
    pub processed: usize,
    pub total: usize,
    pub cached: usize,
    pub inferred: usize,
    pub provider: Option<String>,
    pub fallback_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEmbeddingCapabilities {
    pub model_id: String,
    pub model_revision: String,
    pub model_root: Option<String>,
    pub cpu_available: bool,
    pub gpu_available: bool,
}

impl SemanticEmbeddingRuntime {
    pub fn load(device: SemanticEmbeddingDevice) -> Result<Self, String> {
        let model_root = discover_model_root()?;
        let manifest = load_manifest(&model_root)?;
        match device {
            SemanticEmbeddingDevice::Cpu => {
                let cpu_file =
                    select_cpu_model_file(&model_root, &manifest, cpu_supports_avx512_vnni());
                let model = load_text_embedding(
                    &model_root,
                    &manifest,
                    cpu_file,
                    false,
                    DEFAULT_SEMANTIC_CPU_INTRA_THREADS,
                )?;
                Ok(Self {
                    model,
                    provider: "cpu",
                    fallback_reason: None,
                })
            }
            SemanticEmbeddingDevice::Gpu => {
                #[cfg(windows)]
                {
                    match load_text_embedding(
                        &model_root,
                        &manifest,
                        &manifest.files.gpu,
                        true,
                        DEFAULT_SEMANTIC_CPU_INTRA_THREADS,
                    ) {
                        Ok(model) => Ok(Self {
                            model,
                            provider: "directml",
                            fallback_reason: None,
                        }),
                        Err(gpu_error) => {
                            let cpu_file = select_cpu_model_file(
                                &model_root,
                                &manifest,
                                cpu_supports_avx512_vnni(),
                            );
                            let model = load_text_embedding(
                                &model_root,
                                &manifest,
                                cpu_file,
                                false,
                                DEFAULT_SEMANTIC_CPU_INTRA_THREADS,
                            )?;
                            Ok(Self {
                                model,
                                provider: "cpu",
                                fallback_reason: Some(format!("SEMANTIC_GPU_FALLBACK:{gpu_error}")),
                            })
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    let model = load_text_embedding(
                        &model_root,
                        &manifest,
                        &manifest.files.cpu_portable,
                        false,
                        DEFAULT_SEMANTIC_CPU_INTRA_THREADS,
                    )?;
                    Ok(Self {
                        model,
                        provider: "cpu",
                        fallback_reason: Some("SEMANTIC_GPU_FALLBACK:UNSUPPORTED_PLATFORM".into()),
                    })
                }
            }
        }
    }

    /// Load the document-reading indexer on CPU with its own conservative
    /// execution budget. This path intentionally never enables DirectML and
    /// does not change the existing semantic modeling runtime defaults.
    pub fn load_document_index_cpu() -> Result<Self, String> {
        let model_root = discover_model_root()?;
        let manifest = load_manifest(&model_root)?;
        let cpu_file = select_cpu_model_file(&model_root, &manifest, cpu_supports_avx512_vnni());
        let model = load_text_embedding(
            &model_root,
            &manifest,
            cpu_file,
            false,
            DOCUMENT_INDEX_CPU_INTRA_THREADS,
        )?;
        Ok(Self {
            model,
            provider: "cpu",
            fallback_reason: None,
        })
    }

    pub fn provider(&self) -> &'static str {
        self.provider
    }

    pub fn fallback_reason(&self) -> Option<&str> {
        self.fallback_reason.as_deref()
    }

    pub fn embed(
        &mut self,
        documents: &[SemanticPaperDocument],
    ) -> Result<Vec<SemanticEmbeddingRecord>, String> {
        if documents.is_empty() {
            return Ok(Vec::new());
        }
        let texts = documents
            .iter()
            .map(normalize_semantic_document)
            .collect::<Vec<_>>();
        let embeddings = self
            .model
            .embed(texts, Some(32))
            .map_err(|error| format!("SEMANTIC_EMBEDDING_INFERENCE_FAILED:{error}"))?;
        if embeddings.len() != documents.len()
            || embeddings
                .iter()
                .any(|vector| vector.len() != SEMANTIC_EMBEDDING_DIMENSIONS)
        {
            return Err("SEMANTIC_EMBEDDING_OUTPUT_SHAPE_MISMATCH".into());
        }
        Ok(documents
            .iter()
            .zip(embeddings)
            .map(|(document, vector)| SemanticEmbeddingRecord {
                paper_id: document.paper_id.clone(),
                content_sha256: semantic_content_sha256(document),
                vector,
            })
            .collect())
    }

    /// Embed an interactive retrieval query using the E5 query prefix.
    ///
    /// This intentionally does not expose the underlying model outside the
    /// runtime. Chat retrieval can reuse the same CPU model while keeping the
    /// document embedding path and cache format unchanged.
    pub fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
        let query = query.trim();
        if query.is_empty() || query.chars().count() > 4_096 {
            return Err("SEMANTIC_QUERY_INVALID".into());
        }
        let mut embeddings = self
            .model
            .embed(vec![format!("query: {query}")], Some(1))
            .map_err(|error| format!("SEMANTIC_QUERY_INFERENCE_FAILED:{error}"))?;
        if embeddings.len() != 1 || embeddings[0].len() != SEMANTIC_EMBEDDING_DIMENSIONS {
            return Err("SEMANTIC_QUERY_OUTPUT_SHAPE_MISMATCH".into());
        }
        Ok(embeddings.remove(0))
    }

    pub fn embed_passages(&mut self, passages: &[String]) -> Result<Vec<Vec<f32>>, String> {
        if passages.is_empty() {
            return Ok(Vec::new());
        }
        if passages.len() > DOCUMENT_INDEX_EMBEDDING_BATCH_SIZE
            || passages
                .iter()
                .any(|value| value.trim().is_empty() || value.chars().count() > 8_192)
        {
            return Err("SEMANTIC_PASSAGE_INPUT_INVALID".to_string());
        }
        let inputs = passages
            .iter()
            .map(|value| {
                format!(
                    "passage: {}",
                    value.split_whitespace().collect::<Vec<_>>().join(" ")
                )
            })
            .collect::<Vec<_>>();
        let embeddings = self
            .model
            .embed(inputs, Some(DOCUMENT_INDEX_EMBEDDING_BATCH_SIZE))
            .map_err(|error| format!("SEMANTIC_EMBEDDING_INFERENCE_FAILED:{error}"))?;
        if embeddings.len() != passages.len()
            || embeddings
                .iter()
                .any(|vector| vector.len() != SEMANTIC_EMBEDDING_DIMENSIONS)
        {
            return Err("SEMANTIC_EMBEDDING_OUTPUT_SHAPE_MISMATCH".to_string());
        }
        Ok(embeddings)
    }
}

pub fn resolve_embedding_records(
    conn: &Connection,
    project_id: &str,
    documents: &[SemanticPaperDocument],
    device: SemanticEmbeddingDevice,
    now_ms: i64,
) -> Result<(Vec<SemanticEmbeddingRecord>, String, Option<String>), String> {
    resolve_embedding_records_with_progress(
        conn,
        project_id,
        documents,
        device,
        now_ms,
        &SemanticEmbeddingControl::default(),
        |_| {},
    )
}

pub fn resolve_embedding_records_with_progress(
    conn: &Connection,
    project_id: &str,
    documents: &[SemanticPaperDocument],
    device: SemanticEmbeddingDevice,
    now_ms: i64,
    control: &SemanticEmbeddingControl,
    mut on_progress: impl FnMut(SemanticEmbeddingProgress),
) -> Result<(Vec<SemanticEmbeddingRecord>, String, Option<String>), String> {
    control.wait_for_permission()?;
    let mut cached = read_cached_embeddings(conn, project_id, documents)?;
    let missing = documents
        .iter()
        .filter(|document| !cached.contains_key(&document.paper_id))
        .cloned()
        .collect::<Vec<_>>();
    let cached_count = documents.len().saturating_sub(missing.len());
    on_progress(SemanticEmbeddingProgress {
        stage: "cache-check".into(),
        processed: cached_count,
        total: documents.len(),
        cached: cached_count,
        inferred: 0,
        provider: missing.is_empty().then(|| "cache".into()),
        fallback_reason: None,
    });
    let (provider, fallback_reason) = if missing.is_empty() {
        ("cache".to_string(), None)
    } else {
        match SemanticEmbeddingRuntime::load(device) {
            Ok(mut runtime) => {
                let provider = runtime.provider().to_string();
                let fallback_reason = runtime.fallback_reason().map(str::to_string);
                let mut inferred = 0;
                for chunk in missing.chunks(SEMANTIC_EMBEDDING_CHUNK_SIZE) {
                    control.wait_for_permission()?;
                    let records = runtime
                        .embed(chunk)?
                        .into_iter()
                        .map(canonicalize_cached_record)
                        .collect::<Result<Vec<_>, _>>()?;
                    let tx = conn
                        .unchecked_transaction()
                        .map_err(|error| error.to_string())?;
                    write_cached_embeddings(&tx, project_id, &records, now_ms)?;
                    tx.commit().map_err(|error| error.to_string())?;
                    inferred += records.len();
                    for record in records {
                        cached.insert(record.paper_id.clone(), record);
                    }
                    on_progress(SemanticEmbeddingProgress {
                        stage: "embedding".into(),
                        processed: cached_count + inferred,
                        total: documents.len(),
                        cached: cached_count,
                        inferred,
                        provider: Some(provider.clone()),
                        fallback_reason: fallback_reason.clone(),
                    });
                }
                (provider, fallback_reason)
            }
            Err(error) if test_fixture_allowed(conn) => {
                let records = fixture_embeddings(&missing)
                    .into_iter()
                    .map(canonicalize_cached_record)
                    .collect::<Result<Vec<_>, _>>()?;
                write_cached_embeddings_autocommit(conn, project_id, &records, now_ms)?;
                for record in records {
                    cached.insert(record.paper_id.clone(), record);
                }
                on_progress(SemanticEmbeddingProgress {
                    stage: "embedding".into(),
                    processed: documents.len(),
                    total: documents.len(),
                    cached: cached_count,
                    inferred: missing.len(),
                    provider: Some("test-fixture".into()),
                    fallback_reason: Some(error.clone()),
                });
                ("test-fixture".into(), Some(error))
            }
            Err(error) => return Err(error),
        }
    };
    let records = documents
        .iter()
        .map(|document| {
            cached
                .remove(&document.paper_id)
                .ok_or_else(|| "SEMANTIC_EMBEDDING_CACHE_INCOMPLETE".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok((records, provider, fallback_reason))
}

pub fn inspect_semantic_embedding_capabilities() -> SemanticEmbeddingCapabilities {
    let root = discover_model_root().ok();
    let manifest = root.as_deref().and_then(|path| load_manifest(path).ok());
    let cpu_available = root
        .as_deref()
        .zip(manifest.as_ref())
        .is_some_and(|(path, value)| {
            canonical_model_file_path(
                path,
                select_cpu_model_file(path, value, cpu_supports_avx512_vnni()),
            )
            .is_ok()
        });
    let gpu_available = cfg!(windows)
        && root
            .as_deref()
            .zip(manifest.as_ref())
            .is_some_and(|(path, value)| canonical_model_file_path(path, &value.files.gpu).is_ok());
    SemanticEmbeddingCapabilities {
        model_id: SEMANTIC_MODEL_ID.into(),
        model_revision: SEMANTIC_MODEL_REVISION.into(),
        model_root: None,
        cpu_available,
        gpu_available,
    }
}

fn canonicalize_cached_record(
    mut record: SemanticEmbeddingRecord,
) -> Result<SemanticEmbeddingRecord, String> {
    record.vector = decode_float16_le(
        &encode_float16_le(&record.vector),
        SEMANTIC_EMBEDDING_DIMENSIONS,
    )?;
    Ok(record)
}

fn test_fixture_allowed(conn: &Connection) -> bool {
    if std::env::var("RESEARCH_HOTSPOTS_SEMANTIC_TEST_FIXTURE").as_deref() == Ok("1") {
        return true;
    }
    if !cfg!(debug_assertions) {
        return false;
    }
    conn.query_row("PRAGMA database_list", [], |row| row.get::<_, String>(2))
        .map(|path| {
            let normalized = path.replace('\\', "/").to_ascii_lowercase();
            normalized.contains("/target/") || normalized.ends_with(":memory:")
        })
        .unwrap_or(false)
}

fn fixture_embeddings(documents: &[SemanticPaperDocument]) -> Vec<SemanticEmbeddingRecord> {
    documents
        .iter()
        .map(|document| {
            let text = normalize_semantic_document(document);
            let mut vector = vec![0.0_f32; SEMANTIC_EMBEDDING_DIMENSIONS];
            for (position, token) in text.split_whitespace().enumerate() {
                let digest = Sha256::digest(token.as_bytes());
                for lane in 0..4 {
                    let offset = lane * 8;
                    let bits =
                        u64::from_le_bytes(digest[offset..offset + 8].try_into().unwrap_or([0; 8]));
                    let index = (bits as usize) % SEMANTIC_EMBEDDING_DIMENSIONS;
                    let sign = if bits & 1 == 0 { 1.0 } else { -1.0 };
                    vector[index] += sign * (1.0 + (position % 7) as f32 * 0.03);
                }
            }
            let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
            if norm > 0.0 {
                for value in &mut vector {
                    *value /= norm;
                }
            }
            SemanticEmbeddingRecord {
                paper_id: document.paper_id.clone(),
                content_sha256: semantic_content_sha256(document),
                vector,
            }
        })
        .collect()
}

fn discover_model_root() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(value) = std::env::var("RESEARCH_HOTSPOTS_SEMANTIC_MODEL_DIR") {
        if !value.trim().is_empty() {
            candidates.push(PathBuf::from(value));
        }
    }
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.join("semantic-model"));
            candidates.push(parent.join("resources").join("semantic-model"));
        }
    }
    if let Ok(current) = std::env::current_dir() {
        candidates.push(current.join("release-assets").join("semantic-model"));
        if let Some(parent) = current.parent() {
            candidates.push(parent.join("release-assets").join("semantic-model"));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.join("semantic-model-manifest.json").is_file())
        .ok_or_else(|| {
            "SEMANTIC_MODEL_UNAVAILABLE: run `pnpm prepare:semantic-model` or install the Full/Lite model resources"
                .into()
        })
}

fn load_manifest(model_root: &Path) -> Result<SemanticModelManifest, String> {
    let bytes = fs::read(model_root.join("semantic-model-manifest.json"))
        .map_err(|_| "SEMANTIC_MODEL_MANIFEST_READ_FAILED".to_string())?;
    let manifest: SemanticModelManifest = serde_json::from_slice(&bytes)
        .map_err(|_| "SEMANTIC_MODEL_MANIFEST_INVALID".to_string())?;
    if manifest.schema_version != 1
        || manifest.model_id != SEMANTIC_MODEL_ID
        || manifest.revision != SEMANTIC_MODEL_REVISION
        || manifest.dimensions != SEMANTIC_EMBEDDING_DIMENSIONS
    {
        return Err("SEMANTIC_MODEL_MANIFEST_MISMATCH".into());
    }
    validate_manifest_targets(&manifest)?;
    Ok(manifest)
}

fn read_verified(model_root: &Path, file: &SemanticModelFile) -> Result<Vec<u8>, String> {
    let path = canonical_model_file_path(model_root, file)?;
    let bytes = fs::read(&path).map_err(|_| "SEMANTIC_MODEL_FILE_READ_FAILED".to_string())?;
    if bytes.len() as u64 != file.size {
        return Err("SEMANTIC_MODEL_FILE_SIZE_MISMATCH".to_string());
    }
    if let Some(expected) = &file.sha256 {
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return Err("SEMANTIC_MODEL_FILE_HASH_MISMATCH".to_string());
        }
    }
    Ok(bytes)
}

fn canonical_model_file_path(
    model_root: &Path,
    file: &SemanticModelFile,
) -> Result<PathBuf, String> {
    let target = safe_model_target(&file.target)?;
    let canonical_root =
        fs::canonicalize(model_root).map_err(|_| "SEMANTIC_MODEL_FILE_READ_FAILED".to_string())?;
    let candidate = model_root.join(target);
    match fs::canonicalize(&candidate) {
        Ok(canonical_candidate) => {
            if !canonical_candidate.starts_with(&canonical_root) {
                return Err("SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string());
            }
            canonical_candidate
                .is_file()
                .then_some(canonical_candidate)
                .ok_or_else(|| "SEMANTIC_MODEL_FILE_READ_FAILED".to_string())
        }
        Err(_) => {
            let mut parent = candidate.parent();
            while let Some(current) = parent {
                if let Ok(canonical_parent) = fs::canonicalize(current) {
                    if !canonical_parent.starts_with(&canonical_root) {
                        return Err("SEMANTIC_MODEL_FILE_TARGET_INVALID".to_string());
                    }
                    break;
                }
                if current == model_root {
                    break;
                }
                parent = current.parent();
            }
            Err("SEMANTIC_MODEL_FILE_READ_FAILED".to_string())
        }
    }
}

fn load_text_embedding(
    model_root: &Path,
    manifest: &SemanticModelManifest,
    model_file: &SemanticModelFile,
    directml: bool,
    intra_threads: usize,
) -> Result<TextEmbedding, String> {
    let user_model = UserDefinedEmbeddingModel::new(
        read_verified(model_root, model_file)?,
        TokenizerFiles {
            tokenizer_file: read_verified(model_root, &manifest.files.tokenizer)?,
            config_file: read_verified(model_root, &manifest.files.config)?,
            special_tokens_map_file: read_verified(model_root, &manifest.files.special_tokens)?,
            tokenizer_config_file: read_verified(model_root, &manifest.files.tokenizer_config)?,
        },
    )
    .with_pooling(Pooling::Mean);
    let mut options = InitOptionsUserDefined::new()
        .with_max_length(512)
        .with_intra_threads(intra_threads);
    #[cfg(windows)]
    if directml {
        options = options.with_execution_providers(vec![DirectML::default().into()]);
    }
    #[cfg(not(windows))]
    let _ = directml;
    TextEmbedding::try_new_from_user_defined(user_model, options)
        .map_err(|_| "SEMANTIC_MODEL_INITIALIZATION_FAILED".to_string())
}

fn cpu_supports_avx512_vnni() -> bool {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        std::is_x86_feature_detected!("avx512vnni")
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    static NEXT_MODEL_FIXTURE: AtomicU64 = AtomicU64::new(1);

    fn model_fixture_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sidera-semantic-{label}-{}-{}",
            std::process::id(),
            NEXT_MODEL_FIXTURE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn semantic_model_target_accepts_only_bounded_relative_files() {
        assert_eq!(
            safe_model_target("onnx/model.onnx").unwrap(),
            PathBuf::from("onnx/model.onnx")
        );
        for target in [
            "",
            ".",
            "../model.onnx",
            "onnx/../../model.onnx",
            "/absolute/model.onnx",
            "model.onnx:alternate",
        ] {
            assert_eq!(
                safe_model_target(target).unwrap_err(),
                "SEMANTIC_MODEL_FILE_TARGET_INVALID",
                "target {target:?} must be rejected"
            );
        }
        #[cfg(windows)]
        for target in [r"C:\outside\model.onnx", r"\\server\share\model.onnx"] {
            assert_eq!(
                safe_model_target(target).unwrap_err(),
                "SEMANTIC_MODEL_FILE_TARGET_INVALID"
            );
        }
    }

    #[test]
    fn verified_model_reads_do_not_serialize_targets_or_os_errors() {
        let file = SemanticModelFile {
            target: "private/model-name.onnx".to_string(),
            size: 1,
            sha256: None,
        };
        let error = read_verified(Path::new("definitely-missing-model-root"), &file).unwrap_err();
        assert_eq!(error, "SEMANTIC_MODEL_FILE_READ_FAILED");
        assert!(!error.contains(&file.target));
        assert_eq!(
            stable_semantic_embedding_error_code("SEMANTIC_MODEL_FILE_READ_FAILED:C:\\private"),
            "SEMANTIC_MODEL_FILE_READ_FAILED"
        );
        assert_eq!(
            stable_semantic_embedding_error_code("unexpected C:\\private"),
            "SEMANTIC_EMBEDDING_FAILED"
        );
        assert_eq!(
            stable_semantic_embedding_error_code("SEMANTIC_NOT_A_REAL_CODE"),
            "SEMANTIC_EMBEDDING_FAILED"
        );
        assert_eq!(
            stable_semantic_embedding_error_code(&format!("SEMANTIC_{}", "A".repeat(2_000))),
            "SEMANTIC_EMBEDDING_FAILED"
        );
        assert!(inspect_semantic_embedding_capabilities()
            .model_root
            .is_none());
        let serialized = serde_json::to_value(inspect_semantic_embedding_capabilities()).unwrap();
        assert_eq!(serialized.get("modelRoot"), Some(&serde_json::Value::Null));
    }

    #[test]
    fn verified_model_path_stays_within_the_canonical_model_root() {
        let root = model_fixture_root("canonical-root");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        let bytes = b"model";
        fs::write(nested.join("model.onnx"), bytes).unwrap();
        let file = SemanticModelFile {
            target: "nested/model.onnx".to_string(),
            size: bytes.len() as u64,
            sha256: Some(format!("{:x}", Sha256::digest(bytes))),
        };
        let canonical = canonical_model_file_path(&root, &file).unwrap();
        assert!(canonical.starts_with(fs::canonicalize(&root).unwrap()));
        assert_eq!(read_verified(&root, &file).unwrap(), bytes);

        let missing = SemanticModelFile {
            target: "nested/missing.onnx".to_string(),
            size: 0,
            sha256: None,
        };
        assert_eq!(
            canonical_model_file_path(&root, &missing).unwrap_err(),
            "SEMANTIC_MODEL_FILE_READ_FAILED"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn canonical_model_path_rejects_an_external_directory_link_when_supported() {
        let root = model_fixture_root("linked-root");
        let outside = model_fixture_root("linked-outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("model.onnx"), b"outside").unwrap();
        fs::write(root.join("portable.onnx"), b"portable").unwrap();
        let link = root.join("escape");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir(&outside, &link).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&outside, &link).is_ok();
        #[cfg(not(any(windows, unix)))]
        let linked = false;
        if linked {
            let file = SemanticModelFile {
                target: "escape/model.onnx".to_string(),
                size: 7,
                sha256: None,
            };
            assert_eq!(
                canonical_model_file_path(&root, &file).unwrap_err(),
                "SEMANTIC_MODEL_FILE_TARGET_INVALID"
            );
        }
        let model_file = |target: &str| SemanticModelFile {
            target: target.to_string(),
            size: 0,
            sha256: None,
        };
        let manifest = SemanticModelManifest {
            schema_version: 1,
            model_id: SEMANTIC_MODEL_ID.to_string(),
            revision: SEMANTIC_MODEL_REVISION.to_string(),
            dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
            files: SemanticModelFiles {
                cpu: model_file("escape/model.onnx"),
                cpu_portable: model_file("portable.onnx"),
                gpu: model_file("portable.onnx"),
                tokenizer: model_file("portable.onnx"),
                config: model_file("portable.onnx"),
                special_tokens: model_file("portable.onnx"),
                tokenizer_config: model_file("portable.onnx"),
            },
        };
        assert_eq!(
            select_cpu_model_file(&root, &manifest, true).target,
            "portable.onnx"
        );
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
