"use client";

const MAX_STRING = 800;

function JsonScalar({ value }: { value: string | number | boolean | null }) {
  if (value === null) return <span className="json-literal json-null">null</span>;
  if (typeof value === "boolean") {
    return <span className="json-literal json-bool">{value ? "true" : "false"}</span>;
  }
  if (typeof value === "number") {
    return <span className="json-literal json-num">{value}</span>;
  }
  const shown = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  return <span className="json-string">&quot;{shown}&quot;</span>;
}

export function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 12) return <span className="json-muted">…</span>;

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return <JsonScalar value={value as null | boolean | number} />;
  }

  if (typeof value === "string") {
    return <JsonScalar value={value} />;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="json-muted">[]</span>;
    return (
      <ul className="json-tree-list">
        {value.map((item, i) => (
          <li key={i}>
            <span className="json-key">{i}</span>
            <JsonTree value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return <span className="json-muted">{"{}"}</span>;
    return (
      <ul className="json-tree-list">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="json-key">{k}</span>
            <JsonTree value={v} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  return <span className="json-muted">{String(value)}</span>;
}
