import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, rustDesktop, app, bridge, styles, cargo, packageText] = await Promise.all([
  read("src-tauri/core/src/institution_probe.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/App.tsx"),
  read("src/lib/sideraInstitution.ts"),
  read("src/index.css"),
  read("src-tauri/Cargo.toml"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);
const coreProduction = core.slice(0, core.indexOf("#[cfg(test)]"));

assert.ok(core.includes('pub enum SideraInstitutionId'));
assert.ok(core.includes('pub enum SideraInstitutionProbeStatus'));
assert.ok(core.includes('pub enum SideraInstitutionEndpointStatus'));
assert.ok(core.includes('pub struct SideraInstitutionNavigationTarget'));
assert.ok(core.includes('"https://www.lib.whu.edu.cn/"'));
assert.ok(core.includes('"https://whu.metaersp.cn/databaseList"'));
assert.ok(core.includes('"aTrustTray.exe"'));
assert.ok(core.includes("classify_atrust_client"));
assert.ok(core.includes("validate_whu_probe_url"));
assert.ok(core.includes("resolve_discovery_entry"));
assert.ok(core.includes("resolve_database_sso_entry"));
assert.ok(core.includes("validate_whu_database_sso_url"));
assert.ok(core.includes("build_capability_report"));
assert.ok(core.includes("summarize_catalog"));
assert.ok(core.includes("safe_url_without_query"));
assert.ok(!coreProduction.includes("password="));
assert.ok(!coreProduction.includes("Cookie:"));

const commandStart = rustDesktop.indexOf("struct SideraInstitutionProbeInput");
const commandEnd = rustDesktop.indexOf("struct PaperRecord", commandStart);
assert.ok(commandStart >= 0 && commandEnd > commandStart);
const commandSource = rustDesktop.slice(commandStart, commandEnd);
const inputContract = commandSource.match(/struct SideraInstitutionProbeInput\s*\{[\s\S]*?\}/u)?.[0] ?? "";
assert.match(inputContract, /institution_id: SideraInstitutionId/u);
assert.ok(!inputContract.includes("url:"), "frontend must not provide probe URLs");
assert.ok(commandSource.includes("CreateToolhelp32Snapshot"));
assert.ok(commandSource.includes("TH32CS_SNAPPROCESS"));
assert.ok(commandSource.includes("INSTITUTION_PROBE_MAX_BYTES: usize = 256 * 1024"));
assert.ok(commandSource.includes("connect_timeout(Duration::from_secs(5))"));
assert.ok(commandSource.includes("timeout(Duration::from_secs(8))"));
assert.ok(commandSource.includes("attempt.previous().len() >= 5"));
assert.ok(commandSource.includes("validate_whu_probe_url(attempt.url().as_str())"));
assert.equal((commandSource.match(/scope\.spawn/g) ?? []).length, 2);
assert.ok(commandSource.includes("SideraInstitutionEndpointStatus::BrowserRequired"));
assert.ok(commandSource.includes("sidera_institution_probe"));
for (const forbiddenCookieAccess of ["Cookie:", "document.cookie", "cookies_for_url", "cookie_store"]) {
  assert.ok(!commandSource.includes(forbiddenCookieAccess), forbiddenCookieAccess);
}
assert.ok(!commandSource.includes("password"));
assert.ok(!commandSource.includes("research-hotspots-v7.sqlite"));

assert.ok(rustDesktop.includes("sidera_institution_probe,"));
assert.ok(cargo.includes("Win32_System_Diagnostics_ToolHelp"));
assert.ok(bridge.includes('export type SideraInstitutionId = "whu"'));
assert.ok(bridge.includes("export type SideraInstitutionNavigationTarget"));
assert.ok(bridge.includes('invoke<SideraInstitutionProbeResult>("sidera_institution_probe"'));
assert.ok(app.includes("武汉大学机构资源"));
assert.ok(app.includes("检测机构资源"));
assert.ok(app.includes("打开图书馆"));
assert.ok(app.includes("打开数据库导航"));
assert.ok(!app.includes('openInstitutionUrl("https://whu.metaersp.cn/databaseList")'));
assert.ok(app.includes('openInstitutionTarget("database-directory")'));
assert.ok(app.includes("aTrust 登录由学校客户端完成"));
// P1c permits explicit user downloads into a provenance-bearing staging area;
// L0's still-active boundary is no automatic ingestion, parsing or Provider use.
assert.ok(app.includes("自动检索仍只生成内存快照"));
assert.ok(app.includes("不会自动入库、解析或调用 AI Provider"));
assert.ok(app.includes("结构化目录样例"));
assert.ok(app.includes('useState<SideraInstitutionProbeResult>()'));
assert.ok(!app.includes("institutionProbeStorage"));
assert.ok(styles.includes(".settings-institution-capabilities"));

assert.equal(
  pkg.scripts["test:sidera-institution-probe"],
  "cargo test --manifest-path src-tauri/Cargo.toml -p research-hotspots-core institution_probe::tests -j 2 -- --nocapture",
);
assert.equal(
  pkg.scripts["audit:sidera-institution-probe-l0"],
  "node scripts/sidera_institution_probe_l0_audit.mjs",
);
assert.equal(
  pkg.scripts["audit:sidera-institution-probe-l0-r1"],
  "node scripts/sidera_institution_probe_l0_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L0",
  institution: "whu",
  atrust: "read-only-process-and-installation-probe",
  network: {
    allowlistedHttpsOnly: true,
    concurrency: 2,
    timeoutSeconds: 8,
    redirectLimit: 5,
    responseLimitKiB: 256,
    cookies: false,
  },
  writes: {
    paperDatabase: false,
    conversations: false,
    credentials: false,
  },
  providerCalls: 0,
  institutionAccess: "UNVERIFIED",
}, null, 2));
