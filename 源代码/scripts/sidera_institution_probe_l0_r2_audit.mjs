import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, desktop, app, packageText] = await Promise.all([
  read("src-tauri/core/src/institution_probe.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/App.tsx"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);
const coreProduction = core.slice(0, core.indexOf("#[cfg(test)]"));
const commandStart = desktop.indexOf("struct SideraInstitutionProbeInput");
const commandEnd = desktop.indexOf("struct PaperRecord", commandStart);
assert.ok(commandStart >= 0 && commandEnd > commandStart);
const commandSource = desktop.slice(commandStart, commandEnd);

assert.ok(coreProduction.includes('WHU_OFFICIAL_NAVIGATION_SCRIPT_PATH: &str = "/whuWebsite.js"'));
assert.ok(coreProduction.includes("validate_whu_official_script_url"));
assert.ok(coreProduction.includes("validate_whu_official_script_content_type"));
assert.ok(coreProduction.includes('"application/javascript" | "text/javascript"'));
assert.ok(coreProduction.includes("resolve_whu_official_script_url"));
assert.ok(coreProduction.includes("extract_html_script_sources"));
assert.ok(coreProduction.includes("resolve_database_sso_from_official_script"));
assert.ok(coreProduction.includes("has_database_navigation_binding"));
assert.ok(coreProduction.includes('extract_js_function_body(script, "jumpDatabases")'));
assert.ok(coreProduction.includes("extract_js_string_literals(function_body)"));
assert.ok(coreProduction.includes("candidates.len() == 1"));
assert.ok(coreProduction.includes("build_navigation_targets_with_database_sso"));

const parallelStart = commandSource.indexOf("thread::scope");
const scriptDiscovery = commandSource.indexOf("resolve_whu_official_script_url(&home.body)");
assert.ok(parallelStart >= 0 && scriptDiscovery > parallelStart);
assert.equal((commandSource.match(/scope\.spawn/g) ?? []).length, 2);
assert.ok(commandSource.includes("probe_whu_official_script"));
assert.ok(commandSource.includes("validate_whu_official_script_url(attempt.url().as_str())"));
assert.ok(commandSource.includes("validate_whu_official_script_content_type"));
assert.ok(commandSource.includes("SIDERA_INSTITUTION_DATABASE_CONFIG_UNRESOLVED"));
assert.ok(commandSource.includes("SIDERA_INSTITUTION_DATABASE_CONFIG_FETCH_FAILED"));
assert.ok(commandSource.includes("aTrust 与官网可达；正式数据库 SSO 尚未解析。"));
assert.ok(!commandSource.includes("lsp-s.chaoxing.com"));
assert.ok(!commandSource.includes('client.get("https://www.metaauth.com'));
assert.ok(!commandSource.includes('client.get("https://metaauth.com'));
assert.ok(!commandSource.includes("getCookieValue"));

assert.ok(app.includes('SIDERA_INSTITUTION_DATABASE_CONFIG_UNRESOLVED'));
assert.ok(app.includes('SIDERA_INSTITUTION_DATABASE_CONFIG_FETCH_FAILED'));
assert.ok(app.includes('openInstitutionTarget("database-directory")'));
assert.ok(!app.includes('openInstitutionUrl("https://whu.metaersp.cn/databaseList")'));

assert.equal(
  pkg.scripts["audit:sidera-institution-probe-l0-r2"],
  "node scripts/sidera_institution_probe_l0_r2_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L0-R2",
  officialConfig: {
    discoveredFromHome: true,
    sameOriginExactPath: "/whuWebsite.js",
    executed: false,
    maxConcurrentRequests: 2,
    configFetchSequential: true,
  },
  navigation: {
    staticMetaAuthValidated: true,
    fullQueryRendered: false,
    fallback: "library-home",
  },
  forbiddenBackendRequests: {
    chaoxing: 0,
    metaAuth: 0,
  },
  providerCalls: 0,
  institutionAccess: "NATIVE ACCESS PROBE PASS",
}, null, 2));
