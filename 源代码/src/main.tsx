import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isAgentGalaxyBackgroundReviewMode } from "./lib/agentGalaxyBackgroundReview";
import { isAgentGalaxyFlowReviewMode } from "./lib/agentGalaxyFlowReview";
import { isAgentGalaxyImmersiveReviewMode } from "./lib/agentGalaxyImmersiveReview";
import { isAgentGalaxyOrbitPrototypeMode } from "./lib/agentGalaxyOrbitPrototype";
import "./index.css";

const AgentGalaxyImmersiveReview = React.lazy(
  () => import("./components/AgentGalaxyImmersiveReview"),
);
const AgentGalaxyBackgroundReview = React.lazy(
  () => import("./components/AgentGalaxyBackgroundReview"),
);
const AgentGalaxyFlowReview = React.lazy(
  () => import("./components/AgentGalaxyFlowReview"),
);
const AgentGalaxyOrbitPrototype = React.lazy(
  () => import("./components/AgentGalaxyOrbitPrototype"),
);
const fallback = <div style={{ position: "fixed", inset: 0, background: "#01040a" }} />;
const immersiveFallback = (
  <div style={{ position: "fixed", inset: 0, background: "#000" }} />
);
const content = isAgentGalaxyImmersiveReviewMode() ? (
  <React.Suspense fallback={immersiveFallback}>
    <AgentGalaxyImmersiveReview />
  </React.Suspense>
) : isAgentGalaxyFlowReviewMode() ? (
  <React.Suspense fallback={fallback}>
    <AgentGalaxyFlowReview />
  </React.Suspense>
) : isAgentGalaxyOrbitPrototypeMode() ? (
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
