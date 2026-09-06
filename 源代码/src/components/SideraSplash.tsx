import { AlertTriangle, RefreshCw, Settings, Sparkles } from "lucide-react";

export type SideraBootPhase =
  | "booting-data"
  | "mounting-agent"
  | "ready"
  | "failed";

type SideraSplashProps = {
  phase: SideraBootPhase;
  exiting: boolean;
  showStatus: boolean;
  error?: string;
  allowStaticFallback?: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
  onUseStaticBackground: () => void;
  onOpenSource: () => void;
};

export function SideraSplash({
  phase,
  exiting,
  showStatus,
  error,
  allowStaticFallback,
  onRetry,
  onOpenSettings,
  onUseStaticBackground,
  onOpenSource,
}: SideraSplashProps) {
  const failed = phase === "failed";

  return (
    <div
      className={`sidera-splash ${exiting ? "sidera-splash--exiting" : ""}`}
      role={failed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="sidera-splash__stars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

      <section className="sidera-splash__content" aria-labelledby="sidera-splash-title">
        <div className="sidera-splash__mark" aria-hidden="true">
          <Sparkles size={16} strokeWidth={1.3} />
        </div>
        <h1 id="sidera-splash-title">SIDERA</h1>
        <blockquote>仰观宇宙之大，俯察品类之盛。</blockquote>
        <button type="button" className="sidera-splash__source" onClick={onOpenSource}>
          王羲之《兰亭集序》
        </button>

        <div className="sidera-splash__feedback">
          {!failed && showStatus ? (
            <p className="sidera-splash__status">
              {phase === "mounting-agent"
                ? "正在点亮本地知识星图……"
                : "正在连接本地知识星图……"}
            </p>
          ) : null}

          {failed ? (
            <div className="sidera-splash__failure">
              <div>
                <AlertTriangle size={16} />
                <span>{error || "Sidera 初始化失败。"}</span>
              </div>
              <div className="sidera-splash__actions">
                <button type="button" onClick={onRetry}>
                  <RefreshCw size={14} />
                  重试
                </button>
                <button type="button" onClick={onOpenSettings}>
                  <Settings size={14} />
                  打开设置
                </button>
                {allowStaticFallback ? (
                  <button type="button" onClick={onUseStaticBackground}>
                    使用静态背景继续
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
