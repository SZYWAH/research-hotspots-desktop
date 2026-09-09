import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const docsRoot = path.join(root, "docs");
const requiredDocs = [
  "PROJECT.md",
  "ROADMAP.md",
  "STATUS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "DEVELOPMENT.md",
];

const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

const readDoc = (name) => {
  const filePath = path.join(docsRoot, name);
  const exists = fs.existsSync(filePath);
  addCheck(`document exists: ${name}`, exists, filePath);
  return exists ? fs.readFileSync(filePath, "utf8") : "";
};

const docs = Object.fromEntries(requiredDocs.map((name) => [name, readDoc(name)]));

const requireText = (name, pattern, description) => {
  const value = docs[name] ?? "";
  const passed = typeof pattern === "string" ? value.includes(pattern) : pattern.test(value);
  addCheck(`${name}: ${description}`, passed, String(pattern));
};

const readEvidenceJson = (fileName) => {
  const filePath = path.join(docsRoot, "evidence", fileName);
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    addCheck(`evidence JSON parses: ${fileName}`, true, filePath);
    return value;
  } catch (error) {
    addCheck(`evidence JSON parses: ${fileName}`, false, String(error));
    return null;
  }
};

const expectedUpdateDate = {
  "PROJECT.md": "2026-09-09",
  "ROADMAP.md": "2026-09-09",
  "STATUS.md": "2026-09-09",
  "DEVELOPMENT.md": "2026-09-09",
  "ARCHITECTURE.md": "2026-09-08",
  "DECISIONS.md": "2026-09-08",
};

for (const name of requiredDocs) {
  requireText(name, `更新时间：${expectedUpdateDate[name]}`, "current update date");
  requireText(name, "P1c-R2", "current native research and side browser package");
  requireText(name, "NATIVE SPLIT WORKSPACE UNVERIFIED", "native split workspace gate");
  requireText(name, "P1c-R3", "main window ownership repair package");
  requireText(name, "P2a", "file-first import review package");
  requireText(name, "P2a-R1", "WHU background search and native review package");
  requireText(name, "P2a-R2", "authoritative snapshot and cross-view continuity package");
  requireText(name, "NATIVE PARTIAL PASS / CROSS-VIEW CONTINUITY FAIL", "development 009 native partial-pass baseline");
  requireText(name, "NATIVE CONTINUITY UNVERIFIED", "development 010 native continuity gate");
  requireText(name, "P2b", "controlled main-library commit package");
  requireText(name, "开发 011", "development 011 controlled import package");
  requireText(name, "PRODUCT UNVERIFIED", "development 011 product gate");
  requireText(name, "NATIVE CONTROLLED IMPORT PASS", "development 011 native completion gate");
  requireText(name, "P2b-R1", "early v14 compatibility package");
  requireText(name, "开发 011-R1", "development 011-R1 compatibility package");
  requireText(name, "PRODUCT FAIL / SUPERSEDED", "development 011 native failure baseline");
  requireText(name, "known-precontract-v14", "known early v14 contract class");
  requireText(name, "unknown-invalid-v14", "unknown invalid v14 contract class");
  requireText(name, "开发 011-R2", "controlled import closure and explicit local search package");
  requireText(name, "NATIVE CONTROLLED IMPORT PARTIAL PASS", "native controlled import partial-pass fact");
  requireText(name, "NATIVE LOCAL SEARCH UNVERIFIED", "native explicit local-search gate");
  requireText(name, "NATIVE CONTROLLED IMPORT AND LOCAL SEARCH PASS", "combined controlled import and local-search completion gate");
  requireText(name, "开发 012 / F1a", "single-document immutable acquisition package");
  requireText(name, "documents-v1.sqlite", "independent immutable document ledger");
  requireText(name, "AcquisitionRecord", "document acquisition record model");
  requireText(name, "DocumentVersion", "immutable document version model");
  requireText(name, "NATIVE SINGLE-DOCUMENT ACQUISITION PASS", "single-document native completion gate");
  requireText(name, "开发 012-R2", "real dynamic startup first-frame package");
  requireText(name, "开发 012-R3", "post-import dynamic visual-source package");
  requireText(name, "NATIVE STARTUP PASS", "012-R3 actual Tauri startup gate");
  requireText(name, "USER VISUAL ACCEPTANCE UNVERIFIED", "remaining user visual acceptance boundary");
  requireText(name, "开发 013", "workbench first-screen and sustained-performance package");
  requireText(name, "NATIVE PERFORMANCE UNVERIFIED", "native workbench performance gate");
  requireText(name, "USER PERFORMANCE ACCEPTANCE UNVERIFIED", "development 013 historical evidence-snapshot boundary");
  requireText(name, "USER PERFORMANCE ACCEPTANCE PASS (BOUNDED)", "development 013 bounded user feedback");
  requireText(name, "开发 014", "institution workspace R1 package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE AUTH PARTIAL PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PARTIAL PASS / USER EXPERIENCE PARTIAL PASS", "development 014 split native verification gates");
  requireText(name, "TEST-HOST UNAVAILABLE", "development 014 desktop test-host boundary");
  requireText(name, 'windows_subsystem = "windows"', "development 014 no-visible-CMD Windows entry boundary");
  requireText(name, "NATIVE AUTH PARTIAL PASS", "development 014 bounded native authentication observation");
  requireText(name, "开发 014-R3", "pure-black overlay, theory truth, and import notice repair package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE APPEARANCE PASS (BOUNDED) / NATIVE INPUT OWNERSHIP HISTORICAL FAIL / INPUT FIX IMPLEMENTED / INPUT FIX NATIVE RETEST PASS / NATIVE LIBRARY AUTH FIRST-TRANSACTION RETEST PASS / NATIVE IMPORT READ PASS / USER INPUT+AUTH EXPERIENCE PASS_BOUNDED", "development 014-R3 historical input baseline, current retests, import-read, and bounded input/auth UX gates");
  requireText(name, "NATIVE APPEARANCE PASS (BOUNDED)", "development 014-R3 bounded native appearance fact");
  requireText(name, "NATIVE INPUT OWNERSHIP HISTORICAL FAIL", "development 014-R3 historical native input baseline");
  requireText(name, "INPUT FIX IMPLEMENTED", "development 014-R3 input repair implementation state");
  requireText(name, "INPUT FIX NATIVE RETEST PASS", "development 014-R3 post-repair native input retest gate");
  requireText(name, "FIRST-TRANSACTION HISTORICAL FAIL", "development 014-R3 personal-library first-transaction historical failure");
  requireText(name, "SECOND-ENTRY PASS_BOUNDED", "development 014-R3 personal-library second-entry bounded result");
  requireText(name, "FIRST-TRANSACTION RETEST PASS", "development 014-R3 repaired first-transaction native result");
  requireText(name, "59ms", "development 014-R3 native import history notice appearance timing");
  requireText(name, "+4003ms", "development 014-R3 native import history notice still-visible timing");
  requireText(name, "+8304ms", "development 014-R3 native import history notice dismissal timing");
  requireText(name, "50.8ms", "development 014-R3 successful import reread recovery timing");
  requireText(name, "USER INPUT+AUTH EXPERIENCE PASS_BOUNDED", "development 014-R3 bounded current input and authentication experience");
  requireText(name, "clientRequestId", "institution WebView visibility ordering fence");
  requireText(name, "开发 014-R4", "task-bound discovery authentication and search-truth hardening package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE DISCOVERY AUTH PASS / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED", "development 014-R4 split native verification gates");
  requireText(name, "开发 014-R5", "fair multi-facet pagination and continuation-truth package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE PAGINATION TRUTH PASS_BOUNDED / NATIVE SEARCH TRUTH PARTIAL PASS / NATIVE UX PASS_BOUNDED", "development 014-R5 bounded pagination, search-truth, and UX gates");
  requireText(name, "targetReached", "local result-target truth");
  requireText(name, "hasMore", "nullable remote-continuation truth");
  requireText(name, "observed", "observed retrieval-position basis");
  requireText(name, "synthesized", "synthesized retrieval-position basis");
  requireText(name, "开发 015", "native document reader R1 package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE READER PASS (CODEX VISIBLE DESKTOP) / USER EXPERIENCE UNVERIFIED", "development 015 automated, visible-desktop, and user-experience gates");
  requireText(name, "document-derived-v1.sqlite", "independent rebuildable document-derived store");
  requireText(name, "user_version=2", "document-derived schema v2 contract");
  requireText(name, "active parse", "reader reopen active-parse recovery hardening");
  requireText(name, "document-reader-viewport", "single outer reader scroll owner");
  requireText(name, "CORS", "document protocol error-response visibility");
  requireText(name, /request_tasks|请求幂等历史/, "bounded research request-task history");
  requireText(name, "LRU 定向测试 1/1", "latest core request-task LRU targeted-test result");
  requireText(name, "sidera_pi_runtime_protocol", "unrelated desktop integration-target blocker");
  requireText(name, "sidera_rag", "first missing integration module");
  requireText(name, "sidera_stream_gate", "second missing integration module");
  requireText(name, "sidera_document_protocol::tests", "filtered desktop document-protocol lib-test scope");
  requireText(name, "0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND", "Windows desktop test-host exit status");
  requireText(name, "TaskDialogIndirect", "missing Windows test-host entry point");
  requireText(name, "协议断言", "document-protocol assertion boundary");
  requireText(name, "13 条既有 `dead_code` warning", "latest desktop cargo-check warning baseline");
  requireText(name, "开发 016", "document evidence workbench R2 package");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / WINDOWS STANDALONE TEST HOST PASS / NATIVE EVIDENCE UX PASS / ROTATED TEXTLAYER FIX NATIVE RETEST PASS / NATIVE INDEX PASS / USER EXPERIENCE PASS", "development 016 complete automated, host, native, index, and user gates");
  requireText(name, "document-evidence-v1.sqlite", "non-rebuildable document evidence store");
  requireText(name, "user_version=4", "document-derived schema v4 index contract");
  requireText(name, "开发 017", "current OCR and document-evidence Agent package");
  requireText(name, "user_version=5", "document-derived schema v5 OCR contract");
  requireText(name, "selected-anchor / current-page / document-retrieval", "three turn-scoped document evidence modes");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / NATIVE OCR PASS / USER OCR ACCEPTANCE PASS", "development 017-R1 implementation, native OCR, and user gates");
  requireText(name, "IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PROVIDER EVIDENCE PASS / NATIVE AGENT UX PASS / USER EXPERIENCE PASS", "development 017-R2 verified provider, native, and user gates");
  requireText(name, "sidera-017-ocr-evidence-agent-2026-08-25.json", "development 017 canonical acceptance evidence");
  requireText(name, "PARTIAL / ADAPTER DEFERRED", "P1 adapter boundary");
  requireText(name, "WOS", "manual-only WOS boundary");
  requireText(name, "CNKI", "manual-only CNKI boundary");
  requireText(name, "Scopus", "manual-only Scopus boundary");
}

for (const name of ["STATUS.md", "DEVELOPMENT.md"]) {
  requireText(name, "117/117", "latest institution workspace audit count");
  requireText(name, "cargo check --tests", "supplemental integration-target boundary");
  requireText(name, "sidera_pi_runtime_protocol", "pre-existing integration module reference drift");
  requireText(name, "--no-run", "desktop lib test binary compile-only boundary");
  requireText(name, "P0/P1/P2=0", "independent close-verification review result");
}

requireText("PROJECT.md", "## 最终目标", "final goal section");
requireText("DECISIONS.md", "D-167", "native input ownership and WebView visibility decision");
requireText("DECISIONS.md", "D-168", "task-bound discovery authentication and search-truth decision");
requireText("DECISIONS.md", "D-169", "immutable original and derived native-reader decision");
requireText("PROJECT.md", "M1.3g", "current work package");
requireText("PROJECT.md", "M1.3g-R9", "current repair package");
requireText("PROJECT.md", "M1.3g-R10", "single cruise resume package");
requireText("PROJECT.md", "M1.3h", "superseded dual focus package");
requireText("PROJECT.md", "M1.3i", "current explicit evidence focus package");
requireText("PROJECT.md", "M1.3j", "current direct focus package");
requireText("PROJECT.md", "M1.3l", "current dual immersive style package");
requireText("PROJECT.md", "M1.3m", "current unified spatial shell package");
requireText("PROJECT.md", "M1.3n", "current Agent run center package");
requireText("PROJECT.md", "M2.0a Pi 基础会话链路", "current Pi basic conversation package");
requireText("PROJECT.md", "M2.0b–R3", "completed M2.0b through R3 packages");
requireText("PROJECT.md", "M2.0b-R4", "current conversations, tools, and Liquid Glass package");
requireText("PROJECT.md", "M2.0b-R4-R1", "current conversation store and readiness repair package");
requireText("PROJECT.md", "M2.0b-R4-R2", "current background continuity and optical glass repair package");
requireText("PROJECT.md", "M2.0b-R4-R3", "current long-cache and true-streaming repair package");
requireText("PROJECT.md", "M2.0c-L0", "current WHU institution probe package");
requireText("PROJECT.md", "M2.0c-L0-R1", "current WHU official SSO repair package");
requireText("PROJECT.md", "M2.0c-L0-R2", "current WHU dynamic SSO configuration repair package");
requireText("PROJECT.md", "M2.0c-L1a", "current in-app institution session and search package");
requireText("PROJECT.md", "M2.0c-L1a-R1", "current in-app institution authentication repair package");
requireText("PROJECT.md", "M2.0c-L1a-R2", "current real institution popup and first-navigation repair package");
requireText("PROJECT.md", "M2.0c-L1a-R3", "current native institution closed-loop package");
requireText("PROJECT.md", "M2.0c-L1a-R3-R1", "current real institution search adapter package");
requireText("PROJECT.md", "M2.0c-L1a-R4", "current academic discovery and catalog downgrade package");
requireText("PROJECT.md", "P1b", "current native academic discovery closure package");
requireText("PROJECT.md", "P1b-R1", "task-bound academic result WebView repair package");
requireText("PROJECT.md", "P1b-R2", "managed discovery authentication and task resume package");
requireText("PROJECT.md", "开发 004 / P1c", "shared institution browser kernel package");
requireText("PROJECT.md", "开发 006 / P1c-R2", "native research and side browser package");
requireText("PROJECT.md", "开发 005 / P1c-R1", "previous popup and fixed viewport package");
requireText("PROJECT.md", "开发 007 / P1c-R3", "main window ownership repair package");
requireText("PROJECT.md", "开发 008 / P2a", "file-first import review package");
requireText("PROJECT.md", "开发 009 / P2a-R1", "WHU background search and native review package");
requireText("PROJECT.md", "开发 010 / P2a-R2", "authoritative snapshot and cross-view continuity package");
requireText("PROJECT.md", "开发 011 / P2b", "controlled main-library commit package");
requireText("PROJECT.md", "开发 011-R1 / P2b-R1", "early v14 compatibility package");
requireText("PROJECT.md", "whu-academic-discovery-v2", "background academic discovery connector");
requireText("PROJECT.md", "PARTIAL / ADAPTER DEFERRED", "P1 partial and adapter-deferred status");
requireText("PROJECT.md", "Sidera/import-review-v1.sqlite", "independent import review store");
requireText("PROJECT.md", "institution-shared-v1", "shared institution browser profile");
requireText("PROJECT.md", "外部 aTrust", "external aTrust session boundary");
requireText("PROJECT.md", "Sidera", "Agent product working name");
requireText("ROADMAP.md", "## 里程碑", "milestone section");
requireText("ROADMAP.md", "M1.3e 沉浸流动与理论恒星材质修订", "M1.3e stage");
requireText("ROADMAP.md", "M1.3f Agent 理论背景纵深与深空层次调整", "M1.3f stage");
requireText("ROADMAP.md", "M1.3g Agent 理论外围巡航与观测尺度恒星 LOD", "M1.3g stage");
requireText("ROADMAP.md", "M1.3g-R10", "R10 stage");
requireText("ROADMAP.md", "M1.3h 双背景动态语义聚焦闭环", "superseded M1.3h stage");
requireText("ROADMAP.md", "M1.3i Sidera 回答后显式证据聚焦", "current M1.3i stage");
requireText("ROADMAP.md", "M1.3j Sidera 一键直达聚焦与论文恒星近景", "current M1.3j stage");
requireText("ROADMAP.md", "M1.3k Sidera 桌面产品壳、启动页与默认入口", "current M1.3k stage");
requireText("ROADMAP.md", "M1.3l Sidera 双沉浸样式与流动知识星河", "current M1.3l stage");
requireText("ROADMAP.md", "M1.3l-R1 Sidera 全局星空导航壳", "current M1.3l-R1 stage");
requireText("ROADMAP.md", "M1.3m 统一星空外壳与空间页面", "current M1.3m stage");
requireText("ROADMAP.md", "M1.3m-R1 工作台可读性与全局控件安全区修订", "current M1.3m-R1 stage");
requireText("ROADMAP.md", "M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复", "frozen M1.3m-R3 stage");
requireText("ROADMAP.md", "已完成工作包：M1.3n Sidera Agent 运行中心", "completed M1.3n stage");
requireText("ROADMAP.md", "已完成工作包：M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复", "completed M2.0b-R4-R3 stage");
requireText("ROADMAP.md", "### 开发 006 / P1c-R2 原生研究双栏与侧边机构浏览器收口", "current P1c-R2 stage");
requireText("ROADMAP.md", "### 开发 007 / P1c-R3 主窗口所有权窄修", "main window ownership repair stage");
requireText("ROADMAP.md", "### 开发 009 / P2a-R1 武大后台检索连接器与原生审查闭环", "current background search and review stage");
requireText("ROADMAP.md", "### 开发 010 / P2a-R2 后台检索快照权威化与跨页连续性修复", "current authoritative snapshot and continuity stage");
requireText("ROADMAP.md", "### 前序开发 011 / P2b 受控主库提交与来源治理", "previous controlled main-library commit stage");
requireText("ROADMAP.md", "### 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全", "early v14 compatibility stage");
requireText("ROADMAP.md", "### 前序开发 008 / P2a 文件题录审查与身份基座", "previous import review stage");
requireText("ROADMAP.md", "### 开发 005 / P1c-R1 真实弹窗语义与固定浏览器视口修复", "previous P1c-R1 stage");
requireText("ROADMAP.md", "### 前序 P1c 通用机构浏览器内核、应用内认证与下载基座", "previous P1c stage");
requireText("ROADMAP.md", "### 前序 P1b-R2 统一发现认证回写与任务恢复闭环", "previous P1b-R2 stage");
requireText("ROADMAP.md", "### P1b-R1 统一发现真实分面与原生快照闭环", "previous P1b-R1 stage");
requireText("ROADMAP.md", "前序工作包：M2.0c-L1a-R4 论文级统一发现与馆藏目录降级修复", "superseded M2.0c-L1a-R4 stage");
requireText("ROADMAP.md", "### L1b 受控题录导入", "controlled metadata import follow-up");
requireText("ROADMAP.md", "### L1a 应用内机构会话与多库检索预览", "L1a in-app discovery route");
requireText("STATUS.md", "当前分支：`codex/sidera-m2-rag`", "current branch");
requireText("STATUS.md", "M1.3g 收口与 M1.3h 启动", "R10 closure and M1.3h handoff");
requireText("STATUS.md", "IN_PROGRESS / PRODUCT UNVERIFIED", "current status");
requireText("STATUS.md", /M1\.3k[\s\S]*桌面产品壳/, "M1.3k desktop shell status");
requireText("STATUS.md", "M1.3l 双沉浸样式与流动知识星河（用户视觉 PASS）", "completed M1.3l status");
requireText("STATUS.md", "## 2026-08-01 M1.3m 统一星空外壳与空间页面", "M1.3m architecture status");
requireText("STATUS.md", "M1.3m-R3 及 M1.3m 据此记录为技术与用户视觉 `PASS`", "frozen M1.3m-R3 status");
requireText("STATUS.md", "## 2026-08-05 开发 010 / P2a-R2 后台检索快照权威化与跨页连续性修复", "previous authoritative snapshot and continuity status");
requireText("STATUS.md", "## 2026-08-05 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全", "current early v14 compatibility status");
requireText("STATUS.md", "## 2026-08-06 开发 011-R2 / P2b-R2 受控入库收口与本地检索性能修复", "current controlled import and explicit local search status");
requireText("STATUS.md", "## 2026-08-06 开发 012 / F1a 单篇文档身份与不可变获取基座", "current immutable single-document status");
requireText("ARCHITECTURE.md", "## 开发 011-R1 / P2b-R1 早期 v14 兼容识别与安全补全", "early v14 compatibility architecture");
requireText("ARCHITECTURE.md", "## 开发 011-R2 / P2b-R2 提交账本权威与本地显式检索", "controlled import ledger and explicit local-search architecture");
requireText("ARCHITECTURE.md", "## 开发 012 / F1a 单篇不可变文档基座", "immutable single-document architecture");
requireText("DECISIONS.md", "D-158：v14 必须先按完整契约分类", "early v14 compatibility decision");
requireText("DECISIONS.md", "D-159：提交结果以主库账本为权威；本地文献检索必须由用户显式执行", "authoritative commit ledger and explicit local-search decision");
requireText("DECISIONS.md", "D-160：全文文件采用独立获取账本与SHA-256不可变版本，不写回题录主表", "immutable document ledger decision");
requireText("STATUS.md", "开发 008 / P2a", "current import review status");
requireText("STATUS.md", "PARTIAL / ADAPTER DEFERRED", "P1 partial and adapter-deferred status");
requireText("STATUS.md", "已有网页滚动实机`PASS`继续保留", "accepted embedded browser scrolling result");
requireText("STATUS.md", "产品构图与原生功能连续性为`FAIL`", "accepted pre-P1c-R2 composition failure");
requireText("DEVELOPMENT.md", "PROVIDER ACCESS PASS / POPUP ROUTING FAIL / EMBEDDED BROWSER PERFORMANCE FAIL", "historical P1c-R1 native baseline");
requireText("STATUS.md", "P1 继续冻结为 `PARTIAL / ADAPTER DEFERRED`", "P1 partial closure with adapter deferred");
requireText("STATUS.md", "DISCOVERY AUTH CALLBACK/STATE SYNC FAIL", "latest native discovery authentication fact");
requireText("STATUS.md", "NATIVE IN-APP INSTITUTION AUTH FAIL / SUPERSEDED", "superseded M2.0c-L1a-R1 native failure result");
requireText("STATUS.md", "NATIVE IN-APP SEARCH FAIL / SUPERSEDED", "superseded M2.0c-L1a native failure result");
requireText("STATUS.md", "NATIVE ACCESS PROBE PASS", "accepted L0-R2 native probe result");
requireText("PROJECT.md", "### 产品定位：不是图书馆网页套壳", "native research workflow product positioning");
requireText("PROJECT.md", "### 最终用户闭环", "final user loop");
requireText("PROJECT.md", "### 最终表现形态", "final product surfaces");
requireText("ROADMAP.md", "### 面向最终产品的统一实施序列", "unified product delivery sequence");
requireText("ROADMAP.md", "P2 受控题录导入与论文身份", "next controlled metadata import stage");
requireText("ARCHITECTURE.md", "## 现有基础", "as-built architecture section");
requireText("ARCHITECTURE.md", "## 最终产品目标架构（规划，不代表当前已实现）", "planned final product architecture");
requireText("DECISIONS.md", "D-033", "GPGPU flow decision");
requireText("DECISIONS.md", "D-034", "analytic fallback decision");
requireText("DECISIONS.md", "D-035", "stellar material decision");
requireText("DECISIONS.md", "D-036", "documentation governance decision");
requireText("DECISIONS.md", "D-144：Sidera 拥有原生科研工作流", "native research workflow ownership decision");
requireText("DECISIONS.md", "D-145：机构资源必须以统一发现、数据库直达、馆藏目录三个产品表面呈现", "institution three-surface decision");
requireText("DECISIONS.md", "D-146：统一发现的资源类型限制必须由页面确认", "academic filter confirmation decision");
requireText("DECISIONS.md", "D-147：active search 必须拥有任务绑定结果 WebView", "task-bound academic result WebView decision");
requireText("DECISIONS.md", "D-037", "Agent theory depth decision");
requireText("DECISIONS.md", "D-038", "deep-field layer decision");
requireText("DECISIONS.md", "D-039", "ambient co-orbit decision");
requireText("DECISIONS.md", "D-042", "perimeter cruise decision");
requireText("DECISIONS.md", "D-043", "Explore return decision");
requireText("DECISIONS.md", "D-044", "observational stellar LOD decision");
requireText("DECISIONS.md", "D-045", "runtime WebGL readiness and coordinate-unit decision");
requireText("DECISIONS.md", "D-046", "screen-space LOD and Explore pivot decision");
requireText("DECISIONS.md", "D-047", "interaction hot-path isolation decision");
requireText("DECISIONS.md", "D-055", "continuous visibility floor decision");
requireText("DECISIONS.md", "D-056", "perceptible hotspot energy decision");
requireText("DECISIONS.md", "D-057", "frozen Explore return anchor decision");
requireText("DECISIONS.md", "D-058", "exact Explore anchor return decision");
requireText("DECISIONS.md", "D-059", "unified camera LOD and dialog return decision");
requireText("DECISIONS.md", "D-060", "continuous Agent theory label decision");
requireText("DECISIONS.md", "D-061", "hierarchical Agent theory navigation decision");
requireText("DECISIONS.md", "D-062", "cruise liveness proof decision");
requireText("DECISIONS.md", "D-063", "Agent theory system paper visibility decision");
requireText("DECISIONS.md", "D-064", "live guard cruise proof decision");
requireText("DECISIONS.md", "D-065", "second system paper visibility decision");
requireText("DECISIONS.md", "D-066", "non-blocking visibility guidance decision");
requireText("DECISIONS.md", "D-067", "continuous cruise randomness decision");
requireText("DECISIONS.md", "D-068", "worker cruise guidance decision");
requireText("DECISIONS.md", "D-072", "single cruise resume decision");
requireText("DECISIONS.md", "D-073", "dual focus identity decision");
requireText("DECISIONS.md", "D-074", "immersive focus decision");
requireText("DECISIONS.md", "D-075", "theory focus decision");
requireText("DECISIONS.md", "D-076", "theory focus lifecycle ownership decision");
requireText("DECISIONS.md", "D-077", "streaming answer background stability decision");
requireText("DECISIONS.md", "D-078", "explicit evidence stage decision");
requireText("DECISIONS.md", "D-079", "no immersive context relocation decision");
requireText("DECISIONS.md", "D-080", "opposite-side evidence card decision");
requireText("DECISIONS.md", "D-081", "Sidera working-name decision");
requireText("DECISIONS.md", "D-082", "single timeline direct focus decision");
requireText("DECISIONS.md", "D-083", "single target carousel decision");
requireText("DECISIONS.md", "D-084", "fixed dialog geometry decision");
requireText("DECISIONS.md", "D-085", "real paper photosphere decision");
requireText("DECISIONS.md", "D-086", "in-flight direct-route ownership decision");
requireText("DECISIONS.md", "D-087", "Sidera default desktop shell decision");
requireText("DECISIONS.md", "D-088", "Sidera startup and window chrome decision");
requireText("DECISIONS.md", "D-089", "dual immersive style decision");
requireText("DECISIONS.md", "D-090", "stable star-river composition decision");
requireText("DECISIONS.md", "D-091", "unified transparent Agent navigation decision");
requireText("DECISIONS.md", "D-092", "global transparent navigation decision");
requireText("DECISIONS.md", "D-093", "workbench star-river decision");
requireText("DECISIONS.md", "D-094", "exclusive research galaxy decision");
requireText("DECISIONS.md", "D-095", "pipeline spatial ownership decision");
requireText("DECISIONS.md", "D-096", "workbench navigation reserve decision");
requireText("DECISIONS.md", "D-097", "titlebar navigation ownership decision");
requireText("DECISIONS.md", "D-098", "research galaxy fullscreen ownership decision");
requireText("DECISIONS.md", "D-099", "research galaxy original-screen mode handoff decision");
requireText("DECISIONS.md", "D-100", "research galaxy single context rail decision");
requireText("DECISIONS.md", "D-101", "research galaxy titlebar tool ownership decision");
requireText("DECISIONS.md", "D-102", "edge navigation decision");
requireText("DECISIONS.md", "D-103", "discriminated context rail state decision");
requireText("DECISIONS.md", "D-104", "frozen unified shell baseline decision");
requireText("DECISIONS.md", "D-105", "internal Agent run center view decision");
requireText("DECISIONS.md", "D-106", "inbox-first run center decision");
requireText("DECISIONS.md", "D-107", "research-report-only creation decision");
requireText("DECISIONS.md", "D-108", "Rust managed Pi RPC decision");
requireText("DECISIONS.md", "D-109", "tool-free in-memory Pi stage decision");
requireText("DECISIONS.md", "D-110", "no silent legacy chat fallback decision");
requireText("DECISIONS.md", "D-111", "Sidera-only Pi tools decision");
requireText("DECISIONS.md", "D-112", "hybrid E5 and LIKE retrieval decision");
requireText("DECISIONS.md", "D-113", "turn evidence closure decision");
requireText("DECISIONS.md", "D-114", "untrusted database content decision");
requireText("DECISIONS.md", "D-118", "measured Agent focus composition decision");
requireText("DECISIONS.md", "D-119", "single research-galaxy spatial timeline decision");
requireText("DECISIONS.md", "D-120", "physical-canvas research-galaxy center decision");
requireText("DECISIONS.md", "D-121", "canonical overview orbit pivot decision");
requireText("DECISIONS.md", "D-122", "fixed Agent reading dialog decision");
requireText("DECISIONS.md", "D-123", "dual UI and Pi session persistence decision");
requireText("DECISIONS.md", "D-124", "centered history drawer composition decision");
requireText("DECISIONS.md", "D-125", "Rust audited system tools decision");
requireText("DECISIONS.md", "D-126", "auto and long cache policy decision");
requireText("DECISIONS.md", "D-127", "static Liquid Glass material decision");
requireText("DECISIONS.md", "D-128", "non-destructive conversation schema repair decision");
requireText("DECISIONS.md", "D-129", "background Agent turn ownership decision");
requireText("DECISIONS.md", "D-130", "clear optical glass material decision");
requireText("DECISIONS.md", "D-131", "long cache default and one-time migration decision");
requireText("DECISIONS.md", "D-132", "event-driven streaming gate decision");
requireText("DECISIONS.md", "D-133", "WHU external aTrust and discovery-first decision");
requireText("DECISIONS.md", "D-134", "WHU official SSO navigation decision");
requireText("DECISIONS.md", "D-135", "WHU dynamic official configuration parsing decision");
requireText("DECISIONS.md", "D-136", "Rust-owned isolated institution WebView decision");
requireText("DECISIONS.md", "D-137", "same-WebView institution authentication popup decision");
requireText("DECISIONS.md", "D-138", "shared-environment institution authentication popup decision");
requireText("DECISIONS.md", "D-139", "institution navigation evidence and DOM readiness decision");
requireText("DECISIONS.md", "D-140", "open institution network navigation decision");
requireText("DECISIONS.md", "D-141", "authenticated MetaERS landing handoff decision");
requireText("DECISIONS.md", "D-142", "real query submission and result identity decision");
requireText("DECISIONS.md", "D-143", "paper-first academic discovery and auxiliary catalog decision");
requireText("DECISIONS.md", "D-148", "independent discovery authentication and managed resume decision");
requireText("DECISIONS.md", "D-149", "shared institution browser ownership decision");
requireText("DECISIONS.md", "D-150", "compatibility-first popup decision");
requireText("DECISIONS.md", "D-151", "fixed browser viewport and geometry decision");
requireText("DECISIONS.md", "D-152", "native research and side browser presentation decision");
requireText("DECISIONS.md", "D-153", "real main window ownership decision");
requireText("DECISIONS.md", "D-154", "P1 partial closure and file-first P2 decision");
requireText("DECISIONS.md", "D-155", "background search to native review pipeline decision");
requireText("ARCHITECTURE.md", "whu-academic-discovery-v1", "current WHU academic discovery adapter architecture");
requireText("ARCHITECTURE.md", "whu-opac-catalog-v3", "current WHU auxiliary catalog adapter architecture");
requireText("ARCHITECTURE.md", "P1c-R1 兼容优先 popup bridge 与固定浏览器视口", "current P1c-R1 browser architecture");
requireText("ARCHITECTURE.md", "P1c-R2 原生研究双栏与侧边机构浏览器", "current P1c-R2 browser architecture");
requireText("ARCHITECTURE.md", "P1c-R3 真实主窗口宿主与应用自有窗口所有权", "main window ownership architecture");
requireText("ARCHITECTURE.md", "P2a 文件题录审查与身份解析基座", "file import review architecture");
requireText("ARCHITECTURE.md", "P2a-R1 武大后台检索连接器与原生审查闭环", "background search and native review architecture");
requireText("ARCHITECTURE.md", "P2a-R2 后台检索单一状态权威与跨页连续性", "authoritative snapshot and cross-view lifecycle architecture");
requireText("ARCHITECTURE.md", "whu-academic-discovery-v2", "background academic discovery connector architecture");
requireText("ARCHITECTURE.md", "前序 P1c 共享机构浏览器、认证模态与下载暂存", "previous P1c browser architecture");
requireText("ARCHITECTURE.md", "P1b-R2 统一发现认证状态、受管弹窗与可暂停任务恢复", "previous P1b-R2 architecture");
requireText("DECISIONS.md", "D-156：后台检索展示快照与活动尝试分离；普通页面导航不拥有任务生命周期", "authoritative snapshot and navigation lifecycle decision");
requireText(
  "STATUS.md",
  "agent-m1.3g-r10-single-cruise-resume-2026-07-30.json",
  "R10 evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3h-dual-semantic-focus-2026-07-30.json",
  "M1.3h technical evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3i-explicit-evidence-focus-2026-07-30.json",
  "M1.3i evidence link",
);
requireText(
  "STATUS.md",
  "agent-m1.3j-direct-focus-photosphere-2026-07-31.json",
  "M1.3j evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-unified-spatial-shell-2026-08-01.json",
  "M1.3m evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r1-workbench-navigation-2026-08-01.json",
  "M1.3m-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json",
  "M1.3m-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json",
  "M1.3m-R3 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m1.3n-agent-run-center-2026-08-01.json",
  "M1.3n evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0a-pi-basic-conversation-2026-08-01.json",
  "M2.0a evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-pi-local-paper-rag-2026-08-02.json",
  "M2.0b evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-r3-conversation-experience-2026-08-02.json",
  "M2.0b-R3 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json",
  "M2.0b-R4 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json",
  "M2.0b-R4-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json",
  "M2.0b-R4-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json",
  "M2.0b-R4-R3 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l0-whu-institution-probe-2026-08-03.json",
  "M2.0c-L0 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l0-r1-whu-sso-route-2026-08-03.json",
  "M2.0c-L0-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l0-r2-whu-dynamic-sso-config-2026-08-03.json",
  "M2.0c-L0-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-in-app-institution-search-2026-08-03.json",
  "M2.0c-L1a evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-r1-in-app-auth-navigation-2026-08-03.json",
  "M2.0c-L1a-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json",
  "M2.0c-L1a-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json",
  "M2.0c-L1a-R3 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json",
  "M2.0c-L1a-R3-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json",
  "M2.0c-L1a-R4 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1b-whu-native-academic-discovery-2026-08-04.json",
  "P1b evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1b-r1-native-snapshot-2026-08-04.json",
  "P1b-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1b-r2-discovery-auth-resume-2026-08-04.json",
  "P1b-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1c-institution-browser-kernel-2026-08-04.json",
  "P1c evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1c-r1-popup-focus-viewport-2026-08-05.json",
  "P1c-R1 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p1c-r2-native-split-browser-2026-08-05.json",
  "P1c-R2 evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p2a-r2-native-continuity-2026-08-05.json",
  "P2a-R2 native continuity evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p2b-controlled-import-2026-08-05.json",
  "P2b controlled import evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p2b-v14-compatibility-r1-2026-08-05.json",
  "P2b-R1 v14 compatibility evidence link",
);
requireText(
  "STATUS.md",
  "sidera-p2b-r2-controlled-import-local-search-2026-08-06.json",
  "P2b-R2 controlled import and local-search evidence link",
);
requireText(
  "STATUS.md",
  "sidera-f1a-single-document-acquisition-2026-08-06.json",
  "F1a single-document acquisition evidence link",
);
addCheck(
  "M1.3m evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-unified-spatial-shell-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-unified-spatial-shell-2026-08-01.json",
);
addCheck(
  "M1.3m-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r1-workbench-navigation-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r1-workbench-navigation-2026-08-01.json",
);
addCheck(
  "M1.3m-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r2-galaxy-camera-spatial-ui-2026-08-01.json",
);
addCheck(
  "M1.3m-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json")),
  "docs/evidence/sidera-m1.3m-r3-titlebar-edge-navigation-context-rail-2026-08-01.json",
);
addCheck(
  "M1.3n evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m1.3n-agent-run-center-2026-08-01.json")),
  "docs/evidence/sidera-m1.3n-agent-run-center-2026-08-01.json",
);
addCheck(
  "M2.0a evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0a-pi-basic-conversation-2026-08-01.json")),
  "docs/evidence/sidera-m2.0a-pi-basic-conversation-2026-08-01.json",
);
addCheck(
  "M2.0b evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-pi-local-paper-rag-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-pi-local-paper-rag-2026-08-02.json",
);
addCheck(
  "M2.0b-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r1-conversation-evidence-ui-2026-08-02.json",
);
addCheck(
  "M2.0b-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r2-spatial-composition-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r2-spatial-composition-2026-08-02.json",
);
addCheck(
  "M2.0b-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r3-conversation-experience-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r3-conversation-experience-2026-08-02.json",
);
addCheck(
  "M2.0b-R4 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r4-agent-conversations-tools-liquid-glass-2026-08-02.json",
);
addCheck(
  "M2.0b-R4-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r4-r1-conversation-store-readiness-2026-08-02.json",
);
addCheck(
  "M2.0b-R4-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json")),
  "docs/evidence/sidera-m2.0b-r4-r2-background-continuity-optical-glass-2026-08-02.json",
);
addCheck(
  "M2.0b-R4-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json")),
  "docs/evidence/sidera-m2.0b-r4-r3-cache-default-true-streaming-2026-08-03.json",
);
addCheck(
  "M2.0c-L0 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l0-whu-institution-probe-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l0-whu-institution-probe-2026-08-03.json",
);
addCheck(
  "M2.0c-L0-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l0-r1-whu-sso-route-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l0-r1-whu-sso-route-2026-08-03.json",
);
addCheck(
  "M2.0c-L0-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l0-r2-whu-dynamic-sso-config-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l0-r2-whu-dynamic-sso-config-2026-08-03.json",
);
addCheck(
  "M2.0c-L1a evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-in-app-institution-search-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l1a-in-app-institution-search-2026-08-03.json",
);
addCheck(
  "M2.0c-L1a-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-r1-in-app-auth-navigation-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l1a-r1-in-app-auth-navigation-2026-08-03.json",
);
addCheck(
  "M2.0c-L1a-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l1a-r2-real-auth-popup-first-navigation-2026-08-03.json",
);
addCheck(
  "M2.0c-L1a-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json")),
  "docs/evidence/sidera-m2.0c-l1a-r3-native-closed-loop-candidate-2026-08-03.json",
);
addCheck(
  "M2.0c-L1a-R3-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json")),
  "docs/evidence/sidera-m2.0c-l1a-r3-r1-real-search-adapter-2026-08-04.json",
);
addCheck(
  "M2.0c-L1a-R4 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json")),
  "docs/evidence/sidera-m2.0c-l1a-r4-academic-discovery-2026-08-04.json",
);
addCheck(
  "P1b evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1b-whu-native-academic-discovery-2026-08-04.json")),
  "docs/evidence/sidera-p1b-whu-native-academic-discovery-2026-08-04.json",
);
addCheck(
  "P1b-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1b-r1-native-snapshot-2026-08-04.json")),
  "docs/evidence/sidera-p1b-r1-native-snapshot-2026-08-04.json",
);
addCheck(
  "P1b-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1b-r2-discovery-auth-resume-2026-08-04.json")),
  "docs/evidence/sidera-p1b-r2-discovery-auth-resume-2026-08-04.json",
);
addCheck(
  "P1c evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1c-institution-browser-kernel-2026-08-04.json")),
  "docs/evidence/sidera-p1c-institution-browser-kernel-2026-08-04.json",
);
addCheck(
  "P1c-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1c-r1-popup-focus-viewport-2026-08-05.json")),
  "docs/evidence/sidera-p1c-r1-popup-focus-viewport-2026-08-05.json",
);
addCheck(
  "P1c-R2 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1c-r2-native-split-browser-2026-08-05.json")),
  "docs/evidence/sidera-p1c-r2-native-split-browser-2026-08-05.json",
);
addCheck(
  "P1c-R3 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p1c-r3-main-window-ownership-2026-08-05.json")),
  "docs/evidence/sidera-p1c-r3-main-window-ownership-2026-08-05.json",
);
addCheck(
  "P2a evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2a-import-review-2026-08-05.json")),
  "docs/evidence/sidera-p2a-import-review-2026-08-05.json",
);
addCheck(
  "P2a-R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2a-r1-background-search-review-2026-08-05.json")),
  "docs/evidence/sidera-p2a-r1-background-search-review-2026-08-05.json",
);
addCheck(
  "P2a-R2 native continuity evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2a-r2-native-continuity-2026-08-05.json")),
  "docs/evidence/sidera-p2a-r2-native-continuity-2026-08-05.json",
);
addCheck(
  "P2b controlled import evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2b-controlled-import-2026-08-05.json")),
  "docs/evidence/sidera-p2b-controlled-import-2026-08-05.json",
);
addCheck(
  "P2b-R1 v14 compatibility evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2b-v14-compatibility-r1-2026-08-05.json")),
  "docs/evidence/sidera-p2b-v14-compatibility-r1-2026-08-05.json",
);
addCheck(
  "P2b-R2 controlled import and local-search evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-p2b-r2-controlled-import-local-search-2026-08-06.json")),
  "docs/evidence/sidera-p2b-r2-controlled-import-local-search-2026-08-06.json",
);
addCheck(
  "F1a single-document acquisition evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-f1a-single-document-acquisition-2026-08-06.json")),
  "docs/evidence/sidera-f1a-single-document-acquisition-2026-08-06.json",
);

for (const heading of [
  "## 最终目标摘要",
  "## 阶段事实",
  "## M1.3k Sidera 桌面产品壳、启动页与默认入口",
  "## M1.3l Sidera 双沉浸样式与流动知识星河",
  "## M1.3l-R1 Sidera 全局星空导航壳",
  "## 当前工作包：M1.3m 统一星空外壳与空间页面",
  "## M1.3j Sidera 一键直达聚焦与论文恒星近景",
  "### 1. 工作包",
  "### 2. 计划步骤与完成条件",
  "### 3. 实际开发日志",
  "### 4. 测试与证据",
  "### 5. 当前进度",
  "### 6. 边界与遗留",
  "## 开发总账更新规则",
]) {
  requireText("DEVELOPMENT.md", heading, heading);
}

requireText(
  "DEVELOPMENT.md",
  "220a5c4",
  "current baseline commit",
);
requireText(
  "DEVELOPMENT.md",
  "ea5c8b843dc94f328caa25e32b358150b38c1518",
  "M1.3e technical checkpoint commit",
);
requireText("DEVELOPMENT.md", "M1.3h 双背景动态语义聚焦闭环", "superseded development package");
requireText("DEVELOPMENT.md", "M1.3j Sidera 一键直达聚焦", "current development package");
requireText("DEVELOPMENT.md", "M1.3k Sidera 桌面产品壳", "current desktop shell development package");
requireText("DEVELOPMENT.md", "M1.3l Sidera 双沉浸样式与流动知识星河", "current dual immersive development package");
requireText("DEVELOPMENT.md", "M1.3l-R1 Sidera 全局星空导航壳", "current unified navigation development package");
requireText("DEVELOPMENT.md", "M1.3m 统一星空外壳与空间页面", "current unified spatial shell development package");
requireText("DEVELOPMENT.md", "M1.3m-R2 科研星图相机稳定与空间面板整合", "current research galaxy spatial development package");
requireText("DEVELOPMENT.md", "M1.3m-R3 科研星图顶部工具化、边缘导航与详情轨道修复", "current research galaxy titlebar development package");
requireText("DEVELOPMENT.md", "M1.3n Sidera Agent 运行中心", "current Agent run center development package");
requireText("DEVELOPMENT.md", "IMPLEMENTED / TECHNICAL PASS / PRODUCT UNVERIFIED", "current M1.3n status");
requireText("DEVELOPMENT.md", "M2.0a Pi 基础会话链路", "current Pi conversation development package");
requireText("DEVELOPMENT.md", "IMPLEMENTED / TECHNICAL PASS / USER ACCEPTANCE UNVERIFIED", "current M2.0a status");
requireText("DEVELOPMENT.md", "M2.0b Pi 本地论文轻量混合 RAG", "current local paper RAG development package");
requireText("DEVELOPMENT.md", "IMPLEMENTED / AUTOMATED TECHNICAL PASS / PRODUCT UNVERIFIED", "current M2.0b status");
requireText("DEVELOPMENT.md", "M2.0b-R1 对话编排、阅读面板与证据闭环", "current conversation evidence repair package");
requireText("DEVELOPMENT.md", "M2.0b-R2 对话控件与空间构图连续性", "current spatial composition repair package");
requireText("DEVELOPMENT.md", "已完成工作包：M2.0b-R4-R3 Agent 长缓存默认与真实首段流式修复", "completed long-cache and true-streaming repair package");
requireText("DEVELOPMENT.md", "当前工作包：开发 011-R1 / Sidera-P2b-R1 早期 v14 兼容识别与安全补全", "current early v14 compatibility package");
requireText("DEVELOPMENT.md", "最近完成工作包：开发 017｜按需 OCR 与页码证据 Agent", "completed OCR and document evidence Agent package");
requireText("DEVELOPMENT.md", "前序工作包：开发 016｜全文证据台 R2", "completed document evidence workbench package");
requireText("DEVELOPMENT.md", "前序工作包：开发 015｜文档原生阅读台 R1", "previous native document reader package");
requireText("DEVELOPMENT.md", "前序工作包：开发 014-R4｜任务绑定发现认证与检索真值加固", "previous discovery authentication and search-truth package");
requireText("DEVELOPMENT.md", "当前窄修：开发 014-R5｜多分面公平分页与远端继续性真值", "current fair pagination and continuation-truth repair");
requireText("DEVELOPMENT.md", "前序工作包：开发 014-R3｜纯黑浮层、星图状态与题录通知修复", "previous visual truth and notice repair package");
requireText("DEVELOPMENT.md", "前序工作包：开发 014｜机构资源工作台 R1", "previous institution workspace R1 package");
requireText("DEVELOPMENT.md", "前序工作包：开发 013｜文献工作台首屏与持续卡顿治理", "previous workbench performance package");
requireText("DEVELOPMENT.md", "前序工作包：开发 012-R3 / 冷启动动态快照重建闭环", "previous post-import dynamic visual-source package");
requireText("STATUS.md", "sidera-012-r2-dynamic-startup-first-frame-2026-08-06.json", "dynamic startup first-frame evidence");
requireText("STATUS.md", "sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json", "post-import dynamic snapshot native evidence");
requireText("STATUS.md", "sidera-013-workbench-performance-2026-08-07.json", "workbench performance evidence");
requireText("STATUS.md", "sidera-014-institution-workspace-r1-2026-08-08.json", "institution workspace R1 evidence");
requireText("STATUS.md", "sidera-014-r4-auth-search-truth-2026-08-09.json", "task-bound discovery authentication evidence");
requireText("STATUS.md", "sidera-014-r5-pagination-truth-2026-08-28.json", "fair pagination and continuation-truth evidence");
requireText("STATUS.md", "sidera-015-document-reader-r1-2026-08-09.json", "native document reader evidence");
requireText("STATUS.md", "sidera-016-document-evidence-r2-2026-08-12.json", "document evidence workbench evidence");
requireText("STATUS.md", "sidera-016-r1-native-closure-2026-08-12.json", "document evidence native closure evidence");
requireText("PROJECT.md", "sidera-014-r3-visual-truth-and-notice-2026-08-08.json", "visual truth and notice evidence");
requireText("ROADMAP.md", "开发 014-R3 纯黑浮层、星图状态与题录通知修复", "visual truth and notice roadmap package");
requireText("STATUS.md", "sidera-014-r3-visual-truth-and-notice-2026-08-08.json", "visual truth and notice status evidence");
requireText("ARCHITECTURE.md", "TheoryAvailabilityState", "theory availability state architecture");
requireText("ARCHITECTURE.md", "READ_ONLY + query_only", "prepared read-only import architecture");
requireText("DECISIONS.md", "D-166", "theory availability and import read-only decision");
requireText("DECISIONS.md", "D-170", "headless protocol and Windows test-host decision");
requireText("DECISIONS.md", "D-171", "stable page evidence and persistent annotations decision");
requireText("DECISIONS.md", "D-172", "on-demand OCR and minimal evidence Agent decision");
requireText("DECISIONS.md", "D-173", "fair multi-facet pagination and remote-continuation truth decision");
requireText("PROJECT.md", "sidera-014-r6-structured-pagination-2026-09-01.json", "structured pagination evidence");
requireText("PROJECT.md", "sidera-014-r7-session-restore-2026-09-01.json", "silent session restore evidence");
requireText("ROADMAP.md", "NATIVE STRUCTURED PAGINATION PASS", "structured pagination native gate");
requireText("ROADMAP.md", "EFFECTIVE SAVED SESSION RESTORE UNVERIFIED", "authenticated saved-session restore awaits a verified before-and-after capability pair");
requireText("ROADMAP.md", "USER EXPERIENCE UNVERIFIED", "complete saved-session user gate remains open");
requireText("STATUS.md", "OFFICIAL_LIBRARY_LOGIN_LANDING", "stable personal-library login landing classification");
requireText("STATUS.md", "NATIVE CANCELLATION PASS", "structured search cancellation native gate");
requireText("STATUS.md", "NATIVE SILENT LIFECYCLE PASS", "silent restore lifecycle native gate");
requireText("ARCHITECTURE.md", "expectedNextPage", "response-derived next-page architecture");
requireText("ARCHITECTURE.md", "institution-webview-v1/whu", "fixed institution profile architecture");
requireText("DECISIONS.md", "D-174", "structured response and official pagination decision");
requireText("DECISIONS.md", "D-175", "silent institution session restore decision");
requireText("DEVELOPMENT.md", "当前工作包：开发 014-R7", "current silent restore work package");
requireText("DEVELOPMENT.md", "最近完成工作包：开发 014-R6", "completed structured pagination work package");
requireText("DEVELOPMENT.md", "all-skip", "v14 synthetic fixture correction evidence");
addCheck(
  "dynamic startup first-frame evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-012-r2-dynamic-startup-first-frame-2026-08-06.json")),
  "development 012-R2 evidence must be present",
);
addCheck(
  "post-import dynamic snapshot native evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-012-r3-cold-start-dynamic-snapshot-2026-08-06.json")),
  "development 012-R3 native evidence must be present",
);
addCheck(
  "workbench performance evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-013-workbench-performance-2026-08-07.json")),
  "development 013 workbench performance evidence must be present",
);
addCheck(
  "institution workspace R1 evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-014-institution-workspace-r1-2026-08-08.json")),
  "development 014 institution workspace evidence must be present",
);
addCheck(
  "visual truth and notice evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-014-r3-visual-truth-and-notice-2026-08-08.json")),
  "development 014-R3 visual truth and notice evidence must be present",
);
addCheck(
  "task-bound discovery authentication evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-014-r4-auth-search-truth-2026-08-09.json")),
  "development 014-R4 authentication and search-truth evidence must be present",
);
addCheck(
  "fair pagination and continuation-truth evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-014-r5-pagination-truth-2026-08-28.json")),
  "development 014-R5 pagination-truth evidence must be present",
);
addCheck(
  "native document reader evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-015-document-reader-r1-2026-08-09.json")),
  "development 015 native-reader evidence must be present",
);
addCheck(
  "document evidence workbench evidence exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-016-document-evidence-r2-2026-08-12.json")),
  "development 016 document evidence workbench evidence must be present",
);
addCheck(
  "document evidence native closure exists",
  fs.existsSync(path.join(docsRoot, "evidence", "sidera-016-r1-native-closure-2026-08-12.json")),
  "development 016-R1 native closure evidence must be present",
);
const paginationTruthEvidence = readEvidenceJson("sidera-014-r5-pagination-truth-2026-08-28.json");
readEvidenceJson("sidera-014-r6-structured-pagination-2026-09-01.json");
readEvidenceJson("sidera-014-r7-session-restore-2026-09-01.json");
addCheck(
  "014-R5 pagination truth is bounded PASS",
  paginationTruthEvidence?.status?.nativePaginationTruth === "PASS_BOUNDED"
    && paginationTruthEvidence?.nativeClosure?.englishMatrix?.pagesScanned === 2
    && paginationTruthEvidence?.nativeClosure?.englishMatrix?.hasMore === false
    && paginationTruthEvidence?.nativeClosure?.englishMatrix?.completionReason === "source-exhausted",
  "the corrected English matrix must report two observed pages and a proven exhausted source",
);
addCheck(
  "014-R5 preserves partial search-truth boundaries",
  paginationTruthEvidence?.status?.nativeSearchTruth === "PARTIAL PASS"
    && String(paginationTruthEvidence?.nativeClosure?.localInteraction?.crossPageSelection ?? "").startsWith("UNVERIFIED")
    && paginationTruthEvidence?.safety?.realPaperLibraryAccessed === false
    && paginationTruthEvidence?.safety?.otherProcessesAffected === false,
  "result target and cross-page truth stay partial while the real library and other processes remain untouched",
);
const visualTruthEvidence = readEvidenceJson("sidera-014-r3-visual-truth-and-notice-2026-08-08.json");
addCheck(
  "014-R3 native import-read gate is PASS",
  visualTruthEvidence?.nativeGates?.importRead?.status === "PASS"
    && visualTruthEvidence?.nativeImportRead === "PASS",
  "normal reads plus the isolated native fault-notice fixture must support NATIVE IMPORT READ PASS",
);
addCheck(
  "014-R3 import fault fixture preserves stable target codes",
  visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.stableErrorCodes?.batchList
      === "SIDERA_IMPORT_READ_FIXTURE_BATCH_LIST_FAILED"
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.stableErrorCodes?.commitStatus
      === "SIDERA_IMPORT_READ_FIXTURE_COMMIT_STATUS_FAILED"
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.stableErrorCodes?.commitHistory
      === "SIDERA_IMPORT_READ_FIXTURE_COMMIT_HISTORY_FAILED",
  "batch/status/history fault targets must retain their stable error codes",
);
addCheck(
  "014-R3 import notice timing and recovery evidence is exact",
  visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.historyToastLifecycle?.appearedAtMs === 59
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.historyToastLifecycle?.stillVisibleAtMs === 4003
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.historyToastLifecycle?.absentAtMs === 8304
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.explicitClose?.absentAfterClickMs === 100
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.leaveImportReview?.absentAfterNavigationMs === 150
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.successfulReread?.recoveredInMs === 50.8
    && visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.successfulReread?.toastVisibleAfterRecovery === false,
  "59/4003/8304ms lifecycle, X, leave, and successful reread facts must remain distinct",
);
addCheck(
  "014-R3 sticky blocking-error notice remains separately unverified",
  visualTruthEvidence?.nativeGates?.importRead?.faultNoticeFixture?.blockingCommitRollbackStickyNotice?.status
    === "UNVERIFIED",
  "commit/rollback blocking failures were not separately injected and must not be overclaimed",
);
const final014Fingerprint = visualTruthEvidence?.authoritativeLibrary?.latestImportReadNoticeRetestFingerprint;
addCheck(
  "014-R3 final immutable paper-library fingerprint is preserved",
  final014Fingerprint?.sha256 === "B546C505F6FAD89C9D4C6429DBBA8FACC7838D5F66CC9367E24A2824EFDCA8FA"
    && final014Fingerprint?.fileSizeBytes === 214532096
    && final014Fingerprint?.schemaVersion === 14
    && final014Fingerprint?.paperCount === 25473
    && final014Fingerprint?.libraryRevision === 1
    && final014Fingerprint?.activeV20Rows === 0
    && final014Fingerprint?.readySnapshots === 4
    && final014Fingerprint?.mainWalShmMetadataBeforeAfterUnchanged === true,
  "final immutable+query_only hash, size, schema, counts, revision, V20 state, and metadata must match",
);
const readerEvidence = readEvidenceJson("sidera-015-document-reader-r1-2026-08-09.json");
addCheck(
  "015 final reader hardening markers are recorded",
  readerEvidence?.implementation?.finalHardening?.readerReopenDuringActiveParse?.presentOnDisk === true
    && readerEvidence?.implementation?.finalHardening?.singleOuterScrollOwner?.owner
      === "document-reader-viewport"
    && readerEvidence?.protocol?.errorResponseCors?.presentOnDisk === true
    && readerEvidence?.implementation?.finalHardening?.researchRequestTaskHistory?.maximumEntries === 32,
  "active parse restore, single scroll owner, protocol error CORS, and bounded request-task history must be recorded",
);
const documentEvidence = readEvidenceJson("sidera-016-document-evidence-r2-2026-08-12.json");
addCheck(
  "016 automated and native gates remain split",
  documentEvidence?.status?.implementation === "IMPLEMENTED"
    && documentEvidence?.status?.automatedTechnical === "PARTIAL_PASS"
    && documentEvidence?.status?.windowsDesktopLibTestHost === "TEST-HOST UNAVAILABLE"
    && documentEvidence?.status?.nativeEvidenceUx === "UNVERIFIED"
    && documentEvidence?.status?.nativeIndex === "UNVERIFIED"
    && documentEvidence?.status?.development017 === "NOT_STARTED",
  "implementation, automatic, Windows host, native, and development 017 gates must remain independent",
);
addCheck(
  "016 core and frontend automatic evidence is recorded",
  documentEvidence?.automatedTechnical?.coreTests?.documentDerived?.passed === 23
    && documentEvidence?.automatedTechnical?.coreTests?.documentEvidence?.passed === 8
    && documentEvidence?.automatedTechnical?.coreTests?.documentIndex?.passed === 11
    && documentEvidence?.automatedTechnical?.coreTests?.documentProtocol?.passed === 7
    && documentEvidence?.automatedTechnical?.coreTests?.piProtocol?.passed === 8
    && documentEvidence?.automatedTechnical?.coreTests?.researchSearch?.passed === 25
    && documentEvidence?.automatedTechnical?.frontend?.documentReaderR1?.checks === 105
    && documentEvidence?.automatedTechnical?.frontend?.documentReaderR2?.status === "STATIC PASS"
    && documentEvidence?.automatedTechnical?.frontend?.productionBuild?.status === "PASS"
    && documentEvidence?.automatedTechnical?.rustCompilation?.cargoCheckTestsJ2 === "PASS"
    && documentEvidence?.automatedTechnical?.rustCompilation?.cargoCheckJ2 === "PASS",
  "core targets, frontend audits/build, and both cargo checks must be recorded without upgrading native gates",
);
addCheck(
  "016 Windows desktop host failure stops before assertions",
  documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.status === "TEST-HOST UNAVAILABLE"
    && documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.assertionsStarted === false
    && documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.missingEntryPoint === "TaskDialogIndirect"
    && documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.repeatedExecutionStopped === true
    && documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.productFailure === false
    && documentEvidence?.automatedTechnical?.windowsDesktopLibTestHost?.dev016AssertionFailure === false,
  "the unavailable host must not be reported as a product or development 016 assertion failure",
);
addCheck(
  "016 preserves safety and development 017 stop gate",
  documentEvidence?.safety?.realPaperLibraryOpened === false
    && documentEvidence?.safety?.realPaperLibraryWritten === false
    && documentEvidence?.safety?.v20Rebuilt === false
    && documentEvidence?.safety?.networkUsed === false
    && documentEvidence?.safety?.providerUsed === false
    && documentEvidence?.safety?.otherProcessesInspectedOrModified === false
    && documentEvidence?.development017Boundary?.status === "NOT_STARTED",
  "real data, network, provider, other processes, and development 017 must remain outside this closure",
);
const documentNativeClosure = readEvidenceJson("sidera-016-r1-native-closure-2026-08-12.json");
addCheck(
  "016-R1 independent Windows smoke host is proven without rewriting history",
  documentNativeClosure?.status?.windowsStandaloneTestHost === "PASS"
    && documentNativeClosure?.status?.historicalWindowsDesktopLibTestHost === "TEST-HOST UNAVAILABLE"
    && documentNativeClosure?.windowsStandaloneTestHost?.staticChecks?.manifestResourcePresent === true
    && documentNativeClosure?.windowsStandaloneTestHost?.staticChecks?.commonControlsV6Present === true
    && documentNativeClosure?.windowsStandaloneTestHost?.staticChecks?.taskDialogIndirectImported === true
    && documentNativeClosure?.windowsStandaloneTestHost?.boundedExecution?.attempts === 1
    && documentNativeClosure?.windowsStandaloneTestHost?.boundedExecution?.exitCode === 0
    && documentNativeClosure?.windowsStandaloneTestHost?.boundedExecution?.windowCreated === false,
  "the standalone host must pass all static gates and one bounded no-window execution while the historical lib host remains unavailable",
);
addCheck(
  "016-R1 index, combined parse, rotated native selection, and user gates all pass",
  documentNativeClosure?.status?.automatedTechnical === "PASS"
    && documentNativeClosure?.status?.nativeEvidenceUx === "PASS"
    && documentNativeClosure?.status?.nativeIndex === "PASS"
    && documentNativeClosure?.status?.userExperience === "PASS"
    && documentNativeClosure?.native016?.reader?.selectionAt100Percent === "PASS"
    && documentNativeClosure?.native016?.reader?.selectionAt125Percent === "PASS"
    && documentNativeClosure?.native016?.reader?.rotatedPagePointerSelection === "PASS"
    && documentNativeClosure?.native016?.reader?.rotatedPageSelectionFailure?.fixImplemented === true
    && documentNativeClosure?.native016?.reader?.rotatedPageSelectionFailure?.nativeRetest === "PASS"
    && documentNativeClosure?.native016?.reader?.rotatedPageSelectionFailure?.selectionVisualAlignment === "PASS"
    && documentNativeClosure?.native016?.reader?.rotatedPageSelectionFailure?.userSubjectiveRetest === "PASS"
    && documentNativeClosure?.native016?.index?.nativePauseResumeCancel === "PASS"
    && documentNativeClosure?.native016?.index?.nativeRestartReattach === "PASS"
    && documentNativeClosure?.native016?.index?.lateResultIsolation === "PASS"
    && documentNativeClosure?.native016?.parseLifecycle?.closeReopenSameRun === "PASS"
    && documentNativeClosure?.native016?.parseLifecycle?.manualStopAndNoLatePages === "PASS"
    && documentNativeClosure?.native016?.parseLifecycle?.closeReopenSameRunThenStop === "PASS"
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.status === "PASS"
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.versionRunCount === 1
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.terminalState === "cancelled"
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.unchangedAfterFourSeconds === true
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.duplicateRunObserved === false
    && documentNativeClosure?.native016?.parseLifecycle?.combinedClosureRun?.latePageAfterStopObserved === false
    && documentNativeClosure?.development017Boundary?.status === "READY",
  "native index controls, the continuous close-reopen-stop parse lifecycle, rotated TextLayer, and the independently confirmed user experience all pass",
);
addCheck(
  "016-R1 evidence survives isolated derived rebuild",
  documentNativeClosure?.native016?.evidencePersistence?.annotations === 2
    && documentNativeClosure?.native016?.evidencePersistence?.savedEvidence === 1
    && documentNativeClosure?.native016?.evidencePersistence?.evidenceStoreSha256Before
      === documentNativeClosure?.native016?.evidencePersistence?.evidenceStoreSha256After
    && documentNativeClosure?.native016?.evidencePersistence?.beforeReparseState === "missing"
    && documentNativeClosure?.native016?.evidencePersistence?.afterReparseState === "exact"
    && documentNativeClosure?.native016?.evidencePersistence?.silentMoveOrDeletionObserved === false,
  "the non-rebuildable evidence store and explicit reanchor states must be recorded",
);
addCheck(
  "014-R4 native authentication passes while search truth remains partial",
  documentNativeClosure?.status?.native014R4DiscoveryAuth === "PASS"
    && documentNativeClosure?.status?.native014R4SearchTruth === "PARTIAL_PASS"
    && documentNativeClosure?.native014R4?.englishMatrix?.cancelAttempt?.snapshotCandidatesPreserved === 8
    && documentNativeClosure?.native014R4?.englishMatrix?.cancelAttempt?.lateResumeObserved === false
    && documentNativeClosure?.native014R4?.englishMatrix?.replacementAttempt?.targetReached === false
    && documentNativeClosure?.native014R4?.englishMatrix?.replacementAttempt?.hasMore === false,
  "discovery auth, cancellation preservation, and partial search-truth evidence must remain independently stated",
);
addCheck(
  "016-R1 safety boundary excludes real data, provider, session clearing, and other processes",
  documentNativeClosure?.safety?.realPaperLibraryOpened === false
    && documentNativeClosure?.safety?.realPaperLibraryWritten === false
    && documentNativeClosure?.safety?.v20Rebuilt === false
    && documentNativeClosure?.safety?.networkDownloadUsed === false
    && documentNativeClosure?.safety?.providerUsed === false
    && documentNativeClosure?.safety?.institutionSessionCleared === false
    && documentNativeClosure?.safety?.otherProcessesInspectedOrModified === false
    && documentNativeClosure?.safety?.exactIsolatedAppClosedAtEnd === false
    && documentNativeClosure?.safety?.exactIsolatedAppLeftOpenForUserAcceptance === true,
  "native closure must remain isolated and leave the real library, provider, institution session, and unrelated processes untouched",
);
const documentOcrAgentEvidence = readEvidenceJson("sidera-017-ocr-evidence-agent-2026-08-25.json");
addCheck(
  "017 preserves the completed 016 user gate and reports R1/R2 independently",
  documentOcrAgentEvidence?.status?.development016 === "USER EXPERIENCE PASS"
    && documentOcrAgentEvidence?.status?.r1Implementation === "IMPLEMENTED"
    && documentOcrAgentEvidence?.status?.r1AutomatedTechnical === "PASS"
    && documentOcrAgentEvidence?.status?.r1NativeOcr === "PASS"
    && documentOcrAgentEvidence?.status?.r1UserOcrAcceptance === "PASS"
    && documentOcrAgentEvidence?.status?.r2Implementation === "IMPLEMENTED"
    && documentOcrAgentEvidence?.status?.r2AutomatedTechnical === "PASS"
    && documentOcrAgentEvidence?.status?.r2RealProviderEvidence === "PASS"
    && documentOcrAgentEvidence?.status?.r2NativeAgentUx === "PASS"
    && documentOcrAgentEvidence?.status?.r2UserExperience === "PASS"
    && documentOcrAgentEvidence?.userAcceptanceBatch?.item1 === "PASS"
    && documentOcrAgentEvidence?.userAcceptanceBatch?.item2 === "PASS AFTER FIX"
    && documentOcrAgentEvidence?.userAcceptanceBatch?.item3 === "PASS"
    && documentOcrAgentEvidence?.userAcceptanceBatch?.item4 === "PASS"
    && documentOcrAgentEvidence?.userAcceptanceBatch?.item5 === "PASS",
  "native OCR, the verified synthetic Provider turn, document-Agent native UX, and all five passed user items must remain distinct",
);
addCheck(
  "017 OCR is local, bounded, persistent, and compatible with native page text",
  documentOcrAgentEvidence?.implementation?.derivedStore?.schemaVersion === 5
    && documentOcrAgentEvidence?.implementation?.derivedStore?.nativeTextOverwritten === false
    && documentOcrAgentEvidence?.implementation?.derivedStore?.automaticIndexRebuild === false
    && documentOcrAgentEvidence?.implementation?.ocr?.intraOpThreads === 2
    && documentOcrAgentEvidence?.implementation?.ocr?.directML === false
    && documentOcrAgentEvidence?.implementation?.ocr?.runtimeDownload === false
    && documentOcrAgentEvidence?.implementation?.ocr?.globalConcurrentPages === 1
    && documentOcrAgentEvidence?.implementation?.ocr?.upload?.singleUse === true
    && documentOcrAgentEvidence?.implementation?.ocr?.upload?.imagePersisted === false
    && documentOcrAgentEvidence?.nativeR1Verification?.pages?.length === 5
    && documentOcrAgentEvidence?.nativeR1Verification?.explicitOcrPreferencePersisted === true
    && documentOcrAgentEvidence?.nativeR1Verification?.ocrSelectionGeometryFix?.singleLineSelection === "PASS"
    && documentOcrAgentEvidence?.nativeR1Verification?.ocrSelectionGeometryFix?.fourLineSelection === "PASS"
    && documentOcrAgentEvidence?.nativeR1Verification?.ocrSelectionGeometryFix?.selectedTextMatchesFourLines === true
    && documentOcrAgentEvidence?.nativeR1Verification?.ocrSelectionGeometryFix?.activeMinimumX > 0.08,
  "five isolated native pages must be recognized without overwriting native text, leaking images, or downloading a model",
);
addCheck(
  "017 document evidence Agent is turn-scoped, minimal, and reuse-only",
  documentOcrAgentEvidence?.implementation?.documentAgent?.existingPiSessionReused === true
    && documentOcrAgentEvidence?.implementation?.documentAgent?.secondAgentStateMachineCreated === false
    && documentOcrAgentEvidence?.implementation?.documentAgent?.scopes?.length === 3
    && documentOcrAgentEvidence?.implementation?.documentAgent?.tools?.length === 3
    && documentOcrAgentEvidence?.implementation?.documentAgent?.maxSegments === 8
    && documentOcrAgentEvidence?.implementation?.documentAgent?.maxTextBytes === 32768
    && documentOcrAgentEvidence?.implementation?.documentAgent?.maxReferences === 6
    && documentOcrAgentEvidence?.implementation?.documentAgent?.unreadReferencesRejected === true
    && documentOcrAgentEvidence?.implementation?.documentAgent?.crossDocumentRejected === true
    && documentOcrAgentEvidence?.implementation?.documentAgent?.crossPageRejected === true
    && documentOcrAgentEvidence?.implementation?.documentAgent?.documentContentTrustedAsInstruction === false,
  "the existing Pi runtime may read only authorized document fragments and cite only evidence it actually read",
);
addCheck(
  "017 automated gates pass without running the historical Windows desktop test host",
  documentOcrAgentEvidence?.automatedVerification?.core?.documentOcr?.passed === 4
    && documentOcrAgentEvidence?.automatedVerification?.core?.documentAgent?.passed === 3
    && documentOcrAgentEvidence?.automatedVerification?.core?.documentIndex?.passed === 11
    && documentOcrAgentEvidence?.automatedVerification?.core?.piProtocol?.passed === 8
    && documentOcrAgentEvidence?.automatedVerification?.frontendProductionBuild?.result === "PASS"
    && documentOcrAgentEvidence?.automatedVerification?.rustCompilation?.cargoCheckTestsJ2 === "PASS"
    && documentOcrAgentEvidence?.automatedVerification?.rustCompilation?.cargoCheckJ2 === "PASS"
    && documentOcrAgentEvidence?.automatedVerification?.rustCompilation?.windowsTestExecutableRun === false
    && documentOcrAgentEvidence?.automatedVerification?.resourceAudit?.fullModelManifestAndHashes === "PASS"
    && documentOcrAgentEvidence?.automatedVerification?.resourceAudit?.liteOcrExcluded === "PASS",
  "targeted core tests, frontend build, both cargo checks, and Full/Lite resources pass; the popup-prone desktop test EXE remains untouched",
);
addCheck(
  "017 verifies the isolated Provider, citation round trip, and completed user acceptance",
  documentOcrAgentEvidence?.safety?.realPaperLibraryOpened === false
    && documentOcrAgentEvidence?.safety?.realPaperLibraryWritten === false
    && documentOcrAgentEvidence?.safety?.realPaperTextSentToProvider === false
    && documentOcrAgentEvidence?.safety?.v20Rebuilt === false
    && documentOcrAgentEvidence?.safety?.galaxyBackgroundModified === false
    && documentOcrAgentEvidence?.safety?.modelDownloadedAtRuntime === false
    && documentOcrAgentEvidence?.safety?.institutionSessionCleared === false
    && documentOcrAgentEvidence?.safety?.otherProcessesInspectedOrModified === false
    && documentOcrAgentEvidence?.r2Verification?.realProviderFixtureTurn === "PASS"
    && documentOcrAgentEvidence?.r2Verification?.providerTurn?.providerCalls === 1
    && documentOcrAgentEvidence?.r2Verification?.providerTurn?.fixtureOnly === true
    && documentOcrAgentEvidence?.r2Verification?.providerTurn?.scope === "current-page"
    && documentOcrAgentEvidence?.r2Verification?.providerTurn?.referencedPage === 2
    && documentOcrAgentEvidence?.r2Verification?.isolatedNativeWindowDiscovered === true
    && documentOcrAgentEvidence?.r2Verification?.computerUseWindowContentApproval === "APPROVED"
    && documentOcrAgentEvidence?.r2Verification?.nativeClickablePageReturn === "PASS"
    && documentOcrAgentEvidence?.r2Verification?.nativePageReturn?.startedOnPage === 3
    && documentOcrAgentEvidence?.r2Verification?.nativePageReturn?.endedOnPage === 2
    && documentOcrAgentEvidence?.r2Verification?.nativeExplicitDocumentIndex?.segmentCount === 5
    && documentOcrAgentEvidence?.r2Verification?.nativeAgentOverlay?.evidenceSideSheetHiddenWhileOpen === true
    && documentOcrAgentEvidence?.r2Verification?.nativeAgentOverlay?.evidenceSideSheetRestoredOnClose === true
    && documentOcrAgentEvidence?.r2Verification?.normalWindowLayout === "PASS"
    && documentOcrAgentEvidence?.r2Verification?.maximizedWindowLayout === "PASS"
    && documentOcrAgentEvidence?.r2Verification?.userSubjectiveAcceptance === "PASS"
    && documentOcrAgentEvidence?.remainingAcceptance?.length === 0,
  "one synthetic-only Provider turn, the page-3-to-page-2 citation return, both native layouts and all five user items pass; the real library and other processes remain protected",
);
addCheck(
  "015 latest Rust hardening validation is split by actual gate",
  readerEvidence?.automatedTechnical?.latestRustHardeningCargoRerun?.startsWith("RERUN") === true
    && readerEvidence?.automatedTechnical?.previousCargoEvidenceReusedAsNewCompilation === false
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.coreLruTargetedTest?.status === "PASS"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.coreLruTargetedTest?.passed === 1
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.coreLruTargetedTest?.total === 1
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.firstDesktopCargoTest?.status === "BLOCKED"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.firstDesktopCargoTest?.target
      === "sidera_pi_runtime_protocol"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.firstDesktopCargoTest?.missingModules
      ?.includes("sidera_rag") === true
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.firstDesktopCargoTest?.missingModules
      ?.includes("sidera_stream_gate") === true
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.firstDesktopCargoTest
      ?.productOrAssertionFailure === false
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.compilation
      === "PASS"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.assertions
      === "TEST-HOST UNAVAILABLE"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.windowsExitCode
      === "0xc0000139"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.windowsStatus
      === "STATUS_ENTRYPOINT_NOT_FOUND"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.missingEntryPoint
      === "TaskDialogIndirect"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.productFailure
      === false
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.documentProtocolLibTest?.assertionFailure
      === false
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.cargoCheckJ2?.status === "PASS"
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.cargoCheckJ2?.warningCount === 13
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.cargoCheckJ2?.warningsPreExisting === true
    && readerEvidence?.automatedTechnical?.latestRustHardeningValidation?.cargoCheckJ2?.warningClass === "dead_code",
  "LRU test passes; integration drift blocks the broad test; protocol assertions remain test-host unavailable; cargo check passes with 13 existing warnings",
);
requireText("DEVELOPMENT.md", "前序工作包：开发 011 / Sidera-P2b", "previous controlled main-library commit package");
requireText("DEVELOPMENT.md", "前序工作包：开发 010 / Sidera-P2a-R2", "previous authoritative snapshot and continuity package");
requireText("DEVELOPMENT.md", "前序工作包：开发 009 / Sidera-P2a-R1", "previous background search and native review package");
requireText("DEVELOPMENT.md", "前序工作包：开发 008 / Sidera-P2a", "previous file import review package");
requireText("DEVELOPMENT.md", "前序工作包：开发 007 / Sidera-P1c-R3", "previous main window ownership package");
requireText("DEVELOPMENT.md", "前序工作包：开发 006 / Sidera-P1c-R2", "previous native research and side browser package");
requireText("DEVELOPMENT.md", "前序工作包：开发 005 / Sidera-P1c-R1", "previous popup and fixed viewport package");
requireText("DEVELOPMENT.md", "前序工作包：开发 004 / Sidera-P1c", "previous institution browser kernel package");
requireText("DEVELOPMENT.md", "前序工作包：开发 003 / Sidera-P1b-R2", "previous discovery authentication resume package");
requireText("DEVELOPMENT.md", "前序工作包：开发 002 / Sidera-P1b-R1", "previous native snapshot closure package");
requireText("DEVELOPMENT.md", "前序工作包：M2.0c-L1a-R4 论文级统一发现与馆藏目录降级修复", "superseded academic discovery package");
requireText("DEVELOPMENT.md", "ede6e0b4ddc3980816ec4e4d694f59c33461b159", "current L0 baseline commit");

for (const detailedDoc of [
  "RESEARCH_AGENT_PRODUCT_GOAL.md",
  "RESEARCH_AGENT_IMPLEMENTATION_ROADMAP.md",
]) {
  const content = fs.readFileSync(path.join(docsRoot, detailedDoc), "utf8");
  addCheck(
    `${detailedDoc}: historical/detail authority banner`,
    content.includes("不记录当前开发状态或进度") && content.includes("DEVELOPMENT.md"),
    "detail documents must defer live facts to the six canonical entry documents",
  );
}

const failed = checks.filter((check) => !check.passed);
const result = {
  audit: "project-documentation-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  currentStage: "Sidera-014-R7+014-R6+017-R1+017-R2+016-R1+016+015+014-R5+014-R4+014-R3+014+013+012-R3+P2b-R2+F1a",
  requiredDocuments: requiredDocs,
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) {
  process.exitCode = 1;
}
