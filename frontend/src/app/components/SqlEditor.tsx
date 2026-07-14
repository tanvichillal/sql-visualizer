import { useRef, useCallback, useEffect, useState } from "react";
import { ClipboardPaste, X, Table2, ChevronDown, ChevronUp } from "lucide-react";

export interface ImportedTable {
  name: string;
  sql: string;
  rowCount: number;
  colCount: number;
  headers: string[];
  rows: string[][];
}

interface SqlEditorProps {
  value: string;
  onChange: (v: string) => void;
  onTablesImported?: (tables: ImportedTable[]) => void;
}

const FONT: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontSize: "13px",
  lineHeight: "21px",
  tabSize: 2,
};

const C = {
  dml: "#c084fc", clause: "#60a5fa", fn: "#34d399", ddl: "#f472b6",
  type: "#fb923c", string: "#a3e635", number: "#fbbf24",
  comment: "#6b7280", operator: "#e879f9", punct: "#94a3b8",
};

const RULES: { re: RegExp; color: string; italic?: boolean; bold?: boolean }[] = [
  { re: /(\/\*[\s\S]*?\*\/)/g,  color: C.comment, italic: true },
  { re: /(--[^\n]*)/g,           color: C.comment, italic: true },
  { re: /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, color: C.string },
  { re: /\b(SELECT|INSERT|UPDATE|DELETE|MERGE|REPLACE|UPSERT|INTO|VALUES|SET)\b/gi, color: C.dml, bold: true },
  { re: /\b(FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|ALL|EXCEPT|INTERSECT|DISTINCT|AS|IN|EXISTS|BETWEEN|LIKE|IS|AND|OR|NOT|CASE|WHEN|THEN|ELSE|END)\b/gi, color: C.clause, bold: true },
  { re: /\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|IFNULL|NULLIF|CONCAT|LENGTH|UPPER|LOWER|TRIM|SUBSTR|SUBSTRING|REPLACE|ROUND|FLOOR|CEIL|CEILING|NOW|DATE|YEAR|MONTH|DAY|CAST|CONVERT|ROW_NUMBER|RANK|DENSE_RANK|NTILE|LEAD|LAG|FIRST_VALUE|LAST_VALUE|OVER|PARTITION\s+BY|ROWS|RANGE|UNBOUNDED|PRECEDING|FOLLOWING|CURRENT\s+ROW)\b/gi, color: C.fn, bold: true },
  { re: /\b(CREATE|DROP|ALTER|TRUNCATE|RENAME|ADD|COLUMN|TABLE|DATABASE|INDEX|VIEW|CONSTRAINT|PRIMARY|FOREIGN|KEY|REFERENCES|DEFAULT|NULL|UNIQUE|CHECK)\b/gi, color: C.ddl, bold: true },
  { re: /\b(INT|INTEGER|BIGINT|SMALLINT|TINYINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|CHAR|VARCHAR|TEXT|DATE|DATETIME|TIMESTAMP|BOOLEAN|BOOL|BLOB|JSON|ENUM|SERIAL|REAL)\b/gi, color: C.type },
  { re: /\b(\d+(?:\.\d+)?)\b/g, color: C.number },
  { re: /([=<>!]+|\|\|)/g,       color: C.operator },
  { re: /([(),;])/g,             color: C.punct },
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tokenize(sql: string): string {
  type Tok = { start: number; end: number; color: string; italic?: boolean; bold?: boolean };
  const toks: Tok[] = [];
  for (const { re, color, italic, bold } of RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null)
      toks.push({ start: m.index, end: m.index + m[0].length, color, italic, bold });
  }
  toks.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Tok[] = [];
  let cur = 0;
  for (const t of toks) { if (t.start >= cur) { kept.push(t); cur = t.end; } }
  let html = "", pos = 0;
  for (const t of kept) {
    if (t.start > pos) html += esc(sql.slice(pos, t.start));
    const style = [`color:${t.color}`, t.bold ? "font-weight:700" : "", t.italic ? "font-style:italic" : ""].filter(Boolean).join(";");
    html += `<span style="${style}">${esc(sql.slice(t.start, t.end))}</span>`;
    pos = t.end;
  }
  if (pos < sql.length) html += esc(sql.slice(pos));
  return html + "\n";
}

// ── Table parsers ────────────────────────────────────────────────────────────

function parseHtmlTable(html: string): { headers: string[]; rows: string[][]; name: string } | null {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    // Try to guess table name from surrounding text
    const captionEl = table.querySelector("caption");
    const bodyText = doc.body.textContent || "";
    const nameMatch =
      captionEl?.textContent?.trim() ||
      (html.match(/(?:Table|table)\s*:?\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]) ||
      (html.match(/<h[1-6][^>]*>([^<]{1,40})<\/h[1-6]>/)?.[1]?.trim()) ||
      null;

    const headerEls = Array.from(table.querySelectorAll("thead tr th, thead tr td"));
    const headers = headerEls.length > 0
      ? headerEls.map(el => el.textContent?.trim() || "")
      : Array.from(table.querySelectorAll("tr:first-child th, tr:first-child td")).map(el => el.textContent?.trim() || "");

    const bodyRows = headerEls.length > 0
      ? table.querySelectorAll("tbody tr")
      : Array.from(table.querySelectorAll("tr")).slice(1);

    const rows = Array.from(bodyRows)
      .map(tr => Array.from(tr.querySelectorAll("td, th")).map(td => td.textContent?.trim() || ""))
      .filter(r => r.length > 0);

    if (headers.length === 0) return null;
    return { headers, rows, name: nameMatch || "" };
  } catch { return null; }
}

function parsePlainTable(text: string): { headers: string[]; rows: string[][]; name: string } | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  // Markdown: | col | col |
  if (lines[0].includes("|")) {
    const splitPipe = (line: string) =>
      line.split("|").map(c => c.trim()).filter((c, i, a) => !(i === 0 && c === "") && !(i === a.length - 1 && c === ""));
    const headers = splitPipe(lines[0]);
    const dataLines = lines.filter(l => !/^[\s|:-]+$/.test(l)).slice(1);
    const rows = dataLines.map(splitPipe).filter(r => r.length > 0);
    if (headers.length >= 2) return { headers, rows, name: "" };
  }

  // Tab / multi-space
  const split = (l: string) => l.split(/\t+|\s{2,}/).map(c => c.trim()).filter(Boolean);
  const headers = split(lines[0]);
  if (headers.length >= 2) {
    const rows = lines.slice(1).map(split).filter(r => r.length > 0);
    return { headers, rows, name: "" };
  }
  return null;
}

function inferType(vals: string[]): string {
  const ne = vals.filter(v => v && v.toLowerCase() !== "null");
  if (ne.every(v => /^-?\d+$/.test(v))) return "INT";
  if (ne.every(v => /^-?\d+\.?\d*$/.test(v))) return "DECIMAL(10,2)";
  return "VARCHAR(255)";
}

function toSQL(name: string, headers: string[], rows: string[][]): string {
  const safe = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "imported_table";
  const cols = headers.map((h, i) => {
    const t = inferType(rows.map(r => r[i] || ""));
    return `  ${h.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase()} ${t}`;
  });
  const create = `CREATE TABLE ${safe} (\n${cols.join(",\n")}\n);\n`;
  const inserts = rows.map(row => {
    const vals = headers.map((_, i) => {
      const v = row[i] ?? "NULL";
      if (!v || v.toLowerCase() === "null") return "NULL";
      return inferType(rows.map(r => r[i] || "")) === "VARCHAR(255)"
        ? `'${v.replace(/'/g, "''")}'` : v;
    });
    return `INSERT INTO ${safe} VALUES (${vals.join(", ")});`;
  });
  return create + inserts.join("\n");
}

// ── Component ────────────────────────────────────────────────────────────────

export function SqlEditor({ value, onChange, onTablesImported }: SqlEditorProps) {
  const taRef  = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);

  const [tables, setTables] = useState<ImportedTable[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);

  const syncScroll = useCallback(() => {
    if (!taRef.current) return;
    const { scrollTop, scrollLeft } = taRef.current;
    if (preRef.current) { preRef.current.scrollTop = scrollTop; preRef.current.scrollLeft = scrollLeft; }
    if (gutRef.current) gutRef.current.scrollTop = scrollTop;
  }, []);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.addEventListener("scroll", syncScroll, { passive: true });
    return () => el.removeEventListener("scroll", syncScroll);
  }, [syncScroll]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const htmlData = e.clipboardData.getData("text/html");
    const textData = e.clipboardData.getData("text/plain");

    let parsed: { headers: string[]; rows: string[][]; name: string } | null = null;
    if (htmlData) parsed = parseHtmlTable(htmlData);
    if (!parsed && textData) parsed = parsePlainTable(textData);

    if (parsed && parsed.headers.length >= 2 && parsed.rows.length > 0) {
      e.preventDefault();
      const counter = tables.length + 1;
      const name = parsed.name || `table_${counter}`;
      const sql = toSQL(name, parsed.headers, parsed.rows);
      const newTbl: ImportedTable = {
        name, sql, headers: parsed.headers, rows: parsed.rows,
        rowCount: parsed.rows.length, colCount: parsed.headers.length,
      };
      const updated = [...tables, newTbl];
      setTables(updated);
      onTablesImported?.(updated);
      // Prepend SQL to editor
      const sep = value.trim() ? "\n\n" : "";
      onChange(sql + sep + value);
      setExpanded(updated.length - 1);
    }
    // else: let normal paste through
  }, [tables, value, onChange, onTablesImported]);

  const removeTable = (idx: number) => {
    const tbl = tables[idx];
    const updated = tables.filter((_, i) => i !== idx);
    setTables(updated);
    onTablesImported?.(updated);
    onChange(value.replace(tbl.sql, "").replace(/^\n+/, ""));
    if (expanded === idx) setExpanded(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const { selectionStart: s, selectionEnd: end } = ta;
    const next = value.slice(0, s) + "  " + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
  };

  const lines = value.split("\n");
  const gutWidth = Math.max(String(lines.length).length * 9 + 28, 44);
  const highlighted = tokenize(value);
  const layer: React.CSSProperties = {
    ...FONT, position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    margin: 0, padding: "14px 18px 14px 14px", border: "none", outline: "none",
    resize: "none", whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal",
    boxSizing: "border-box", overflow: "auto",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden", background: "var(--background)" }}>

      {/* Import hint bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-purple-500/5 cursor-pointer group flex-shrink-0"
        onClick={() => setShowHint(h => !h)}
      >
        <ClipboardPaste className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
        <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors flex-1">
          Paste tables from <strong className="text-purple-400">LeetCode</strong>, <strong className="text-purple-400">Codeforces</strong>, <strong className="text-purple-400">HackerRank</strong> — auto-converts to SQL
        </span>
        {showHint ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </div>

      {showHint && (
        <div className="px-3 py-2 border-b border-border bg-purple-500/5 text-[11px] text-muted-foreground leading-relaxed flex-shrink-0">
          1. On LeetCode/Codeforces/HackerRank, <strong className="text-foreground">select the input table</strong> on the problem page.<br />
          2. Copy it (<kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+C</kbd>).<br />
          3. Click inside the editor and paste (<kbd className="px-1 py-0.5 rounded bg-muted font-mono">Ctrl+V</kbd>).<br />
          The table is auto-converted to <code className="font-mono bg-muted px-1 rounded">CREATE TABLE + INSERT</code> SQL. Works with HTML tables, markdown tables, and tab-separated data.
        </div>
      )}

      {/* Imported table chips */}
      {tables.length > 0 && (
        <div className="flex-shrink-0 border-b border-border bg-purple-500/5">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
            <Table2 className="w-3 h-3 text-purple-400 flex-shrink-0" />
            <span className="text-[10px] text-purple-400 font-medium">Imported tables:</span>
            {tables.map((t, i) => (
              <span key={i}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 cursor-pointer hover:bg-purple-500/20"
                onClick={() => setExpanded(expanded === i ? null : i)}>
                {t.name} <span className="text-purple-400/60">({t.rowCount}×{t.colCount})</span>
                <button onClick={e => { e.stopPropagation(); removeTable(i); }} className="ml-0.5 hover:text-red-400 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Expanded table preview */}
          {expanded !== null && tables[expanded] && (
            <div className="px-3 pb-2" style={{ overflowX: "scroll", scrollbarWidth: "none" }}>
              <table className="text-[10px] whitespace-nowrap border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted/60">
                  <tr>{tables[expanded].headers.map(h => <th key={h} className="px-3 py-1.5 text-left text-muted-foreground font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tables[expanded].rows.map((row, ri) => (
                    <tr key={ri} className="border-t border-border">
                      {row.map((cell, ci) => <td key={ci} className="px-3 py-1 font-mono text-foreground/80">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Line numbers */}
        <div ref={gutRef} style={{
          width: gutWidth, flexShrink: 0, overflow: "hidden",
          background: "var(--muted)", borderRight: "1px solid var(--border)",
          userSelect: "none", paddingTop: 14, paddingBottom: 14,
        }}>
          {lines.map((_, i) => (
            <div key={i} style={{ ...FONT, height: 21, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 10, paddingLeft: 6, color: "var(--muted-foreground)", opacity: 0.45 }}>
              {i + 1}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <pre ref={preRef} aria-hidden
            style={{ ...layer, color: "var(--foreground)", background: "transparent", pointerEvents: "none", overflow: "hidden", zIndex: 1 }}
            dangerouslySetInnerHTML={{ __html: highlighted }} />
          <textarea
            ref={taRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            style={{ ...layer, color: "transparent", background: "transparent", caretColor: "#818cf8", zIndex: 2, WebkitTextFillColor: "transparent" } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
