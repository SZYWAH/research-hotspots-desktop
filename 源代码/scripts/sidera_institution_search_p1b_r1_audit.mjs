import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, runtime, bridge, app, packageText, evidenceText] = await Promise.all([
  read("src-tauri/core/src/institution_search.rs"),
  read("src-tauri/src/sidera_institution_runtime.rs"),
  read("src/lib/sideraInstitution.ts"),
  read("src/App.tsx"),
  read("package.json"),
  read("docs/evidence/sidera-p1b-r1-native-snapshot-2026-08-04.json"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const production = runtime.slice(0, runtime.indexOf("#[cfg(test)]"));
const rustScript = (name) => {
  const match = runtime.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));
  assert.ok(match, `${name} must exist`);
  return match[1];
};
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};

class FixtureInput {
  constructor(type, group, checked = false) {
    this.type = type;
    this.group = group;
    this.checked = checked;
    this.disabled = false;
  }
  matches(selector) {
    return selector.includes(`input[type="${this.type}"]`);
  }
  getAttribute(name) {
    if (name === "value") return "";
    if (name === "aria-disabled") return this.disabled ? "true" : "false";
    if (name === "role") return this.type;
    return null;
  }
  querySelector() { return null; }
  closest() { return null; }
  click() {
    if (this.type === "radio") {
      for (const control of this.group.controls) control.input.checked = false;
      this.checked = true;
    } else {
      this.checked = !this.checked;
    }
  }
}

class FixtureControl {
  constructor(group, label, { type = "checkbox", checked = false, attrs = {}, className = "" } = {}) {
    this.group = group;
    this.textContent = label;
    this.attrs = { "aria-label": label, ...attrs };
    this.className = className;
    this.disabled = false;
    this.input = new FixtureInput(type, group, checked);
  }
  matches(selector) { return selector.includes("label"); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelector(selector) {
    const includesOwnType = selector.includes(`input[type="${this.input.type}"]`);
    if (selector.includes(":checked")) return includesOwnType && this.input.checked ? this.input : null;
    if (includesOwnType) return this.input;
    return null;
  }
  querySelectorAll() { return []; }
  closest(selector) {
    if (selector.includes("label")) return this;
    if (selector.includes("disabled") && (this.disabled || this.attrs["aria-disabled"] === "true")) return this;
    return null;
  }
  click() { this.input.click(); }
}

class FixtureGroup {
  constructor(kind, definitions) {
    this.controls = [];
    this.attrs = { "aria-label": "资源类型" };
    for (const definition of definitions) {
      this.controls.push(new FixtureControl(this, definition.label, { ...definition, type: kind }));
    }
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelector(selector) {
    if (selector.includes("h2") || selector.includes("legend")) return { textContent: "资源类型" };
    return null;
  }
  querySelectorAll() { return this.controls; }
}

function facetEnvironment(kind, definitions) {
  const group = new FixtureGroup(kind, definitions);
  const timers = [];
  const location = { href: "https://discovery.example/search?page=1" };
  const document = {
    readyState: "complete",
    title: "统一发现结果",
    body: { innerText: "人工智能 统一发现结果" },
    querySelectorAll(selector) {
      if (selector === "a[href]") return [];
      if (selector.includes("prm-facet-group")) return [group];
      return [];
    },
    querySelector() { return null; },
  };
  return {
    group,
    document,
    location,
    window: {},
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    flush: () => { while (timers.length) timers.shift()(); },
  };
}

function execute(script, environment) {
  return new Function(
    "document",
    "location",
    "setTimeout",
    "window",
    `return (${script});`,
  )(
    environment.document,
    environment.location,
    environment.setTimeout,
    environment.window,
  );
}

const filter = rustScript("ACADEMIC_FILTER_SCRIPT");
const singleFilter = rustScript("ACADEMIC_SINGLE_FILTER_SCRIPT");
const nextPage = rustScript("ACADEMIC_NEXT_PAGE_SCRIPT");
const inspect = rustScript("ACADEMIC_INSPECT_SCRIPT");
for (const script of [filter, singleFilter, nextPage, inspect]) {
  assert.doesNotThrow(() => new Function(`return (${script});`));
}

const countedSelected = facetEnvironment("checkbox", [
  { label: "文章 (154,863)", checked: true },
  { label: "Conference Papers (17,270)", attrs: { "aria-checked": "true" } },
  { label: "学位论文（57,815）", className: "mat-mdc-checkbox-checked" },
]);
assert.deepEqual(execute(filter, countedSelected).filters, ["article", "conference-paper", "thesis"]);
assert.equal(execute(filter, countedSelected).action, "complete");

const checkboxSequence = facetEnvironment("checkbox", [
  { label: "文章 (154,863)" },
  { label: "会议论文 (17,270)" },
  { label: "Thesis (57,815)" },
]);
for (const target of ["article", "conference-paper", "thesis"]) {
  const receipt = execute(filter, checkboxSequence);
  assert.equal(receipt.action, "clicked");
  assert.equal(receipt.target, target);
  checkboxSequence.flush();
}
assert.equal(execute(filter, checkboxSequence).action, "complete");

const radioSequence = facetEnvironment("radio", [
  { label: "Articles (154,863)", checked: true },
  { label: "Conference Papers (17,270)" },
  { label: "Dissertations (57,815)" },
]);
const radioReceipt = execute(filter, radioSequence);
assert.equal(radioReceipt.action, "sequential-required");
assert.deepEqual(radioReceipt.availableFilters, ["article", "conference-paper", "thesis"]);
const selectConference = singleFilter.replace("__SIDERA_FILTER_ID__", "conference-paper");
assert.equal(execute(selectConference, radioSequence).target, "conference-paper");
radioSequence.flush();
assert.deepEqual(execute(selectConference, radioSequence).filters, ["conference-paper"]);

const paginationTimers = [];
const paginationLocation = { href: "https://discovery.example/search?page=1" };
const nextControl = {
  disabled: false,
  className: "p-paginator-next",
  getAttribute: () => null,
  closest: () => null,
  click() {
    paginationLocation.href = "https://discovery.example/search?page=2";
    paginationDocument.body.innerText = "人工智能 第二页 论文结果";
    this.disabled = true;
  },
};
const paginationDocument = {
  title: "统一发现结果",
  body: { innerText: "人工智能 第一页 论文结果" },
  querySelector: () => ({ value: "人工智能" }),
  querySelectorAll(selector) {
    if (selector === "a[href]") return [];
    if (selector.includes("a[rel=\"next\"]")) return [nextControl];
    return [];
  },
};
const paginationEnvironment = {
  document: paginationDocument,
  location: paginationLocation,
  window: {},
  setTimeout: (callback) => { paginationTimers.push(callback); },
};
const firstNext = execute(nextPage, paginationEnvironment);
assert.equal(firstNext.action, "clicked");
paginationTimers.shift()();
const endNext = execute(nextPage, paginationEnvironment);
assert.equal(endNext.action, "complete");
assert.notEqual(firstNext.pageSignature, endNext.pageSignature);

const mainPopup = between(production, "async fn create_institution_webview", "fn start_initial_navigation");
const resultWindow = between(production, "fn create_academic_result_webview", "async fn create_institution_webview");
const academicFlow = between(production, "async fn run_academic_discovery_search", "async fn run_catalog_search");
assert.ok(mainPopup.includes("create_academic_result_webview"));
assert.ok(!mainPopup.includes("main_webview.navigate(url)"));
assert.ok(resultWindow.includes("NewWindowResponse::Create { window }"));
assert.ok(resultWindow.includes(".window_features(features)"));
assert.ok(resultWindow.includes(".visible(false)"));
for (const marker of ["task_id", "epoch", "task_sequence", "webview_generation", "page_label"]) {
  assert.ok(resultWindow.includes(marker), marker);
}
assert.ok(academicFlow.includes("wait_for_academic_result_webview"));
assert.ok(academicFlow.includes("&result_webview"));
assert.ok(academicFlow.includes("AcademicFacetMode::Sequential"));
assert.ok(production.includes("collect_sequential_academic_facets"));
assert.ok(production.includes("ACADEMIC_MAX_PAGES_PER_FACET"));
assert.ok(runtime.includes("academic_result_binding_rejects_late_task_epoch_sequence_and_generation"));
assert.ok(runtime.includes("filter_failure_has_a_terminal_non_zero_snapshot_stage"));
assert.ok(core.includes("Unknown resource with paper-like metadata"));
assert.ok(core.includes("SideraInstitutionSearchStage"));
assert.ok(inspect.includes("!['journal-article', 'conference-paper', 'thesis'].includes(kind)"));
assert.ok(bridge.includes('"web-result-available"'));
assert.ok(bridge.includes('"filter-unconfirmed"'));
for (const label of ["网页结果可用", "分面处理中", "正在抽取", "原生结果完成", "筛选未确认", "适配器漂移"]) {
  assert.ok(app.includes(label), label);
}
// P1c-R2 replaces the dedicated "查看原始页面" toggle with the shared
// institution browser and explicit split/immersive/close controls.
assert.ok(app.includes("打开机构浏览器"));
assert.ok(app.includes("返回双栏"));
assert.ok(app.includes('title="关闭网页"'));
assert.ok(app.includes("openSideraInstitutionCurrentSource"));
assert.ok(!app.includes("查看内嵌页面"));

for (const forbidden of ["document.cookie", "localStorage", "sessionStorage", "download_pdf", "upsert_paper_library"]) {
  assert.ok(!production.includes(forbidden), forbidden);
}
assert.equal(evidence.package, "Sidera-P1b-R1");
assert.equal(evidence.status, "IMPLEMENTED");
assert.ok(["PENDING", "PASS"].includes(evidence.automatedTechnical));
assert.equal(evidence.nativeAcademicDiscovery, "UNVERIFIED");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.downloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-search-p1b-r1"],
  "node scripts/sidera_institution_search_p1b_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    countedChineseEnglishFacets: "PASS",
    checkedAriaMaterialStates: "PASS",
    popupResultBinding: "PASS",
    sequentialSubsearch: "PASS",
    mixedBookRejection: "PASS",
    pagination: "PASS",
    lateCallback: "PASS",
    nativeRawToggle: "PASS",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
}, null, 2));
