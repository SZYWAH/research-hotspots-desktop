import { Minus, Square, X } from "lucide-react";
import { useEffect, useState, type MouseEvent as ReactMouseEvent, type RefCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isDesktopRuntime } from "../lib/desktop";

type SideraTitleBarProps = {
  variant: "transparent" | "solid";
  toolsHostRef?: RefCallback<HTMLDivElement>;
};

export function SideraTitleBar({ variant, toolsHostRef }: SideraTitleBarProps) {
  const desktop = isDesktopRuntime();
  const [maximized, setMaximized] = useState(false);

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

  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!desktop || (event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().toggleMaximize();
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
            onClick={async () => {
              const appWindow = getCurrentWindow();
              await appWindow.toggleMaximize();
              setMaximized(await appWindow.isMaximized());
            }}
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
