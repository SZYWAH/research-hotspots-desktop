import { Minus, Square, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefCallback,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isDesktopRuntime } from "../lib/desktop";

type SideraTitleBarProps = {
  variant: "transparent" | "solid";
  toolsHostRef?: RefCallback<HTMLDivElement>;
  onBeforeToggleMaximize?: () => Promise<void>;
  onAfterToggleMaximize?: () => void;
};

const SIDERA_WINDOW_RESIZE_QUIET_MS = 120;
const SIDERA_WINDOW_RESIZE_FALLBACK_MS = 900;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function waitForPaintFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function waitForWindowResizeSettle() {
  return new Promise<void>((resolve) => {
    let completed = false;
    let quietTimer = 0;
    let fallbackTimer = 0;
    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(quietTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("resize", handleResize);
      void waitForPaintFrames(prefersReducedMotion() ? 1 : 2).then(resolve);
    };
    const armQuietTimer = () => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, SIDERA_WINDOW_RESIZE_QUIET_MS);
    };
    const handleResize = () => armQuietTimer();

    window.addEventListener("resize", handleResize);
    armQuietTimer();
    fallbackTimer = window.setTimeout(finish, SIDERA_WINDOW_RESIZE_FALLBACK_MS);
  });
}

export function SideraTitleBar({
  variant,
  toolsHostRef,
  onBeforeToggleMaximize,
  onAfterToggleMaximize,
}: SideraTitleBarProps) {
  const desktop = isDesktopRuntime();
  const [maximized, setMaximized] = useState(false);
  const [maximizeToggleActive, setMaximizeToggleActive] = useState(false);
  const maximizeToggleActiveRef = useRef(false);

  useEffect(() => {
    if (!desktop) return undefined;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const refresh = async () => {
      try {
        const next = await appWindow.isMaximized();
        if (!disposed) setMaximized(next);
      } catch (error) {
        console.warn("Unable to read Sidera window state", error);
      }
    };

    void refresh();
    void appWindow.onResized(refresh).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  const handleToggleMaximize = useCallback(async () => {
    if (!desktop || maximizeToggleActiveRef.current) return;
    maximizeToggleActiveRef.current = true;
    setMaximizeToggleActive(true);
    try {
      await onBeforeToggleMaximize?.();
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      await waitForWindowResizeSettle();
      setMaximized(await appWindow.isMaximized());
    } catch (error) {
      console.warn("Unable to toggle Sidera window maximize state", error);
    } finally {
      onAfterToggleMaximize?.();
      maximizeToggleActiveRef.current = false;
      setMaximizeToggleActive(false);
    }
  }, [desktop, onAfterToggleMaximize, onBeforeToggleMaximize]);

  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!desktop || (event.target as HTMLElement).closest("button")) return;
    void handleToggleMaximize();
  };

  return (
    <header
      className={`sidera-titlebar sidera-titlebar--${variant}`}
      data-tauri-drag-region={desktop ? "true" : undefined}
      onDoubleClick={handleDoubleClick}
    >
      <div className="sidera-titlebar__leading" data-tauri-drag-region={desktop ? "true" : undefined}>
        <div className="sidera-titlebar__brand" data-tauri-drag-region={desktop ? "true" : undefined}>
          <span className="sidera-titlebar__star" aria-hidden="true" />
          <span>Sidera</span>
        </div>
      </div>

      <div
        ref={toolsHostRef}
        className="sidera-titlebar__tools"
        aria-label="当前页面工具"
      />

      {desktop ? (
        <div className="sidera-titlebar__controls" aria-label="窗口控制">
          <button
            type="button"
            aria-label="最小化窗口"
            title="最小化"
            onClick={() => void getCurrentWindow().minimize()}
          >
            <Minus size={15} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label={maximized ? "还原窗口" : "最大化窗口"}
            title={maximized ? "还原" : "最大化"}
            disabled={maximizeToggleActive}
            aria-busy={maximizeToggleActive}
            onClick={() => void handleToggleMaximize()}
          >
            <Square size={12.5} strokeWidth={1.55} />
          </button>
          <button
            type="button"
            className="sidera-titlebar__close"
            aria-label="关闭窗口"
            title="关闭"
            onClick={() => void getCurrentWindow().close()}
          >
            <X size={16} strokeWidth={1.55} />
          </button>
        </div>
      ) : (
        <div className="sidera-titlebar__browser-spacer" aria-hidden="true" />
      )}
    </header>
  );
}
