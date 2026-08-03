import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { openExternalUrl } from "../lib/desktop";

type SideraMarkdownProps = {
  children: string;
};

function safeExternalHref(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function SideraMarkdown({ children }: SideraMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        a: ({ href, children: label }) => {
          const safeHref = safeExternalHref(href);
          if (!safeHref) return <span>{label}</span>;
          return (
            <a
              href={safeHref}
              rel="noreferrer noopener"
              target="_blank"
              onClick={(event) => {
                event.preventDefault();
                void openExternalUrl(safeHref);
              }}
            >
              {label}
            </a>
          );
        },
        img: () => null,
        table: ({ children: tableChildren }) => (
          <div className="sidera-markdown-table" role="region" tabIndex={0}>
            <table>{tableChildren}</table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
