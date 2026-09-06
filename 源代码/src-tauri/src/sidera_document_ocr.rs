use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, Rgb, RgbImage};
use ort::session::Session;
use ort::value::Tensor;
use research_hotspots_core::document_derived::{
    SideraDocumentEvidenceRect, SideraDocumentReaderQuery,
};
use research_hotspots_core::document_ocr::{
    cancel_document_ocr, complete_document_ocr, document_ocr_snapshot, fail_document_ocr,
    latest_document_ocr_snapshot, queue_document_ocr, run_document_ocr, start_document_ocr,
    SideraDocumentOcrCommitInput, SideraDocumentOcrSnapshot, SideraDocumentOcrSpanInput,
    SideraDocumentOcrStartInput, DOCUMENT_OCR_JOB_TIMEOUT_MS, DOCUMENT_OCR_MAX_IMAGE_EDGE,
    DOCUMENT_OCR_MAX_IMAGE_PIXELS, DOCUMENT_OCR_MAX_UPLOAD_BYTES, DOCUMENT_OCR_MODEL_ID,
    DOCUMENT_OCR_MODEL_REVISION, DOCUMENT_OCR_UPLOAD_TTL_MS,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use crate::sidera_documents::{now_ms, resolve_library_paths};

const OCR_MANIFEST_FILE: &str = "ocr-model-manifest.json";
const OCR_DET_MODEL_FILE: &str = "det/inference.onnx";
const OCR_REC_MODEL_FILE: &str = "rec/inference.onnx";
const OCR_REC_CONFIG_FILE: &str = "rec/inference.yml";
const OCR_REC_IMAGE_HEIGHT: u32 = 48;
const OCR_REC_DEFAULT_IMAGE_WIDTH: u32 = 320;
const OCR_REC_MAX_IMAGE_WIDTH: u32 = 3_200;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideraDocumentOcrCapability {
    installed: bool,
    model_id: String,
    model_revision: String,
    execution_provider: String,
    max_batch_pages: usize,
    unavailable_code: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideraDocumentOcrStartResponse {
    snapshot: SideraDocumentOcrSnapshot,
    upload_url: String,
    expires_at_ms: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentOcrReaderInput {
    database_dir: Option<String>,
    project_id: String,
    paper_id: String,
    version_id: String,
    page_index: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DocumentOcrJobInput {
    database_dir: Option<String>,
    job_id: String,
}

#[derive(Clone)]
struct OcrModelFiles {
    root: PathBuf,
}

#[derive(Clone)]
struct OcrUploadGrant {
    job_id: String,
    library_directory: PathBuf,
    reader: SideraDocumentReaderQuery,
    page_index: u32,
    expires_at_ms: i64,
    model_files: OcrModelFiles,
}

#[derive(Default)]
struct OcrRuntimeInner {
    uploads: HashMap<String, OcrUploadGrant>,
    active_job_id: Option<String>,
    cancel_flags: HashMap<String, Arc<AtomicBool>>,
    capability_cache: Option<(PathBuf, bool)>,
}

#[derive(Clone, Default)]
pub(crate) struct SideraDocumentOcrRuntimeState {
    inner: Arc<Mutex<OcrRuntimeInner>>,
    token_counter: Arc<AtomicU64>,
}

impl SideraDocumentOcrRuntimeState {
    fn register_upload(&self, grant: OcrUploadGrant, issued_at_ms: i64) -> Result<String, String> {
        let counter = self.token_counter.fetch_add(1, Ordering::Relaxed);
        let digest = Sha256::digest(
            format!(
                "{}\n{}\n{}\n{}",
                grant.job_id, issued_at_ms, counter, grant.page_index
            )
            .as_bytes(),
        );
        let token = format!("ocr-upload-{}", lowercase_hex(&digest[..20]));
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_OCR_RUNTIME_POISONED".to_string())?;
        inner
            .uploads
            .retain(|_, existing| existing.expires_at_ms > issued_at_ms);
        inner.uploads.insert(token.clone(), grant);
        Ok(token)
    }

    fn consume_upload(&self, token: &str, at_ms: i64) -> Result<OcrUploadGrant, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_OCR_RUNTIME_POISONED".to_string())?;
        let grant = inner
            .uploads
            .remove(token)
            .ok_or_else(|| "SIDERA_DOCUMENT_OCR_UPLOAD_TOKEN_INVALID".to_string())?;
        if grant.expires_at_ms < at_ms {
            return Err("SIDERA_DOCUMENT_OCR_UPLOAD_TOKEN_EXPIRED".to_string());
        }
        if inner.active_job_id.is_some() {
            return Err("SIDERA_DOCUMENT_OCR_BUSY".to_string());
        }
        inner.active_job_id = Some(grant.job_id.clone());
        inner
            .cancel_flags
            .insert(grant.job_id.clone(), Arc::new(AtomicBool::new(false)));
        Ok(grant)
    }

    fn cancel_flag(&self, job_id: &str) -> Result<Option<Arc<AtomicBool>>, String> {
        self.inner
            .lock()
            .map_err(|_| "SIDERA_DOCUMENT_OCR_RUNTIME_POISONED".to_string())
            .map(|inner| inner.cancel_flags.get(job_id).cloned())
    }

    fn finish(&self, job_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner.active_job_id.as_deref() == Some(job_id) {
                inner.active_job_id = None;
            }
            inner.cancel_flags.remove(job_id);
            inner.uploads.retain(|_, grant| grant.job_id != job_id);
        }
    }
}

fn lowercase_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn reader_query(
    app: &AppHandle,
    input: &DocumentOcrReaderInput,
) -> Result<SideraDocumentReaderQuery, String> {
    let (library_directory, _) = resolve_library_paths(app, input.database_dir.clone())?;
    Ok(SideraDocumentReaderQuery {
        library_directory,
        project_id: input.project_id.clone(),
        paper_id: input.paper_id.clone(),
        document_version_id: input.version_id.clone(),
    })
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_READ_FAILED".to_string())?;
    Ok(lowercase_hex(&Sha256::digest(bytes)))
}

fn model_root_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("ocr-model"));
    }
    if cfg!(debug_assertions) {
        candidates
            .push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../release-assets/ocr-model"));
    }
    candidates
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OcrManifest {
    model_id: String,
    model_revision: String,
    files: Vec<OcrManifestFile>,
}

#[derive(Deserialize)]
struct OcrManifestFile {
    path: String,
    sha256: String,
    bytes: u64,
}

fn verified_model_files(app: &AppHandle) -> Result<OcrModelFiles, String> {
    for root in model_root_candidates(app) {
        let manifest_path = root.join(OCR_MANIFEST_FILE);
        if !manifest_path.is_file() {
            continue;
        }
        let manifest: OcrManifest = serde_json::from_slice(
            &fs::read(&manifest_path)
                .map_err(|_| "SIDERA_DOCUMENT_OCR_MANIFEST_READ_FAILED".to_string())?,
        )
        .map_err(|_| "SIDERA_DOCUMENT_OCR_MANIFEST_INVALID".to_string())?;
        if manifest.model_id != DOCUMENT_OCR_MODEL_ID
            || manifest.model_revision != DOCUMENT_OCR_MODEL_REVISION
        {
            return Err("SIDERA_DOCUMENT_OCR_MANIFEST_MISMATCH".to_string());
        }
        for entry in &manifest.files {
            let relative = Path::new(&entry.path);
            if relative.is_absolute()
                || relative.components().any(|component| {
                    matches!(
                        component,
                        std::path::Component::ParentDir | std::path::Component::Prefix(_)
                    )
                })
            {
                return Err("SIDERA_DOCUMENT_OCR_MANIFEST_INVALID".to_string());
            }
            let path = root.join(relative);
            let metadata =
                fs::metadata(&path).map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_MISSING".to_string())?;
            if metadata.len() != entry.bytes
                || file_sha256(&path)? != entry.sha256.to_ascii_lowercase()
            {
                return Err("SIDERA_DOCUMENT_OCR_MODEL_HASH_MISMATCH".to_string());
            }
        }
        for required in [OCR_DET_MODEL_FILE, OCR_REC_MODEL_FILE, OCR_REC_CONFIG_FILE] {
            if !root.join(required).is_file() {
                return Err("SIDERA_DOCUMENT_OCR_MODEL_MISSING".to_string());
            }
        }
        return Ok(OcrModelFiles { root });
    }
    Err("SIDERA_DOCUMENT_OCR_NOT_INSTALLED".to_string())
}

#[tauri::command]
pub(crate) fn sidera_document_ocr_capabilities(
    app: AppHandle,
    runtime: State<'_, SideraDocumentOcrRuntimeState>,
) -> SideraDocumentOcrCapability {
    let verification = verified_model_files(&app);
    if let Ok(mut inner) = runtime.inner.lock() {
        inner.capability_cache = verification
            .as_ref()
            .ok()
            .map(|files| (files.root.clone(), true));
    }
    SideraDocumentOcrCapability {
        installed: verification.is_ok(),
        model_id: DOCUMENT_OCR_MODEL_ID.to_string(),
        model_revision: DOCUMENT_OCR_MODEL_REVISION.to_string(),
        execution_provider: "cpu-2-threads".to_string(),
        max_batch_pages: 8,
        unavailable_code: verification.err(),
    }
}

#[tauri::command]
pub(crate) fn sidera_document_ocr_start(
    app: AppHandle,
    runtime: State<'_, SideraDocumentOcrRuntimeState>,
    input: DocumentOcrReaderInput,
) -> Result<SideraDocumentOcrStartResponse, String> {
    let model_files = verified_model_files(&app)?;
    let reader = reader_query(&app, &input)?;
    let issued_at_ms = now_ms();
    let snapshot = start_document_ocr(SideraDocumentOcrStartInput {
        reader: reader.clone(),
        page_index: input.page_index,
        now_ms: issued_at_ms,
    })?;
    let expires_at_ms = issued_at_ms + DOCUMENT_OCR_UPLOAD_TTL_MS;
    let token = runtime.register_upload(
        OcrUploadGrant {
            job_id: snapshot.job_id.clone(),
            library_directory: reader.library_directory.clone(),
            reader,
            page_index: input.page_index,
            expires_at_ms,
            model_files,
        },
        issued_at_ms,
    )?;
    Ok(SideraDocumentOcrStartResponse {
        snapshot,
        upload_url: format!("sidera-document://localhost/ocr-upload/{token}"),
        expires_at_ms,
    })
}

#[tauri::command]
pub(crate) fn sidera_document_ocr_snapshot(
    app: AppHandle,
    input: DocumentOcrJobInput,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    document_ocr_snapshot(&library_directory, &input.job_id)
}

#[tauri::command]
pub(crate) fn sidera_document_ocr_current(
    app: AppHandle,
    input: DocumentOcrReaderInput,
) -> Result<Option<SideraDocumentOcrSnapshot>, String> {
    let reader = reader_query(&app, &input)?;
    latest_document_ocr_snapshot(&reader, input.page_index)
}

#[tauri::command]
pub(crate) fn sidera_document_ocr_cancel(
    app: AppHandle,
    runtime: State<'_, SideraDocumentOcrRuntimeState>,
    input: DocumentOcrJobInput,
) -> Result<SideraDocumentOcrSnapshot, String> {
    let (library_directory, _) = resolve_library_paths(&app, input.database_dir)?;
    if let Some(flag) = runtime.cancel_flag(&input.job_id)? {
        flag.store(true, Ordering::Release);
    }
    let snapshot = cancel_document_ocr(&library_directory, &input.job_id, now_ms())?;
    runtime.finish(&input.job_id);
    Ok(snapshot)
}

pub(crate) fn accept_ocr_upload(
    runtime: &SideraDocumentOcrRuntimeState,
    token: &str,
    content_type: Option<&str>,
    body: Vec<u8>,
) -> Result<(), String> {
    if content_type.is_none_or(|value| !value.eq_ignore_ascii_case("image/png")) {
        return Err("SIDERA_DOCUMENT_OCR_UPLOAD_CONTENT_TYPE_INVALID".to_string());
    }
    if body.is_empty() || body.len() > DOCUMENT_OCR_MAX_UPLOAD_BYTES {
        return Err("SIDERA_DOCUMENT_OCR_UPLOAD_SIZE_INVALID".to_string());
    }
    if !body.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("SIDERA_DOCUMENT_OCR_UPLOAD_PNG_INVALID".to_string());
    }
    let grant = runtime.consume_upload(token, now_ms())?;
    if let Err(error) = queue_document_ocr(&grant.library_directory, &grant.job_id, now_ms()) {
        runtime.finish(&grant.job_id);
        return Err(error);
    }
    let cancel = runtime
        .cancel_flag(&grant.job_id)?
        .ok_or_else(|| "SIDERA_DOCUMENT_OCR_RUNTIME_MISSING".to_string())?;
    let runtime = runtime.clone();
    thread::spawn(move || {
        let job_id = grant.job_id.clone();
        let library_directory = grant.library_directory.clone();
        let result = run_uploaded_ocr(grant, body, cancel.clone());
        if let Err(code) = result {
            if code == "SIDERA_DOCUMENT_OCR_CANCELLED" {
                let _ = cancel_document_ocr(&library_directory, &job_id, now_ms());
            } else {
                let _ = fail_document_ocr(&library_directory, &job_id, &code, now_ms());
            }
        }
        runtime.finish(&job_id);
    });
    Ok(())
}

pub(crate) fn ocr_upload_token(path: &str, has_query: bool) -> Result<&str, String> {
    if has_query {
        return Err("SIDERA_DOCUMENT_OCR_UPLOAD_URI_INVALID".to_string());
    }
    let segments = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.len() != 2
        || segments[0] != "ocr-upload"
        || segments[1].len() > 128
        || !segments[1]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("SIDERA_DOCUMENT_OCR_UPLOAD_URI_INVALID".to_string());
    }
    Ok(segments[1])
}

fn run_uploaded_ocr(
    grant: OcrUploadGrant,
    body: Vec<u8>,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let started = Instant::now();
    run_document_ocr(&grant.library_directory, &grant.job_id, now_ms())?;
    let image = image::load_from_memory_with_format(&body, ImageFormat::Png)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_UPLOAD_PNG_INVALID".to_string())?;
    let (width, height) = image.dimensions();
    if width == 0
        || height == 0
        || width > DOCUMENT_OCR_MAX_IMAGE_EDGE
        || height > DOCUMENT_OCR_MAX_IMAGE_EDGE
        || u64::from(width) * u64::from(height) > DOCUMENT_OCR_MAX_IMAGE_PIXELS
    {
        return Err("SIDERA_DOCUMENT_OCR_IMAGE_LIMIT_EXCEEDED".to_string());
    }
    let spans = OcrEngine::load(&grant.model_files)?.recognize(
        &image,
        &cancel,
        started,
        Duration::from_millis(DOCUMENT_OCR_JOB_TIMEOUT_MS as u64),
    )?;
    if cancel.load(Ordering::Acquire) {
        return Err("SIDERA_DOCUMENT_OCR_CANCELLED".to_string());
    }
    complete_document_ocr(SideraDocumentOcrCommitInput {
        reader: grant.reader,
        job_id: grant.job_id,
        page_index: grant.page_index,
        page_width: width as f64,
        page_height: height as f64,
        spans,
        now_ms: now_ms(),
    })?;
    Ok(())
}

struct OcrEngine {
    detector: Session,
    recognizer: Session,
    dictionary: Vec<String>,
}

#[derive(Clone, Copy)]
struct PixelRect {
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

impl OcrEngine {
    fn load(files: &OcrModelFiles) -> Result<Self, String> {
        let detector_builder =
            Session::builder().map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let mut detector_builder = detector_builder
            .with_intra_threads(2)
            .map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let detector = detector_builder
            .commit_from_file(files.root.join(OCR_DET_MODEL_FILE))
            .map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let recognizer_builder =
            Session::builder().map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let mut recognizer_builder = recognizer_builder
            .with_intra_threads(2)
            .map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let recognizer = recognizer_builder
            .commit_from_file(files.root.join(OCR_REC_MODEL_FILE))
            .map_err(|_| "SIDERA_DOCUMENT_OCR_MODEL_LOAD_FAILED".to_string())?;
        let dictionary = parse_character_dictionary(&files.root.join(OCR_REC_CONFIG_FILE))?;
        Ok(Self {
            detector,
            recognizer,
            dictionary,
        })
    }

    fn recognize(
        &mut self,
        image: &DynamicImage,
        cancel: &AtomicBool,
        started: Instant,
        timeout: Duration,
    ) -> Result<Vec<SideraDocumentOcrSpanInput>, String> {
        checkpoint(cancel, started, timeout)?;
        let boxes = self.detect(image)?;
        let (image_width, image_height) = image.dimensions();
        let mut spans = Vec::new();
        for rect in boxes.into_iter().take(256) {
            checkpoint(cancel, started, timeout)?;
            let crop = image.crop_imm(
                rect.left,
                rect.top,
                rect.right.saturating_sub(rect.left).max(1),
                rect.bottom.saturating_sub(rect.top).max(1),
            );
            let (text, confidence) = self.recognize_crop(&crop)?;
            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            spans.push(SideraDocumentOcrSpanInput {
                text,
                rect: SideraDocumentEvidenceRect {
                    x: rect.left as f64 / image_width as f64,
                    y: rect.top as f64 / image_height as f64,
                    width: rect.right.saturating_sub(rect.left) as f64 / image_width as f64,
                    height: rect.bottom.saturating_sub(rect.top) as f64 / image_height as f64,
                },
                confidence: confidence.clamp(0.0, 1.0),
            });
        }
        Ok(spans)
    }

    fn detect(&mut self, image: &DynamicImage) -> Result<Vec<PixelRect>, String> {
        let (original_width, original_height) = image.dimensions();
        let long = original_width.max(original_height) as f64;
        let scale = (960.0 / long).min(1.0);
        let resized_width = round_to_32((original_width as f64 * scale).round() as u32).max(32);
        let resized_height = round_to_32((original_height as f64 * scale).round() as u32).max(32);
        let resized = image
            .resize_exact(resized_width, resized_height, FilterType::Triangle)
            .to_rgb8();
        let plane = resized_width as usize * resized_height as usize;
        let mut tensor_data = vec![0.0f32; plane * 3];
        let mean = [0.485f32, 0.456, 0.406];
        let std = [0.229f32, 0.224, 0.225];
        for (index, pixel) in resized.pixels().enumerate() {
            let bgr = [pixel[2], pixel[1], pixel[0]];
            for channel in 0..3 {
                tensor_data[channel * plane + index] =
                    (bgr[channel] as f32 / 255.0 - mean[channel]) / std[channel];
            }
        }
        let input = Tensor::from_array((
            [1usize, 3, resized_height as usize, resized_width as usize],
            tensor_data.into_boxed_slice(),
        ))
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TENSOR_FAILED".to_string())?;
        let outputs = self
            .detector
            .run(ort::inputs![input])
            .map_err(|_| "SIDERA_DOCUMENT_OCR_INFERENCE_FAILED".to_string())?;
        let (shape, probabilities) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|_| "SIDERA_DOCUMENT_OCR_OUTPUT_INVALID".to_string())?;
        let dimensions = shape
            .iter()
            .map(|value| *value as usize)
            .collect::<Vec<_>>();
        if dimensions.len() != 4
            || dimensions[0] != 1
            || dimensions[1] != 1
            || dimensions[2] != resized_height as usize
            || dimensions[3] != resized_width as usize
        {
            return Err("SIDERA_DOCUMENT_OCR_OUTPUT_INVALID".to_string());
        }
        Ok(connected_text_regions(
            probabilities,
            resized_width,
            resized_height,
            original_width,
            original_height,
        ))
    }

    fn recognize_crop(&mut self, crop: &DynamicImage) -> Result<(String, f64), String> {
        if crop.height() > crop.width().saturating_mul(2) {
            let clockwise = self.recognize_horizontal_crop(&crop.rotate90())?;
            let counterclockwise = self.recognize_horizontal_crop(&crop.rotate270())?;
            return Ok(if clockwise.1 >= counterclockwise.1 {
                clockwise
            } else {
                counterclockwise
            });
        }
        self.recognize_horizontal_crop(crop)
    }

    fn recognize_horizontal_crop(&mut self, crop: &DynamicImage) -> Result<(String, f64), String> {
        let compact = self.recognize_crop_at_width(crop, OCR_REC_DEFAULT_IMAGE_WIDTH)?;
        let natural_width = ((crop.width() as f64 / crop.height().max(1) as f64)
            * OCR_REC_IMAGE_HEIGHT as f64)
            .ceil() as u32;
        let contains_cjk = compact.0.chars().any(|character| {
            matches!(character as u32, 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF)
        });
        if natural_width <= OCR_REC_DEFAULT_IMAGE_WIDTH || (contains_cjk && compact.1 >= 0.75) {
            return Ok(compact);
        }

        let expanded = self.recognize_crop_at_width(crop, OCR_REC_MAX_IMAGE_WIDTH)?;
        let compact_length = compact.0.chars().count();
        let expanded_length = expanded.0.chars().count();
        if expanded.1 >= compact.1
            || (expanded_length > compact_length.saturating_mul(3) / 2
                && expanded.1 >= compact.1 * 0.8)
        {
            Ok(expanded)
        } else {
            Ok(compact)
        }
    }

    fn recognize_crop_at_width(
        &mut self,
        crop: &DynamicImage,
        maximum_width: u32,
    ) -> Result<(String, f64), String> {
        let rgb = crop.to_rgb8();
        let source_ratio = rgb.width() as f64 / rgb.height().max(1) as f64;
        let content_width = (source_ratio * OCR_REC_IMAGE_HEIGHT as f64)
            .ceil()
            .clamp(8.0, maximum_width as f64) as u32;
        let tensor_width = if maximum_width == OCR_REC_DEFAULT_IMAGE_WIDTH {
            OCR_REC_DEFAULT_IMAGE_WIDTH
        } else {
            round_to_32(content_width).clamp(32, OCR_REC_MAX_IMAGE_WIDTH)
        };
        let resized = image::imageops::resize(
            &rgb,
            content_width,
            OCR_REC_IMAGE_HEIGHT,
            FilterType::Triangle,
        );
        // Paddle's RecResizeImg pads normalized tensors with zero rather than
        // white; RGB 127 keeps padded pixels close to that neutral value.
        let mut padded =
            RgbImage::from_pixel(tensor_width, OCR_REC_IMAGE_HEIGHT, Rgb([127, 127, 127]));
        image::imageops::replace(&mut padded, &resized, 0, 0);
        let plane = OCR_REC_IMAGE_HEIGHT as usize * tensor_width as usize;
        let mut tensor_data = vec![0.0f32; plane * 3];
        for (index, pixel) in padded.pixels().enumerate() {
            let bgr = [pixel[2], pixel[1], pixel[0]];
            for channel in 0..3 {
                tensor_data[channel * plane + index] = bgr[channel] as f32 / 127.5 - 1.0;
            }
        }
        let input = Tensor::from_array((
            [
                1usize,
                3,
                OCR_REC_IMAGE_HEIGHT as usize,
                tensor_width as usize,
            ],
            tensor_data.into_boxed_slice(),
        ))
        .map_err(|_| "SIDERA_DOCUMENT_OCR_TENSOR_FAILED".to_string())?;
        let outputs = self
            .recognizer
            .run(ort::inputs![input])
            .map_err(|_| "SIDERA_DOCUMENT_OCR_INFERENCE_FAILED".to_string())?;
        let (shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|_| "SIDERA_DOCUMENT_OCR_OUTPUT_INVALID".to_string())?;
        let dimensions = shape
            .iter()
            .map(|value| *value as usize)
            .collect::<Vec<_>>();
        if dimensions.len() != 3 || dimensions[0] != 1 || dimensions[2] < 2 {
            return Err("SIDERA_DOCUMENT_OCR_OUTPUT_INVALID".to_string());
        }
        let steps = dimensions[1];
        let classes = dimensions[2];
        let mut text = String::new();
        let mut confidences = Vec::new();
        let mut previous = 0usize;
        for step in 0..steps {
            let values = &data[step * classes..(step + 1) * classes];
            let (best, best_value) = values
                .iter()
                .copied()
                .enumerate()
                .max_by(|left, right| left.1.total_cmp(&right.1))
                .unwrap_or((0, 0.0));
            if best == 0 || best == previous {
                previous = best;
                continue;
            }
            let confidence = class_confidence(values, best_value);
            if let Some(character) = self.dictionary.get(best - 1) {
                text.push_str(character);
                confidences.push(confidence);
            }
            previous = best;
        }
        let confidence = if confidences.is_empty() {
            0.0
        } else {
            confidences.iter().sum::<f64>() / confidences.len() as f64
        };
        Ok((text, confidence))
    }
}

fn checkpoint(cancel: &AtomicBool, started: Instant, timeout: Duration) -> Result<(), String> {
    if cancel.load(Ordering::Acquire) {
        return Err("SIDERA_DOCUMENT_OCR_CANCELLED".to_string());
    }
    if started.elapsed() > timeout {
        return Err("SIDERA_DOCUMENT_OCR_TIMEOUT".to_string());
    }
    Ok(())
}

fn round_to_32(value: u32) -> u32 {
    value.saturating_add(31) / 32 * 32
}

fn class_confidence(values: &[f32], best: f32) -> f64 {
    let probability_like = values.iter().all(|value| *value >= 0.0 && *value <= 1.0)
        && (0.8..=1.2).contains(&values.iter().map(|value| *value as f64).sum::<f64>());
    if probability_like {
        return best as f64;
    }
    let denominator = values
        .iter()
        .map(|value| (*value - best).exp() as f64)
        .sum::<f64>();
    if denominator > 0.0 {
        1.0 / denominator
    } else {
        0.0
    }
}

fn parse_character_dictionary(path: &Path) -> Result<Vec<String>, String> {
    let content = fs::read_to_string(path)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_DICTIONARY_READ_FAILED".to_string())?;
    let mut dictionary = Vec::new();
    let mut in_dictionary = false;
    for line in content.lines() {
        if line.trim() == "character_dict:" {
            in_dictionary = true;
            continue;
        }
        if !in_dictionary {
            continue;
        }
        let Some(value) = line.strip_prefix("  - ") else {
            if !line.trim().is_empty() {
                break;
            }
            continue;
        };
        let character = if value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2 {
            value[1..value.len() - 1].replace("''", "'")
        } else {
            value.to_string()
        };
        dictionary.push(character);
    }
    if dictionary.len() < 1_000 {
        return Err("SIDERA_DOCUMENT_OCR_DICTIONARY_INVALID".to_string());
    }
    dictionary.push(" ".to_string());
    Ok(dictionary)
}

#[cfg(feature = "dev-tools")]
pub(crate) fn audit_document_ocr_runtime(model_root: &Path) -> Result<serde_json::Value, String> {
    let files = OcrModelFiles {
        root: model_root.to_path_buf(),
    };
    for required in [OCR_DET_MODEL_FILE, OCR_REC_MODEL_FILE, OCR_REC_CONFIG_FILE] {
        if !files.root.join(required).is_file() {
            return Err("SIDERA_DOCUMENT_OCR_MODEL_MISSING".to_string());
        }
    }
    let mut engine = OcrEngine::load(&files)?;
    let mut image = RgbImage::from_pixel(640, 256, Rgb([255, 255, 255]));
    for y in 72..112 {
        for x in 72..568 {
            if y < 78 || y > 105 || x % 38 < 23 {
                image.put_pixel(x, y, Rgb([0, 0, 0]));
            }
        }
    }
    let image = DynamicImage::ImageRgb8(image);
    let detected_regions = engine.detect(&image)?.len();
    let (recognizer_sample, recognizer_confidence) = engine.recognize_crop(&image)?;
    Ok(serde_json::json!({
        "status": "RUNTIME PASS",
        "executionProvider": "cpu",
        "intraOpThreads": 2,
        "directML": false,
        "detectorInference": "pass",
        "detectedRegions": detected_regions,
        "recognizerInference": "pass",
        "recognizerOutputUtf16": recognizer_sample.encode_utf16().count(),
        "recognizerConfidence": recognizer_confidence,
    }))
}

#[cfg(feature = "dev-tools")]
pub(crate) fn audit_document_ocr_fixture(
    model_root: &Path,
    image_path: &Path,
) -> Result<serde_json::Value, String> {
    let files = OcrModelFiles {
        root: model_root.to_path_buf(),
    };
    let image = image::open(image_path)
        .map_err(|_| "SIDERA_DOCUMENT_OCR_AUDIT_FIXTURE_INVALID".to_string())?;
    let mut engine = OcrEngine::load(&files)?;
    let cancelled = AtomicBool::new(false);
    let spans = engine.recognize(
        &image,
        &cancelled,
        Instant::now(),
        Duration::from_millis(DOCUMENT_OCR_JOB_TIMEOUT_MS as u64),
    )?;
    let mean_confidence = if spans.is_empty() {
        0.0
    } else {
        spans.iter().map(|span| span.confidence).sum::<f64>() / spans.len() as f64
    };
    Ok(serde_json::json!({
        "status": "FIXTURE PASS",
        "fixture": image_path.file_name().and_then(|name| name.to_str()),
        "spanCount": spans.len(),
        "meanConfidence": mean_confidence,
        "text": spans.iter().map(|span| span.text.as_str()).collect::<Vec<_>>().join("\n"),
        "rects": spans.iter().map(|span| serde_json::json!({
            "text": span.text,
            "x": span.rect.x,
            "y": span.rect.y,
            "width": span.rect.width,
            "height": span.rect.height,
        })).collect::<Vec<_>>(),
        "executionProvider": "cpu",
        "intraOpThreads": 2,
    }))
}

fn connected_text_regions(
    probabilities: &[f32],
    width: u32,
    height: u32,
    original_width: u32,
    original_height: u32,
) -> Vec<PixelRect> {
    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut visited = vec![false; width_usize * height_usize];
    let mut regions = Vec::new();
    for y in 0..height_usize {
        for x in 0..width_usize {
            let origin = y * width_usize + x;
            if visited[origin] || probabilities.get(origin).copied().unwrap_or(0.0) < 0.3 {
                continue;
            }
            let mut queue = VecDeque::from([(x, y)]);
            visited[origin] = true;
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (x, x, y, y);
            let mut score_sum = 0.0f64;
            let mut score_max = 0.0f32;
            let mut count = 0usize;
            while let Some((current_x, current_y)) = queue.pop_front() {
                let probability = probabilities[current_y * width_usize + current_x];
                score_sum += probability as f64;
                score_max = score_max.max(probability);
                count += 1;
                min_x = min_x.min(current_x);
                max_x = max_x.max(current_x);
                min_y = min_y.min(current_y);
                max_y = max_y.max(current_y);
                for offset_y in -1isize..=1 {
                    for offset_x in -1isize..=1 {
                        if offset_x == 0 && offset_y == 0 {
                            continue;
                        }
                        let next_x = current_x as isize + offset_x;
                        let next_y = current_y as isize + offset_y;
                        if next_x < 0
                            || next_y < 0
                            || next_x >= width_usize as isize
                            || next_y >= height_usize as isize
                        {
                            continue;
                        }
                        let next = next_y as usize * width_usize + next_x as usize;
                        if !visited[next] && probabilities[next] >= 0.3 {
                            visited[next] = true;
                            queue.push_back((next_x as usize, next_y as usize));
                        }
                    }
                }
            }
            if count < 6 || score_max < 0.6 || score_sum / (count as f64) < 0.42 {
                continue;
            }
            let box_height = max_y.saturating_sub(min_y).max(1) as f64;
            // A text detector can return a very wide component for one line. Expanding
            // horizontally by a fraction of that width makes long lines reach x = 0,
            // so the persisted OCR selection rectangle covers leading page whitespace.
            // Use the line height as the padding scale instead: it preserves glyph-edge
            // breathing room without making the padding grow with sentence length.
            let expand_x = box_height * 0.75;
            let expand_y = box_height * 0.25;
            let left = ((min_x as f64 - expand_x).max(0.0) / width as f64 * original_width as f64)
                .floor() as u32;
            let top = ((min_y as f64 - expand_y).max(0.0) / height as f64 * original_height as f64)
                .floor() as u32;
            let right = (((max_x + 1) as f64 + expand_x).min(width as f64) / width as f64
                * original_width as f64)
                .ceil() as u32;
            let bottom = (((max_y + 1) as f64 + expand_y).min(height as f64) / height as f64
                * original_height as f64)
                .ceil() as u32;
            if right > left && bottom > top {
                regions.push(PixelRect {
                    left,
                    top,
                    right: right.min(original_width),
                    bottom: bottom.min(original_height),
                });
            }
        }
    }
    regions.sort_by(|left, right| {
        let line_height = left.bottom.saturating_sub(left.top).max(1);
        if left.top.abs_diff(right.top) <= line_height / 2 {
            left.left.cmp(&right.left)
        } else {
            left.top.cmp(&right.top)
        }
    });
    regions.truncate(1_000);
    regions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dictionary_parser_reads_official_character_list_and_adds_space() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../release-assets/ocr-model/rec/inference.yml");
        if !path.is_file() {
            return;
        }
        let dictionary = parse_character_dictionary(&path).unwrap();
        assert!(dictionary.len() > 18_000);
        assert!(dictionary.iter().any(|character| character == "0"));
        assert!(dictionary.iter().any(|character| character == "'"));
        assert!(!dictionary.iter().any(|character| character == "'0'"));
        assert_eq!(dictionary.last().map(String::as_str), Some(" "));
    }

    #[test]
    fn connected_regions_are_normalized_back_to_original_pixels() {
        let mut map = vec![0.0f32; 32 * 32];
        for y in 8..12 {
            for x in 4..20 {
                map[y * 32 + x] = 0.9;
            }
        }
        let regions = connected_text_regions(&map, 32, 32, 320, 640);
        assert_eq!(regions.len(), 1);
        assert!(regions[0].left > 0);
        assert!(regions[0].left < regions[0].right);
        assert!(regions[0].right < 320);
        assert!(regions[0].bottom <= 640);
    }

    #[test]
    fn long_text_regions_do_not_expand_to_the_page_edges() {
        let mut map = vec![0.0f32; 96 * 32];
        for y in 10..14 {
            for x in 10..86 {
                map[y * 96 + x] = 0.9;
            }
        }
        let regions = connected_text_regions(&map, 96, 32, 960, 320);
        assert_eq!(regions.len(), 1);
        assert!(regions[0].left >= 70, "left={}", regions[0].left);
        assert!(regions[0].right <= 890, "right={}", regions[0].right);
    }

    #[test]
    fn upload_uri_accepts_only_one_opaque_token() {
        assert_eq!(
            ocr_upload_token("/ocr-upload/token_01", false).unwrap(),
            "token_01"
        );
        assert!(ocr_upload_token("/ocr-upload/token/extra", false).is_err());
        assert!(ocr_upload_token("/ocr-upload/token", true).is_err());
    }
}
