import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isAgentGalaxyBackgroundReviewMode } from "./lib/agentGalaxyBackgroundReview";
import "./index.css";

const AgentGalaxyBackgroundReview = React.lazy(
  () => import("./components/AgentGalaxyBackgroundReview"),
);
const content = isAgentGalaxyBackgroundReviewMode() ? (
  <React.Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "#01040a" }} />}>
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
