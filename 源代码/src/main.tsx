import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isAgentGalaxyBackgroundReviewMode } from "./lib/agentGalaxyBackgroundReview";
import { isAgentGalaxyOrbitPrototypeMode } from "./lib/agentGalaxyOrbitPrototype";
import "./index.css";

const AgentGalaxyBackgroundReview = React.lazy(
  () => import("./components/AgentGalaxyBackgroundReview"),
);
const AgentGalaxyOrbitPrototype = React.lazy(
  () => import("./components/AgentGalaxyOrbitPrototype"),
);
const fallback = <div style={{ position: "fixed", inset: 0, background: "#01040a" }} />;
const content = isAgentGalaxyOrbitPrototypeMode() ? (
  <React.Suspense fallback={fallback}>
    <AgentGalaxyOrbitPrototype />
  </React.Suspense>
) : isAgentGalaxyBackgroundReviewMode() ? (
  <React.Suspense fallback={fallback}>
    <AgentGalaxyBackgroundReview />
  </React.Suspense>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {content}
  </React.StrictMode>,
);
