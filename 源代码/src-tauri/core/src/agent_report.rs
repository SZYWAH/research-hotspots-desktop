use crate::agent::{canonical_value_sha256, validate_storable_json};
use crate::agent_tools::{
    validate_untrusted_json, AgentHotspotEvidence, AgentHotspotEvidenceResult, AgentPaperEvidence,
    AgentSnapshotState, AGENT_DEEP_REPORT_PAPER_LIMIT, AGENT_SIMPLE_REPORT_PAPER_LIMIT,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const AGENT_MINIMUM_EVIDENCE_PAPERS: usize = 3;
pub const AGENT_REPORT_ARTIFACT_MAX_BYTES: usize = 8 * 1024 * 1024;
pub const REQUIRED_REPORT_SECTIONS: [&str; 6] = [
    "热点概述",
    "代表论文",
    "年度趋势",
    "来源分布",
    "关键词网络",
    "未来方向",
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentReportMode {
    Simple,
    Deep,
}

impl AgentReportMode {
    pub fn paper_limit(self) -> usize {
        match self {
            Self::Simple => AGENT_SIMPLE_REPORT_PAPER_LIMIT,
            Self::Deep => AGENT_DEEP_REPORT_PAPER_LIMIT,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentEvidenceBundle {
    pub schema_version: u32,
    pub project_id: String,
    pub snapshot: AgentSnapshotState,
    pub topic: String,
    pub mode: AgentReportMode,
    pub hotspot_ids: Vec<String>,
    pub hotspots: Vec<AgentHotspotEvidence>,
    pub papers: Vec<AgentPaperEvidence>,
    pub missing_paper_ids: Vec<String>,
    pub truncated: bool,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPlannerEvidenceView {
    pub artifact_id: String,
    pub snapshot_id: String,
    pub paper_count: usize,
    pub hotspot_count: usize,
    pub truncated: bool,
    pub papers: Vec<AgentPaperSummaryForPlanner>,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentPaperSummaryForPlanner {
    pub id: String,
    pub title: String,
    pub year: Option<i64>,
    pub source: String,
    pub field: String,
    pub abstract_excerpt: String,
    pub untrusted_data: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentReportDraft {
    pub schema_version: u32,
    pub project_id: String,
    pub snapshot_id: String,
    pub topic: String,
    pub mode: AgentReportMode,
    pub evidence_artifact_id: String,
    pub paper_ids: Vec<String>,
    pub content: String,
    pub supersedes_artifact_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentReportRiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentReportMetrics {
    pub citation_coverage: f64,
    pub citation_accuracy: f64,
    pub consistency_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentReportAudit {
    pub cited_indices: Vec<usize>,
    pub valid_citation_count: usize,
    pub invalid_citation_count: usize,
    pub uncited_paper_count: usize,
    pub unreferenced_paragraphs: Vec<String>,
    pub coverage_explanation: String,
    pub missing_required_sections: Vec<String>,
    pub evidence_profile_present: bool,
    pub risk_level: AgentReportRiskLevel,
    pub metrics: AgentReportMetrics,
    pub report_content_hash: String,
    pub evidence_content_hash: String,
}

pub fn build_evidence_bundle(
    project_id: &str,
    topic: &str,
    mode: AgentReportMode,
    evidence: AgentHotspotEvidenceResult,
) -> Result<AgentEvidenceBundle, String> {
    let topic = topic.trim();
    if topic.is_empty() || topic.chars().count() > 500 {
        return Err("AGENT_EVIDENCE_TOPIC_INVALID".into());
    }
    if evidence.snapshot.project_id != project_id {
        return Err("AGENT_EVIDENCE_PROJECT_MISMATCH".into());
    }
    let limit = mode.paper_limit();
    let mut seen = HashSet::new();
    let mut papers = evidence
        .papers
        .into_iter()
        .filter(|paper| seen.insert(paper.id.clone()))
        .collect::<Vec<_>>();
    let truncated = papers.len() > limit;
    papers.truncate(limit);
    if papers.len() < AGENT_MINIMUM_EVIDENCE_PAPERS {
        return Err(format!("AGENT_EVIDENCE_INSUFFICIENT:{}", papers.len()));
    }
    let bundle = AgentEvidenceBundle {
        schema_version: 1,
        project_id: project_id.into(),
        snapshot: evidence.snapshot,
        topic: topic.into(),
        mode,
        hotspot_ids: evidence
            .hotspots
            .iter()
            .map(|hotspot| hotspot.id.clone())
            .collect(),
        hotspots: evidence.hotspots,
        papers,
        missing_paper_ids: evidence.missing_paper_ids,
        truncated,
        untrusted_data: true,
    };
    validate_evidence_bundle(&bundle)?;
    Ok(bundle)
}

pub fn validate_evidence_bundle(bundle: &AgentEvidenceBundle) -> Result<(), String> {
    if bundle.schema_version != 1 || bundle.project_id.trim().is_empty() {
        return Err("AGENT_EVIDENCE_SCHEMA_INVALID".into());
    }
    if bundle.snapshot.project_id != bundle.project_id {
        return Err("AGENT_EVIDENCE_PROJECT_MISMATCH".into());
    }
    if bundle.papers.len() < AGENT_MINIMUM_EVIDENCE_PAPERS {
        return Err(format!(
            "AGENT_EVIDENCE_INSUFFICIENT:{}",
            bundle.papers.len()
        ));
    }
    if bundle.papers.len() > bundle.mode.paper_limit() {
        return Err("AGENT_EVIDENCE_PAPER_LIMIT_EXCEEDED".into());
    }
    if bundle.hotspots.len() > 5 || bundle.hotspot_ids.len() > 5 {
        return Err("AGENT_EVIDENCE_HOTSPOT_LIMIT_EXCEEDED".into());
    }
    if !bundle.untrusted_data || bundle.papers.iter().any(|paper| !paper.untrusted_data) {
        return Err("AGENT_EVIDENCE_UNTRUSTED_MARKER_REQUIRED".into());
    }
    let unique_papers = bundle
        .papers
        .iter()
        .map(|paper| paper.id.as_str())
        .collect::<HashSet<_>>();
    if unique_papers.len() != bundle.papers.len() {
        return Err("AGENT_EVIDENCE_DUPLICATE_PAPER".into());
    }
    validate_untrusted_json(
        &serde_json::to_value(bundle)
            .map_err(|error| format!("AGENT_EVIDENCE_SERIALIZE_FAILED:{error}"))?,
    )?;
    Ok(())
}

pub fn planner_evidence_view(
    artifact_id: &str,
    bundle: &AgentEvidenceBundle,
) -> Result<AgentPlannerEvidenceView, String> {
    validate_evidence_bundle(bundle)?;
    if artifact_id.trim().is_empty() {
        return Err("AGENT_EVIDENCE_ARTIFACT_ID_REQUIRED".into());
    }
    Ok(AgentPlannerEvidenceView {
        artifact_id: artifact_id.into(),
        snapshot_id: bundle.snapshot.snapshot_id.clone(),
        paper_count: bundle.papers.len(),
        hotspot_count: bundle.hotspots.len(),
        truncated: bundle.truncated,
        papers: bundle
            .papers
            .iter()
            .map(|paper| AgentPaperSummaryForPlanner {
                id: paper.id.clone(),
                title: paper.title.clone(),
                year: paper.year,
                source: paper.source.clone(),
                field: paper.field.clone(),
                abstract_excerpt: truncate_chars(&paper.abstract_text, 480),
                untrusted_data: true,
            })
            .collect(),
        untrusted_data: true,
    })
}

pub fn build_report_draft(
    evidence_artifact_id: &str,
    evidence: &AgentEvidenceBundle,
    raw_content: &str,
    supersedes_artifact_id: Option<String>,
) -> Result<AgentReportDraft, String> {
    validate_evidence_bundle(evidence)?;
    if evidence_artifact_id.trim().is_empty() {
        return Err("AGENT_EVIDENCE_ARTIFACT_ID_REQUIRED".into());
    }
    if raw_content.trim().is_empty() {
        return Err("AGENT_REPORT_CONTENT_REQUIRED".into());
    }
    let normalized = normalize_report_output(raw_content, &evidence.topic, evidence);
    validate_untrusted_json(&json!({"content": normalized}))?;
    if normalized.len() > AGENT_REPORT_ARTIFACT_MAX_BYTES {
        return Err("AGENT_REPORT_CONTENT_TOO_LARGE".into());
    }
    Ok(AgentReportDraft {
        schema_version: 1,
        project_id: evidence.project_id.clone(),
        snapshot_id: evidence.snapshot.snapshot_id.clone(),
        topic: evidence.topic.clone(),
        mode: evidence.mode,
        evidence_artifact_id: evidence_artifact_id.into(),
        paper_ids: evidence
            .papers
            .iter()
            .map(|paper| paper.id.clone())
            .collect(),
        content: normalized,
        supersedes_artifact_id,
    })
}

pub fn audit_report(
    report: &AgentReportDraft,
    evidence: &AgentEvidenceBundle,
) -> Result<AgentReportAudit, String> {
    validate_evidence_bundle(evidence)?;
    if report.schema_version != 1
        || report.project_id != evidence.project_id
        || report.snapshot_id != evidence.snapshot.snapshot_id
        || report.paper_ids
            != evidence
                .papers
                .iter()
                .map(|paper| paper.id.clone())
                .collect::<Vec<_>>()
    {
        return Err("AGENT_REPORT_EVIDENCE_MISMATCH".into());
    }
    validate_untrusted_json(&json!({"content": report.content}))?;
    // Reference-list numbering is bibliographic metadata, not evidence that a
    // claim in the narrative was cited. Audit only the body before the first
    // reference heading so an uncited draft cannot gain artificial coverage
    // from the deterministic reference section appended during normalization.
    let auditable_content = strip_reference_section(&report.content);
    let cited_indices = extract_citation_indices(&auditable_content);
    let valid = cited_indices
        .iter()
        .copied()
        .filter(|index| *index >= 1 && *index <= evidence.papers.len())
        .collect::<Vec<_>>();
    let invalid_citation_count = cited_indices.len().saturating_sub(valid.len());
    let uncited_paper_count = evidence
        .papers
        .len()
        .saturating_sub(valid.iter().copied().collect::<HashSet<_>>().len());
    let paragraphs = auditable_content
        .split("\n\n")
        .map(str::trim)
        .filter(|part| {
            part.chars().count() > 80
                && !is_heading(part)
                && extract_citation_indices(part).is_empty()
        })
        .take(8)
        .map(str::to_string)
        .collect::<Vec<_>>();
    let vague_signals = ["显著", "重要", "巨大潜力", "广泛应用", "突破", "前景广阔"];
    let ungrounded = paragraphs
        .iter()
        .filter(|paragraph| {
            vague_signals
                .iter()
                .any(|signal| paragraph.contains(signal))
        })
        .cloned()
        .collect::<Vec<_>>();
    let coverage = if evidence.papers.is_empty() {
        0.0
    } else {
        valid.len() as f64 / evidence.papers.len() as f64
    };
    let missing_required_sections = REQUIRED_REPORT_SECTIONS
        .iter()
        .filter(|section| !auditable_content.contains(**section))
        .map(|section| (*section).to_string())
        .collect::<Vec<_>>();
    let evidence_profile_present =
        auditable_content.contains("## 证据概览") || auditable_content.contains("##证据概览");
    let risk_level = if invalid_citation_count > 0
        || paragraphs.len() >= 5
        || coverage < 0.25
        || missing_required_sections.len() >= 3
        || !evidence_profile_present
    {
        AgentReportRiskLevel::High
    } else if paragraphs.len() >= 2 || coverage < 0.5 || !missing_required_sections.is_empty() {
        AgentReportRiskLevel::Medium
    } else {
        AgentReportRiskLevel::Low
    };
    let report_content_hash = content_sha256(&report.content)?;
    let evidence_content_hash = canonical_value_sha256(
        &serde_json::to_value(evidence)
            .map_err(|error| format!("AGENT_EVIDENCE_SERIALIZE_FAILED:{error}"))?,
    )?;
    Ok(AgentReportAudit {
        cited_indices: valid.clone(),
        valid_citation_count: valid.len(),
        invalid_citation_count,
        uncited_paper_count,
        unreferenced_paragraphs: if ungrounded.is_empty() {
            paragraphs
        } else {
            ungrounded
        },
        coverage_explanation: format!(
            "报告引用了 {} 个有效编号，覆盖约 {}% 的绑定文献；未覆盖 {} 篇。",
            valid.len(),
            (coverage * 100.0).round() as i64,
            uncited_paper_count
        ),
        missing_required_sections,
        evidence_profile_present,
        risk_level,
        metrics: evaluate_report_quality(&auditable_content, evidence.papers.len()),
        report_content_hash,
        evidence_content_hash,
    })
}

pub fn normalize_report_output(
    raw_content: &str,
    topic: &str,
    evidence: &AgentEvidenceBundle,
) -> String {
    let mut content = strip_code_fence(raw_content.trim());
    content = strip_leading_acknowledgement(&content);
    content = strip_reference_section(&content);
    if !content.trim_start().starts_with('#') {
        content = format!("# {topic} 学术综述\n\n{}", content.trim());
    }
    if !content.contains("## 证据概览") && !content.contains("##证据概览") {
        content = inject_after_title(&content, &build_evidence_profile_markdown(evidence));
    }
    let cited = extract_citation_indices(&content);
    format!(
        "{}\n\n{}",
        content.trim(),
        build_reference_section(&evidence.papers, &cited)
    )
    .trim()
    .to_string()
}

pub fn build_reference_section(papers: &[AgentPaperEvidence], cited_indices: &[usize]) -> String {
    let selected = if cited_indices.is_empty() {
        (1..=papers.len()).collect::<Vec<_>>()
    } else {
        cited_indices
            .iter()
            .copied()
            .filter(|index| *index >= 1 && *index <= papers.len())
            .collect()
    };
    if selected.is_empty() {
        return "## 参考文献\n暂无可用参考文献。".into();
    }
    let mut lines = vec!["## 参考文献".to_string()];
    for index in selected {
        let paper = &papers[index - 1];
        let year = paper
            .year
            .map(|value| value.to_string())
            .unwrap_or_else(|| "未知年份".into());
        let locator = paper.url.as_deref().or(paper.doi.as_deref()).unwrap_or("");
        lines.push(format!(
            "[{index}] {}. {}, {year}.{}",
            paper.title,
            paper.source,
            if locator.is_empty() {
                String::new()
            } else {
                format!(" {locator}")
            }
        ));
    }
    lines.join("\n")
}

pub fn build_evidence_profile_markdown(evidence: &AgentEvidenceBundle) -> String {
    let years = evidence
        .papers
        .iter()
        .filter_map(|paper| paper.year)
        .collect::<Vec<_>>();
    let year_range = years
        .iter()
        .min()
        .zip(years.iter().max())
        .map(|(minimum, maximum)| format!("{minimum}-{maximum}"))
        .unwrap_or_else(|| "未知年份".into());
    let sources = facet_counts(evidence.papers.iter().map(|paper| paper.source.as_str()));
    let fields = facet_counts(evidence.papers.iter().map(|paper| paper.field.as_str()));
    let mut keyword_seen = HashSet::new();
    let keywords = evidence
        .hotspots
        .iter()
        .flat_map(|hotspot| hotspot.keywords.iter())
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty() && keyword_seen.insert((*value).to_string()))
        .take(12)
        .collect::<Vec<_>>();
    format!(
        "## 证据概览\n- 绑定文献：{} 篇；年份范围：{year_range}。\n- 来源分布：{}。\n- 领域分布：{}。\n- 代表论文证据包：{} 篇。\n- 关键词网络：{}。",
        evidence.papers.len(),
        format_facets(&sources, "暂无来源统计"),
        format_facets(&fields, "暂无领域统计"),
        evidence.papers.len(),
        if keywords.is_empty() { "暂无关键词".into() } else { keywords.join("、") },
    )
}

pub fn extract_citation_indices(text: &str) -> Vec<usize> {
    let bytes = text.as_bytes();
    let mut indices = HashSet::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'[' {
            cursor += 1;
            continue;
        }
        let start = cursor + 1;
        let mut end = start;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        if end > start && end < bytes.len() && bytes[end] == b']' {
            if let Ok(index) = text[start..end].parse::<usize>() {
                indices.insert(index);
            }
            cursor = end + 1;
        } else {
            cursor += 1;
        }
    }
    let mut indices = indices.into_iter().collect::<Vec<_>>();
    indices.sort_unstable();
    indices
}

pub fn evaluate_report_quality(content: &str, paper_count: usize) -> AgentReportMetrics {
    if content.is_empty() || paper_count == 0 {
        return AgentReportMetrics {
            citation_coverage: 0.0,
            citation_accuracy: 0.0,
            consistency_score: 0.0,
        };
    }
    let cited = extract_citation_indices(content);
    let valid = cited
        .iter()
        .filter(|index| **index >= 1 && **index <= paper_count)
        .count();
    let citation_coverage = valid as f64 / paper_count as f64;
    let citation_accuracy = if cited.is_empty() {
        0.0
    } else {
        valid as f64 / cited.len() as f64
    };
    let density =
        (((cited.len() as f64 / content.chars().count().max(1) as f64) * 1000.0) / 8.0).min(1.0);
    AgentReportMetrics {
        citation_coverage: round4(citation_coverage),
        citation_accuracy: round4(citation_accuracy),
        consistency_score: round4(
            (citation_accuracy * 0.5 + citation_coverage * 0.3 + density * 0.2).min(1.0),
        ),
    }
}

pub fn report_and_audit_payload(
    report: &AgentReportDraft,
    audit: &AgentReportAudit,
) -> Result<Value, String> {
    let value = json!({"report": report, "audit": audit});
    validate_storable_json(&value)?;
    if serde_json::to_vec(&value)
        .map_err(|error| error.to_string())?
        .len()
        > AGENT_REPORT_ARTIFACT_MAX_BYTES
    {
        return Err("AGENT_REPORT_CONTENT_TOO_LARGE".into());
    }
    Ok(value)
}

pub fn evidence_artifact_payload(bundle: &AgentEvidenceBundle) -> Result<Value, String> {
    validate_evidence_bundle(bundle)?;
    bounded_artifact_payload(bundle)
}

pub fn report_artifact_payload(report: &AgentReportDraft) -> Result<Value, String> {
    if report.schema_version != 1 || report.content.trim().is_empty() {
        return Err("AGENT_REPORT_SCHEMA_INVALID".into());
    }
    bounded_artifact_payload(report)
}

pub fn audit_artifact_payload(audit: &AgentReportAudit) -> Result<Value, String> {
    bounded_artifact_payload(audit)
}

fn bounded_artifact_payload<T: Serialize>(payload: &T) -> Result<Value, String> {
    let value = serde_json::to_value(payload)
        .map_err(|error| format!("AGENT_ARTIFACT_SERIALIZE_FAILED:{error}"))?;
    validate_untrusted_json(&value)?;
    if serde_json::to_vec(&value)
        .map_err(|error| format!("AGENT_ARTIFACT_SERIALIZE_FAILED:{error}"))?
        .len()
        > AGENT_REPORT_ARTIFACT_MAX_BYTES
    {
        return Err("AGENT_ARTIFACT_TOO_LARGE".into());
    }
    Ok(value)
}

fn content_sha256(content: &str) -> Result<String, String> {
    canonical_value_sha256(&Value::String(content.to_string()))
}

fn strip_code_fence(content: &str) -> String {
    let trimmed = content.trim();
    if !trimmed.starts_with("```") {
        return trimmed.into();
    }
    let after_first_line = trimmed
        .find('\n')
        .map(|index| &trimmed[index + 1..])
        .unwrap_or("");
    after_first_line
        .strip_suffix("```")
        .unwrap_or(after_first_line)
        .trim()
        .to_string()
}

fn strip_leading_acknowledgement(content: &str) -> String {
    let trimmed = content.trim_start();
    for prefix in ["好的", "当然", "以下是", "下面是", "可以"] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return rest
                .trim_start_matches(|character: char| {
                    matches!(character, '，' | '。' | ' ' | '\t' | '\r' | '\n')
                })
                .to_string();
        }
    }
    trimmed.to_string()
}

fn strip_reference_section(content: &str) -> String {
    let mut kept = Vec::new();
    for line in content.lines() {
        let normalized = line
            .trim()
            .trim_start_matches('#')
            .trim()
            .to_ascii_lowercase();
        if normalized == "参考文献" || normalized == "references" {
            break;
        }
        kept.push(line);
    }
    kept.join("\n").trim().to_string()
}

fn inject_after_title(content: &str, block: &str) -> String {
    let mut lines = content.lines().map(str::to_string).collect::<Vec<_>>();
    if let Some(index) = lines
        .iter()
        .position(|line| line.trim_start().starts_with("# "))
    {
        lines.splice(
            index + 1..index + 1,
            [String::new(), block.to_string(), String::new()],
        );
        collapse_blank_lines(&lines.join("\n"))
    } else {
        collapse_blank_lines(&format!("{block}\n\n{content}"))
    }
}

fn collapse_blank_lines(content: &str) -> String {
    let mut normalized = content.trim().to_string();
    while normalized.contains("\n\n\n") {
        normalized = normalized.replace("\n\n\n", "\n\n");
    }
    normalized
}

fn is_heading(value: &str) -> bool {
    let trimmed = value.trim_start();
    trimmed.starts_with("# ")
        || trimmed.starts_with("## ")
        || trimmed.starts_with("### ")
        || trimmed.starts_with("#### ")
}

fn facet_counts<'a>(values: impl Iterator<Item = &'a str>) -> Vec<(String, usize)> {
    let mut counts = HashMap::new();
    for value in values.map(str::trim).filter(|value| !value.is_empty()) {
        *counts.entry(value.to_string()).or_insert(0usize) += 1;
    }
    let mut values = counts.into_iter().collect::<Vec<_>>();
    values.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    values.truncate(8);
    values
}

fn format_facets(values: &[(String, usize)], empty: &str) -> String {
    if values.is_empty() {
        empty.into()
    } else {
        values
            .iter()
            .map(|(value, count)| format!("{value} {count}"))
            .collect::<Vec<_>>()
            .join("；")
    }
}

fn truncate_chars(value: &str, limit: usize) -> String {
    if value.chars().count() <= limit {
        value.to_string()
    } else {
        value
            .chars()
            .take(limit.saturating_sub(1))
            .collect::<String>()
            + "…"
    }
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paper(index: usize) -> AgentPaperEvidence {
        AgentPaperEvidence {
            id: format!("p{index}"),
            title: format!("Paper {index}"),
            abstract_text: "Traceable evidence for a deterministic report.".into(),
            authors: None,
            categories: None,
            year: Some(2020 + index as i64),
            source: "arxiv".into(),
            field: "Physics".into(),
            doi: None,
            url: None,
            untrusted_data: true,
        }
    }

    fn evidence(count: usize) -> AgentEvidenceBundle {
        AgentEvidenceBundle {
            schema_version: 1,
            project_id: "project".into(),
            snapshot: AgentSnapshotState {
                project_id: "project".into(),
                snapshot_id: "snapshot".into(),
                algorithm_version: "v20".into(),
                paper_count: count as i64,
                hotspot_count: 1,
                membership_count: count as i64,
            },
            topic: "Quantum Error Correction".into(),
            mode: AgentReportMode::Simple,
            hotspot_ids: vec!["h1".into()],
            hotspots: vec![AgentHotspotEvidence {
                id: "h1".into(),
                title: "Quantum Error Correction".into(),
                field: "Physics".into(),
                keywords: vec!["quantum".into(), "error".into()],
                representative_paper_ids: (1..=count).map(|index| format!("p{index}")).collect(),
            }],
            papers: (1..=count).map(paper).collect(),
            missing_paper_ids: Vec::new(),
            truncated: false,
            untrusted_data: true,
        }
    }

    fn golden_evidence(fixture: &Value, count: usize) -> AgentEvidenceBundle {
        let papers = fixture["papers"]
            .as_array()
            .unwrap()
            .iter()
            .take(count)
            .map(|paper| AgentPaperEvidence {
                id: paper["id"].as_str().unwrap().into(),
                title: paper["title"].as_str().unwrap().into(),
                abstract_text: String::new(),
                authors: None,
                categories: None,
                year: paper["year"].as_i64(),
                source: paper["source"].as_str().unwrap().into(),
                field: paper["field"].as_str().unwrap().into(),
                doi: paper["doi"].as_str().map(str::to_string),
                url: paper["url"].as_str().map(str::to_string),
                untrusted_data: true,
            })
            .collect::<Vec<_>>();
        AgentEvidenceBundle {
            schema_version: 1,
            project_id: "project".into(),
            snapshot: AgentSnapshotState {
                project_id: "project".into(),
                snapshot_id: "snapshot".into(),
                algorithm_version: "v20".into(),
                paper_count: count as i64,
                hotspot_count: 1,
                membership_count: count as i64,
            },
            topic: fixture["topic"].as_str().unwrap().into(),
            mode: AgentReportMode::Simple,
            hotspot_ids: vec!["h1".into()],
            hotspots: vec![AgentHotspotEvidence {
                id: "h1".into(),
                title: fixture["topic"].as_str().unwrap().into(),
                field: "Quantum Physics".into(),
                keywords: fixture["keywords"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|keyword| keyword.as_str().unwrap().into())
                    .collect(),
                representative_paper_ids: papers.iter().map(|paper| paper.id.clone()).collect(),
            }],
            papers,
            missing_paper_ids: Vec::new(),
            truncated: false,
            untrusted_data: true,
        }
    }

    #[test]
    fn frontend_and_core_share_report_golden_cases() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../scripts/fixtures/agent-report-golden.json"
        ))
        .unwrap();
        let normalization = &fixture["normalization"];
        let evidence = golden_evidence(
            &fixture,
            normalization["paperCount"].as_u64().unwrap() as usize,
        );
        assert_eq!(
            normalize_report_output(
                normalization["rawContent"].as_str().unwrap(),
                fixture["topic"].as_str().unwrap(),
                &evidence,
            ),
            normalization["expectedNormalized"].as_str().unwrap()
        );

        for test_case in fixture["auditCases"].as_array().unwrap() {
            let evidence =
                golden_evidence(&fixture, test_case["paperCount"].as_u64().unwrap() as usize);
            let report = AgentReportDraft {
                schema_version: 1,
                project_id: evidence.project_id.clone(),
                snapshot_id: evidence.snapshot.snapshot_id.clone(),
                topic: evidence.topic.clone(),
                mode: AgentReportMode::Simple,
                evidence_artifact_id: "evidence-golden".into(),
                paper_ids: evidence
                    .papers
                    .iter()
                    .map(|paper| paper.id.clone())
                    .collect(),
                content: test_case["content"].as_str().unwrap().into(),
                supersedes_artifact_id: None,
            };
            let audit = audit_report(&report, &evidence).unwrap();
            let actual = json!({
                "citedIndices": audit.cited_indices,
                "invalidCitationCount": audit.invalid_citation_count,
                "uncitedPaperCount": audit.uncited_paper_count,
                "missingRequiredSections": audit.missing_required_sections,
                "evidenceProfilePresent": audit.evidence_profile_present,
                "riskLevel": audit.risk_level,
                "metrics": audit.metrics,
            });
            assert_eq!(
                actual,
                test_case["expected"],
                "golden mismatch: {}",
                test_case["name"].as_str().unwrap()
            );
        }
    }

    #[test]
    fn insufficient_or_duplicate_evidence_is_rejected() {
        assert_eq!(
            validate_evidence_bundle(&evidence(2)).unwrap_err(),
            "AGENT_EVIDENCE_INSUFFICIENT:2"
        );
        let mut duplicate = evidence(3);
        duplicate.papers[2].id = duplicate.papers[1].id.clone();
        assert_eq!(
            validate_evidence_bundle(&duplicate).unwrap_err(),
            "AGENT_EVIDENCE_DUPLICATE_PAPER"
        );
    }

    #[test]
    fn normalization_is_deterministic_and_replaces_reference_section() {
        let evidence = evidence(3);
        let raw = "```markdown\n好的，内容段落 [1]\n\n## References\nold\n```";
        let first = normalize_report_output(raw, &evidence.topic, &evidence);
        let second = normalize_report_output(raw, &evidence.topic, &evidence);
        assert_eq!(first, second);
        assert!(first.starts_with("# Quantum Error Correction 学术综述"));
        assert!(first.contains("## 证据概览"));
        assert!(first.ends_with("[1] Paper 1. arxiv, 2021."));
        assert!(!first.contains("old"));
    }

    #[test]
    fn audit_matches_frontend_risk_rules_and_hashes_content() {
        let evidence = evidence(4);
        let content = [
            "# Quantum Error Correction 学术综述",
            "## 证据概览\n- 绑定文献：4 篇。",
            "## 热点概述\n研究概述 [1][2]",
            "## 代表论文\n代表证据 [3][4]",
            "## 年度趋势\n按年份讨论 [1]",
            "## 来源分布\n来源均为 arxiv [2]",
            "## 关键词网络\nquantum, error [3]",
            "## 未来方向\n需要继续评估 [4]",
        ]
        .join("\n\n");
        let report = AgentReportDraft {
            schema_version: 1,
            project_id: "project".into(),
            snapshot_id: "snapshot".into(),
            topic: evidence.topic.clone(),
            mode: AgentReportMode::Simple,
            evidence_artifact_id: "evidence-1".into(),
            paper_ids: evidence
                .papers
                .iter()
                .map(|paper| paper.id.clone())
                .collect(),
            content,
            supersedes_artifact_id: None,
        };
        let first = audit_report(&report, &evidence).unwrap();
        let second = audit_report(&report, &evidence).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.risk_level, AgentReportRiskLevel::Low);
        assert_eq!(first.valid_citation_count, 4);
        assert_eq!(first.invalid_citation_count, 0);
        assert_eq!(first.report_content_hash.len(), 64);
    }

    #[test]
    fn out_of_range_citation_and_missing_sections_are_high_risk() {
        let evidence = evidence(3);
        let report = AgentReportDraft {
            schema_version: 1,
            project_id: "project".into(),
            snapshot_id: "snapshot".into(),
            topic: evidence.topic.clone(),
            mode: AgentReportMode::Simple,
            evidence_artifact_id: "evidence-1".into(),
            paper_ids: evidence
                .papers
                .iter()
                .map(|paper| paper.id.clone())
                .collect(),
            content: "# Draft\n\nUnsupported [99]".into(),
            supersedes_artifact_id: None,
        };
        let audit = audit_report(&report, &evidence).unwrap();
        assert_eq!(audit.risk_level, AgentReportRiskLevel::High);
        assert_eq!(audit.invalid_citation_count, 1);
        assert!(!audit.evidence_profile_present);
    }

    #[test]
    fn generated_reference_numbers_never_count_as_narrative_citations() {
        let evidence = evidence(3);
        let body_without_citations = [
            "# Draft",
            "## 证据概览\n- 绑定文献：3 篇。",
            "## 热点概述\n正文没有引用。",
            "## 代表论文\n正文没有引用。",
            "## 年度趋势\n正文没有引用。",
            "## 来源分布\n正文没有引用。",
            "## 关键词网络\n正文没有引用。",
            "## 未来方向\n正文没有引用。",
        ]
        .join("\n\n");
        let normalized =
            normalize_report_output(&body_without_citations, &evidence.topic, &evidence);
        assert!(normalized.contains("## 参考文献"));
        assert!(normalized.contains("[1] Paper 1"));
        let report = AgentReportDraft {
            schema_version: 1,
            project_id: "project".into(),
            snapshot_id: "snapshot".into(),
            topic: evidence.topic.clone(),
            mode: AgentReportMode::Simple,
            evidence_artifact_id: "evidence-1".into(),
            paper_ids: evidence
                .papers
                .iter()
                .map(|paper| paper.id.clone())
                .collect(),
            content: normalized,
            supersedes_artifact_id: None,
        };
        let audit = audit_report(&report, &evidence).unwrap();
        assert_eq!(audit.valid_citation_count, 0);
        assert_eq!(audit.metrics.citation_coverage, 0.0);
        assert_eq!(audit.risk_level, AgentReportRiskLevel::High);
    }

    #[test]
    fn complete_but_low_coverage_report_is_medium_risk() {
        let evidence = evidence(4);
        let content = [
            "# Draft",
            "## 证据概览\n- 绑定文献：4 篇。",
            "## 热点概述\n概述 [1]",
            "## 代表论文\n代表证据",
            "## 年度趋势\n年度变化",
            "## 来源分布\n来源统计",
            "## 关键词网络\n关键词关系",
            "## 未来方向\n后续研究",
        ]
        .join("\n\n");
        let report = AgentReportDraft {
            schema_version: 1,
            project_id: "project".into(),
            snapshot_id: "snapshot".into(),
            topic: evidence.topic.clone(),
            mode: AgentReportMode::Simple,
            evidence_artifact_id: "evidence-1".into(),
            paper_ids: evidence
                .papers
                .iter()
                .map(|paper| paper.id.clone())
                .collect(),
            content,
            supersedes_artifact_id: None,
        };
        let audit = audit_report(&report, &evidence).unwrap();
        assert_eq!(audit.risk_level, AgentReportRiskLevel::Medium);
        assert_eq!(audit.valid_citation_count, 1);
        assert_eq!(audit.invalid_citation_count, 0);
        assert!(audit.missing_required_sections.is_empty());
        assert!(audit.evidence_profile_present);
    }

    #[test]
    fn planner_view_never_contains_full_abstracts() {
        let mut evidence = evidence(3);
        evidence.papers[0].abstract_text = "x".repeat(1000);
        let view = planner_evidence_view("artifact", &evidence).unwrap();
        assert!(view.papers[0].abstract_excerpt.chars().count() <= 480);
        assert!(view.untrusted_data);
    }
}
