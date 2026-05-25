"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseDisplayContent } from "@/lib/parse-display-content";
import { JsonTree } from "./json-tree";

const mdComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rich-inline-code" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="rich-pre">{children}</pre>,
  table: ({ children }) => (
    <div className="rich-table-wrap">
      <table className="rich-table">{children}</table>
    </div>
  ),
};

function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}

export function RichContent({
  text,
  className = "",
  maxHeight,
  emptyLabel = "(empty)",
}: {
  text: string | null | undefined;
  className?: string;
  maxHeight?: number;
  emptyLabel?: string;
}) {
  const parsed = parseDisplayContent(text);
  const style = maxHeight ? { maxHeight, overflow: "auto" as const } : undefined;

  if (!parsed.text && parsed.kind !== "json") {
    return <p className={`rich-content empty ${className}`}>{emptyLabel}</p>;
  }

  if (parsed.kind === "json" && parsed.json !== undefined) {
    return (
      <div className={`rich-content rich-json ${className}`} style={style}>
        <JsonTree value={parsed.json} />
      </div>
    );
  }

  if (parsed.kind === "markdown") {
    return (
      <div className={`rich-content rich-markdown ${className}`} style={style}>
        <MarkdownBody text={parsed.text} />
      </div>
    );
  }

  return (
    <div className={`rich-content rich-plain ${className}`} style={style}>
      {parsed.text.split("\n").map((line, i) => (
        <p key={i}>{line || "\u00a0"}</p>
      ))}
    </div>
  );
}
