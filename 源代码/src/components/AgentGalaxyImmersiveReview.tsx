import { useEffect, useMemo, useState } from "react";

import type {
  AgentGalaxyBackgroundPayloadV1,
  App17GalaxyPayload,
} from "../types";
import {
  loadAgentGalaxyBackgroundPayload,
  loadAgentGalaxyFullReviewPayload,
} from "../lib/agentGalaxyBackgroundReview";
import {
  readAgentGalaxyImmersiveReviewConfig,
} from "../lib/agentGalaxyImmersiveReview";
import AgentGalaxyImmersiveWorkspace from "./AgentGalaxyImmersiveWorkspace";

export default function AgentGalaxyImmersiveReview() {
  const config = useMemo(readAgentGalaxyImmersiveReviewConfig, []);
  const [payload, setPayload] = useState<AgentGalaxyBackgroundPayloadV1>();
  const [fullPayload, setFullPayload] = useState<App17GalaxyPayload>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      loadAgentGalaxyBackgroundPayload(),
      loadAgentGalaxyFullReviewPayload(),
    ])
      .then(([
        { payload: nextPayload },
        { payload: nextFullPayload },
      ]) => {
        if (active) {
          setPayload(nextPayload);
          setFullPayload(nextFullPayload);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="agent-immersive-review-message" data-review-ready="false">
        <div>
          <p>沉浸视图载荷未就绪</p>
          <pre>{error}</pre>
        </div>
      </main>
    );
  }

  if (!payload || !fullPayload) {
    return (
      <main className="agent-immersive-review-message" data-review-ready="false">
        <p>正在读取真实论文星空载荷</p>
      </main>
    );
  }

  return (
    <AgentGalaxyImmersiveWorkspace
      payload={payload}
      fullPayload={fullPayload}
      initialState={config.state}
      initialEntityId={config.focusEntity}
      initialEntityKind={config.focusKind}
      initialView={config.view}
      quality={config.quality}
      showHud={config.showHud}
    />
  );
}
