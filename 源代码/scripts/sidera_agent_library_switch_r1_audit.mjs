import fs from "node:fs";
import path from "node:path";
import {
  agentBackgroundLibraryIdentity,
  agentBackgroundMountKey,
  isCurrentAgentBackgroundEpoch,
  transitionAgentBackgroundLibrary,
} from "../src/lib/agentBackgroundLifecycle.ts";

const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const agentSource = fs.readFileSync(
  path.join(root, "src/components/AgentDualBackgroundPage.tsx"),
  "utf8",
);
const initialErrorStart = appSource.indexOf("const handleAgentInitialError");
const initialErrorEnd = appSource.indexOf("const agentInitialCallbacks", initialErrorStart);
const initialErrorSource = appSource.slice(initialErrorStart, initialErrorEnd);

const initial = { identity: "d:\\fixture::project-default", epoch: 4 };
const changed = transitionAgentBackgroundLibrary(
  initial,
  "D:/Sidera-Data/library/",
  "project-default",
);
const equivalent = transitionAgentBackgroundLibrary(
  changed.current,
  "d:\\sidera-data\\library\\",
  "project-default",
);

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
}

check(
  "Windows library identity is stable",
  agentBackgroundLibraryIdentity(" D:/Sidera-Data/library/ ", "project-default")
    === "d:\\sidera-data\\library::project-default",
  "Slash, case, surrounding whitespace, and trailing separators do not create a false library switch.",
);
check(
  "a real library switch advances exactly one epoch",
  changed.changed && changed.current.epoch === 5 && !equivalent.changed
    && equivalent.current === changed.current,
  "A changed library remounts once; saving an equivalent path preserves the existing mount.",
);
check(
  "mount identity includes library, project, and epoch",
  agentBackgroundMountKey("D:/Sidera-Data/library", "project-default", 5)
    .includes("d:\\sidera-data\\library::project-default-5"),
  "React cannot reuse the Agent renderer across distinct library identities or lifecycle epochs.",
);
check(
  "late callbacks are rejected by epoch",
  isCurrentAgentBackgroundEpoch(5, 5) && !isCurrentAgentBackgroundEpoch(4, 5),
  "Only callbacks created for the current Agent lifecycle can update application-level startup or fallback state.",
);
check(
  "successful settings refresh owns the remount boundary",
  appSource.includes("await saveAiSettings(effectiveSettings);")
    && appSource.includes("await refreshAll();")
    && appSource.indexOf("await refreshAll();")
      < appSource.indexOf("advanceAgentBackgroundLibrary(effectiveSettings.databaseDir")
    && appSource.includes("if (settings && changesLibrary)")
    && appSource.includes("setSideraStaticBackground(false)")
    && appSource.includes("sideraMissingVisualFallbackStartedRef.current = false"),
  "Validation, preparation, persistence, and refresh must all finish before the old static fallback is cleared.",
);
check(
  "initial runtime library identity is recorded without a remount",
  appSource.includes("|| agentBackgroundLifecycleRef.current.identity")
    && appSource.includes("identity: agentBackgroundLibraryIdentity(settings.databaseDir, activeProject.id)")
    && appSource.includes("epoch: 0"),
  "The first loaded library establishes the identity baseline while retaining the cold-start lifecycle epoch.",
);
check(
  "runtime missing-source fallback remains explicit",
  initialErrorSource.indexOf("isMissingImmersiveVisualSource(message)")
      < initialErrorSource.indexOf("!sideraSplashMountedRef.current")
    && initialErrorSource.includes("setSideraStaticBackground(true)")
    && agentSource.includes("forceStaticBackground ? (")
    && agentSource.includes("agent-dual-page__static-background"),
  "A newly selected library without a visual source can still enter the existing static compatibility background after boot.",
);
check(
  "library remount preserves saved background preference",
  !appSource.includes("advanceAgentBackgroundLibrary(effectiveSettings.databaseDir, activeProject.id);\n      window.localStorage")
    && agentSource.includes("const MODE_STORAGE_KEY")
    && agentSource.includes("setPreferredMode"),
  "The app remounts against the new library without overwriting the Agent component's persisted immersive/theory choice.",
);

const failures = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}
if (failures.length > 0) process.exitCode = 1;
else console.log(`PASS Sidera Agent library switch R1 audit (${checks.length} checks)`);
