import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import "./WorkbenchSideSheet.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type WorkbenchSideSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  id?: string;
  bodyClassName?: string;
  closeLabel?: string;
};

function visibleFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hasAttribute("disabled")
    && element.getAttribute("aria-hidden") !== "true"
    && element.getClientRects().length > 0
  ));
}

export function WorkbenchSideSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  id,
  bodyClassName,
  closeLabel = "关闭面板",
}: WorkbenchSideSheetProps) {
  const generatedId = useId().replace(/:/g, "");
  const sheetId = id ?? `workbench-side-sheet-${generatedId}`;
  const titleId = `${sheetId}-title`;
  const descriptionId = `${sheetId}-description`;
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const focusFrame = window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      });
      wasOpenRef.current = true;
      return () => window.cancelAnimationFrame(focusFrame);
    }

    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    }

    return undefined;
  }, [open]);

  useEffect(() => () => {
    if (wasOpenRef.current && previousFocusRef.current?.isConnected) {
      previousFocusRef.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = visibleFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    const keepFocusInSheet = (event: FocusEvent) => {
      if (
        openRef.current
        && panelRef.current
        && event.target instanceof Node
        && !panelRef.current.contains(event.target)
      ) {
        closeButtonRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", keepFocusInSheet);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", keepFocusInSheet);
    };
  }, [onOpenChange, open]);

  const closeFromBackdrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onOpenChange(false);
  };

  return createPortal(
    <div
      className="workbench-side-sheet-layer"
      data-open={open ? "true" : "false"}
      inert={!open}
      onPointerDown={closeFromBackdrop}
    >
      <aside
        ref={panelRef}
        id={sheetId}
        className="workbench-side-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="workbench-side-sheet__header">
          <div>
            <strong id={titleId}>{title}</strong>
            <span id={descriptionId}>{description}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="workbench-side-sheet__close"
            onClick={() => onOpenChange(false)}
            aria-label={closeLabel}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className={["workbench-side-sheet__body", bodyClassName].filter(Boolean).join(" ")}>
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
