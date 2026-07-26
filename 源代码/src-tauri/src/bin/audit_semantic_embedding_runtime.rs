use research_hotspots_core::semantic_layout::SemanticPaperDocument;
use research_hotspots_desktop_lib::semantic_embedding::{
    SemanticEmbeddingDevice, SemanticEmbeddingRuntime,
};
use serde_json::json;

fn cosine(left: &[f32], right: &[f32]) -> f64 {
    let dot = left
        .iter()
        .zip(right)
        .map(|(a, b)| f64::from(*a) * f64::from(*b))
        .sum::<f64>();
    let left_norm = left
        .iter()
        .map(|value| f64::from(*value).powi(2))
        .sum::<f64>()
        .sqrt();
    let right_norm = right
        .iter()
        .map(|value| f64::from(*value).powi(2))
        .sum::<f64>()
        .sqrt();
    dot / (left_norm * right_norm).max(1e-12)
}

fn main() -> Result<(), String> {
    let documents = vec![
        SemanticPaperDocument {
            paper_id: "audit-quantum".into(),
            title: "Fault-tolerant quantum error correction under realistic noise".into(),
            field: "Quantum Physics".into(),
            categories: Some("quantum error correction".into()),
            abstract_text:
                "We study scalable logical qubits, surface codes, and hardware-aware noise."
                    .into(),
        },
        SemanticPaperDocument {
            paper_id: "audit-protein".into(),
            title: "Multimodal protein design with structure-conditioned diffusion".into(),
            field: "Computational Biology".into(),
            categories: Some("protein design".into()),
            abstract_text:
                "A structure-aware generative model integrates sequence and three-dimensional folds."
                    .into(),
        },
    ];
    let mut cpu = SemanticEmbeddingRuntime::load(SemanticEmbeddingDevice::Cpu)?;
    let cpu_vectors = cpu.embed(&documents)?;
    let mut gpu = SemanticEmbeddingRuntime::load(SemanticEmbeddingDevice::Gpu)?;
    let gpu_vectors = gpu.embed(&documents)?;
    let minimum_cosine = cpu_vectors
        .iter()
        .zip(&gpu_vectors)
        .map(|(left, right)| cosine(&left.vector, &right.vector))
        .fold(1.0_f64, f64::min);
    if minimum_cosine < 0.999 {
        return Err(format!(
            "SEMANTIC_CPU_GPU_COSINE_BELOW_THRESHOLD:{minimum_cosine}"
        ));
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "model": "intfloat/multilingual-e5-small",
            "cpuProvider": cpu.provider(),
            "gpuProvider": gpu.provider(),
            "gpuFallbackReason": gpu.fallback_reason(),
            "sampleCount": documents.len(),
            "minimumCosine": minimum_cosine,
            "pass": true
        }))
        .map_err(|error| error.to_string())?
    );
    Ok(())
}
