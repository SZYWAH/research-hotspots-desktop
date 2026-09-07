import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import vm from "node:vm";

// Execute the actual release functions against an in-memory filesystem. Never
// invoke the release entry point, a compiler, or a real installer in this test.
const source = readFileSync(new URL("./windows_release.mjs", import.meta.url), "utf8");
function declaration(name, next) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${next}(`, start);
  assert(start >= 0 && end > start);
  return source.slice(start, end);
}
const functions = declaration("buildInstaller", "verifyInstallerPair")
  + declaration("removeSelectedOutputs", "installerPath");
const version = "0.22.0-beta.3";
const old = "Research Hotspots Desktop_0.22.0-beta.1_x64-setup.exe";
const current = `Research Hotspots Desktop_${version}_x64-setup.exe`;
function fixture(before = {}, after = before, output = []) {
  let files = before;
  const copies = [];
  const context = vm.createContext({
    isDemoFull: true, VERSION: version, ROOT: "root", TARGET_RELEASE_DIR: "target/release",
    NSIS_DIR: "target/release/bundle/nsis", OUTPUT_DIR: "output", PNPM: "pnpm",
    DEMO_SEED_DATABASE: "seed", DEMO_SEED_MANIFEST: "manifest",
    join, relative,
    existsSync: () => true,
    readdirSync: path => path === "output" ? output : Object.keys(files),
    statSync: path => files[path.split(/[\\/]/).at(-1)],
    rmSync: () => assert.fail("Full Demo must not delete existing outputs"),
    run: () => { files = after; },
    copyFileSync: (from, to) => copies.push([from, to]),
    installerPath: () => "output/full.exe",
    fail: message => { throw new Error(message); },
    console: { log() {} },
  });
  vm.runInContext(functions, context);
  return { context, copies };
}
const stamp = (size, mtimeMs) => ({ size, mtimeMs });
let count = 0;
function check(name, run) { run(); count++; console.log(`PASS ${name}`); }
check("preserve old installer and select fresh beta.3", () => {
  const f = fixture({ [old]: stamp(10, 1) }, { [old]: stamp(10, 1), [current]: stamp(20, 2) });
  vm.runInContext('buildInstaller("full", "revision")', f.context);
  assert.equal(f.copies.length, 1);
  assert.equal(f.copies[0][0], join("target/release/bundle/nsis", current));
});
check("reject stale current-version installer", () => {
  const f = fixture({ [current]: stamp(20, 2) });
  assert.throws(() => vm.runInContext('buildInstaller("full", "revision")', f.context), /found 0/);
  assert.equal(f.copies.length, 0);
});
check("reject a fresh wrong-version installer", () => {
  const f = fixture({}, { [old]: stamp(10, 3) });
  assert.throws(() => vm.runInContext('buildInstaller("full", "revision")', f.context), /found 0/);
});
check("reject ambiguous fresh beta.3 installers", () => {
  const f = fixture({}, { [current]: stamp(20, 2), [`other_${version}_setup.exe`]: stamp(30, 3) });
  assert.throws(() => vm.runInContext('buildInstaller("full", "revision")', f.context), /found 2/);
  assert.equal(f.copies.length, 0);
});
check("allow empty destination without deletion", () => {
  vm.runInContext("removeSelectedOutputs()", fixture().context);
});
check("refuse nonempty destination without deletion", () => {
  const f = fixture({}, {}, ["previous-evidence.json"]);
  assert.throws(() => vm.runInContext("removeSelectedOutputs()", f.context), /already exists/);
});
console.log(JSON.stringify({ status: "PASS", checks: count, realFilesystemWrites: 0, builds: 0 }));
