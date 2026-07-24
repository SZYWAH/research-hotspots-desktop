use std::fs;
use std::path::{Path, PathBuf};

use fastembed::{
    InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel,
};
#[cfg(windows)]
use ort::ep::DirectML;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use research_hotspots_core::semantic_layout::{
    decode_float16_le, encode_float16_le, normalize_semantic_document, read_cached_embeddings,
    semantic_content_sha256, write_cached_embeddings_autocommit, SemanticEmbeddingRecord,
    SemanticPaperDocument, SEMANTIC_EMBEDDING_DIMENSIONS, SEMANTIC_MODEL_ID,
    SEMANTIC_MODEL_REVISION,
};
use rusqlite::Connection;

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

pub struct SemanticEmbeddingRuntime {
    model: TextEmbedding,
    provider: &'static str,
    fallback_reason: Option<String>,
}

impl SemanticEmbeddingRuntime {
    pub fn load(device: SemanticEmbeddingDevice) -> Result<Self, String> {
        let model_root = discover_model_root()?;
        let manifest = load_manifest(&model_root)?;
        match device {
            SemanticEmbeddingDevice::Cpu => {
                let cpu_file = if cpu_supports_avx512_vnni()
                    && model_root.join(&manifest.files.cpu.target).is_file()
                {
                    &manifest.files.cpu
                } else {
                    &manifest.files.cpu_portable
                };
                let model = load_text_embedding(&model_root, &manifest, cpu_file, false)?;
                Ok(Self {
                    model,
                    provider: "cpu",
                    fallback_reason: None,
                })
            }
            SemanticEmbeddingDevice::Gpu => {
                #[cfg(windows)]
                {
                    match load_text_embedding(&model_root, &manifest, &manifest.files.gpu, true) {
                        Ok(model) => Ok(Self {
                            model,
                            provider: "directml",
                            fallback_reason: None,
                        }),
                        Err(gpu_error) => {
                            let cpu_file = if cpu_supports_avx512_vnni()
                                && model_root.join(&manifest.files.cpu.target).is_file()
                            {
                                &manifest.files.cpu
                            } else {
                                &manifest.files.cpu_portable
                            };
                            let model =
                                load_text_embedding(&model_root, &manifest, cpu_file, false)?;
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
}

pub fn resolve_embedding_records(
    conn: &Connection,
    project_id: &str,
    documents: &[SemanticPaperDocument],
    device: SemanticEmbeddingDevice,
    now_ms: i64,
) -> Result<(Vec<SemanticEmbeddingRecord>, String, Option<String>), String> {
    let mut cached = read_cached_embeddings(conn, project_id, documents)?;
    let missing = documents
        .iter()
        .filter(|document| !cached.contains_key(&document.paper_id))
        .cloned()
        .collect::<Vec<_>>();
    let (provider, fallback_reason) = if missing.is_empty() {
        ("cache".to_string(), None)
    } else {
        match SemanticEmbeddingRuntime::load(device) {
            Ok(mut runtime) => {
                let records = runtime
                    .embed(&missing)?
                    .into_iter()
                    .map(canonicalize_cached_record)
                    .collect::<Result<Vec<_>, _>>()?;
                write_cached_embeddings_autocommit(conn, project_id, &records, now_ms)?;
                for record in records {
                    cached.insert(record.paper_id.clone(), record);
                }
                (
                    runtime.provider().to_string(),
                    runtime.fallback_reason().map(str::to_string),
                )
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
        .map_err(|error| format!("SEMANTIC_MODEL_MANIFEST_READ_FAILED:{error}"))?;
    let manifest: SemanticModelManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("SEMANTIC_MODEL_MANIFEST_INVALID:{error}"))?;
    if manifest.schema_version != 1
        || manifest.model_id != SEMANTIC_MODEL_ID
        || manifest.revision != SEMANTIC_MODEL_REVISION
        || manifest.dimensions != SEMANTIC_EMBEDDING_DIMENSIONS
    {
        return Err("SEMANTIC_MODEL_MANIFEST_MISMATCH".into());
    }
    Ok(manifest)
}

fn read_verified(model_root: &Path, file: &SemanticModelFile) -> Result<Vec<u8>, String> {
    let path = model_root.join(&file.target);
    let bytes = fs::read(&path)
        .map_err(|error| format!("SEMANTIC_MODEL_FILE_READ_FAILED:{}:{error}", file.target))?;
    if bytes.len() as u64 != file.size {
        return Err(format!("SEMANTIC_MODEL_FILE_SIZE_MISMATCH:{}", file.target));
    }
    if let Some(expected) = &file.sha256 {
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(format!("SEMANTIC_MODEL_FILE_HASH_MISMATCH:{}", file.target));
        }
    }
    Ok(bytes)
}

fn load_text_embedding(
    model_root: &Path,
    manifest: &SemanticModelManifest,
    model_file: &SemanticModelFile,
    directml: bool,
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
        .with_intra_threads(8);
    #[cfg(windows)]
    if directml {
        options = options.with_execution_providers(vec![DirectML::default().into()]);
    }
    #[cfg(not(windows))]
    let _ = directml;
    TextEmbedding::try_new_from_user_defined(user_model, options)
        .map_err(|error| format!("SEMANTIC_MODEL_INITIALIZATION_FAILED:{error}"))
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
