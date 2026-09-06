import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [core, desktop, app, bridge, packageText] = await Promise.all([
  read("src-tauri/core/src/institution_probe.rs"),
  read("src-tauri/src/lib.rs"),
  read("src/App.tsx"),
  read("src/lib/sideraInstitution.ts"),
  read("package.json"),
]);
const pkg = JSON.parse(packageText);
const coreProduction = core.slice(0, core.indexOf("#[cfg(test)]"));
const commandStart = desktop.indexOf("struct SideraInstitutionProbeInput");
const commandEnd = desktop.indexOf("struct PaperRecord", commandStart);
assert.ok(commandStart >= 0 && commandEnd > commandStart);
const commandSource = desktop.slice(commandStart, commandEnd);

assert.ok(coreProduction.includes("SideraInstitutionNavigationTarget"));
assert.ok(coreProduction.includes("OfficialSso"));
assert.ok(coreProduction.includes("OfficialExternal"));
assert.ok(coreProduction.includes("validate_whu_database_sso_url"));
assert.ok(coreProduction.includes('Some("metaauth.com") | Some("www.metaauth.com")'));
assert.ok(coreProduction.includes('url.path() != "/242010/login.html"'));
assert.ok(coreProduction.includes('query.len() != 1 || query[0].0 != "service"'));
assert.ok(coreProduction.includes('Some("whu.metaersp.com") | Some("whu.metaersp.cn")'));
assert.ok(coreProduction.includes('matches!(service.path(), "/personalIndex" | "/databaseList")'));
assert.ok(coreProduction.includes("extract_html_anchors"));
assert.ok(coreProduction.includes('anchor.text.contains("数据库导航")'));
assert.ok(coreProduction.includes("resolve_discovery_entry"));
assert.ok(coreProduction.includes("validate_browser_navigation_url"));
assert.ok(coreProduction.includes("safe_url_without_query(&open_url)"));
assert.ok(coreProduction.includes("SIDERA_INSTITUTION_UPSTREAM_SERVICE_ERROR"));
assert.ok(!coreProduction.includes("token=secret"));
assert.ok(!coreProduction.includes("Cookie:"));

assert.ok(coreProduction.includes("build_navigation_targets(documents"));
assert.ok(commandSource.includes("build_navigation_targets_with_database_sso"));
assert.ok(commandSource.includes("SIDERA_INSTITUTION_DATABASE_SSO_REQUIRED"));
assert.ok(commandSource.includes("SideraInstitutionNavigationKind::OfficialSso"));
assert.ok(commandSource.includes("navigation_targets,"));
assert.ok(!commandSource.includes('client.get("https://www.metaauth.com'));
assert.ok(!commandSource.includes('client.get("https://metaauth.com'));
assert.equal((commandSource.match(/scope\.spawn/g) ?? []).length, 2);

assert.ok(bridge.includes('export type SideraInstitutionNavigationKind = "direct" | "official-sso" | "official-external"'));
assert.ok(bridge.includes("navigationTargets: SideraInstitutionNavigationTarget[]"));
assert.ok(app.includes('openInstitutionTarget("database-directory")'));
assert.ok(app.includes("尚未解析到正式数据库 SSO"));
assert.ok(app.includes("无 Cookie 的入口与能力探测"));
assert.ok(app.includes("应用内机构会话"));
assert.ok(!app.includes('openInstitutionUrl("https://whu.metaersp.cn/databaseList")'));
assert.ok(!app.includes("institutionProbeStorage"));

assert.equal(
  pkg.scripts["audit:sidera-institution-probe-l0-r1"],
  "node scripts/sidera_institution_probe_l0_r1_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: "M2.0c-L0-R1",
  officialSso: {
    source: "whu-library-official-response",
    tenant: "242010",
    backendRequests: 0,
    fullQueryRendered: false,
  },
  navigation: {
    hardcodedDirectEntryRemoved: true,
    fallback: "library-home",
    persistentSessionState: false,
  },
  providerCalls: 0,
  institutionAccess: "UNVERIFIED",
}, null, 2));
