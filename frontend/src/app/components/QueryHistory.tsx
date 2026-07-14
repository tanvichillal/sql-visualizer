import { useState, useEffect } from "react";
import { useTheme } from "./ThemeContext";
import {
  ChevronLeft, Search, Star, Trash2, Play, Clock,
  Code2, Moon, Sun, StarOff, Database, Check, Filter, History
} from "lucide-react";
import { queryStore, type StoredQuery } from "../queryStore";

interface QueryHistoryProps { onNavigate: (page: string) => void; }

const CLAUSE_COLORS: Record<string, string> = {
  FROM: "bg-indigo-500", JOIN: "bg-amber-500", "INNER JOIN": "bg-amber-500",
  WHERE: "bg-pink-500", "GROUP BY": "bg-emerald-500", HAVING: "bg-cyan-500",
  SELECT: "bg-purple-500", "ORDER BY": "bg-orange-500",
};

export function QueryHistory({ onNavigate }: QueryHistoryProps) {
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [queries, setQueries] = useState<StoredQuery[]>(queryStore.getAll());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => queryStore.subscribe(() => {
    const all = queryStore.getAll();
    setQueries(all);
  }), []);

  const filtered = queries.filter(q => {
    const matchSearch = q.sql.toLowerCase().includes(search.toLowerCase()) || q.topic.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (!savedOnly || q.saved);
  });

  const selected = queries.find(q => q.id === selectedId);
  const savedCount = queries.filter(q => q.saved).length;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-card/50 flex-shrink-0">
        <button onClick={() => onNavigate("dashboard")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="w-px h-4 bg-border" />
        <History className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-medium">Query History</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── Left list ── */}
        <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-border">

          {/* Stats bar */}
          <div className="flex border-b border-border flex-shrink-0">
            <div className="flex-1 px-4 py-2.5 flex flex-col items-center border-r border-border">
              <span className="text-sm font-bold text-foreground">{queries.length}</span>
              <span className="text-[10px] text-muted-foreground">Total Queries</span>
            </div>
            <div className="flex-1 px-4 py-2.5 flex flex-col items-center">
              <span className="text-sm font-bold text-amber-400">{savedCount}</span>
              <span className="text-[10px] text-muted-foreground">Saved</span>
            </div>
          </div>

          {/* Search + filter */}
          <div className="p-3 border-b border-border space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search queries or topics…"
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSavedOnly(f => !f)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${savedOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "border-border text-muted-foreground hover:bg-muted"}`}>
                <Star className={`w-3 h-3 ${savedOnly ? "fill-amber-400" : ""}`} />
                {savedOnly ? "Saved only" : "All queries"}
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Query list */}
          <div style={{ flex: 1, overflowY: "scroll", scrollbarWidth: "none" }} className="[&::-webkit-scrollbar]:hidden">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                {savedOnly ? <Star className="w-10 h-10 opacity-20" /> : <Clock className="w-10 h-10 opacity-20" />}
                <p className="text-sm text-center">{savedOnly ? "No saved queries yet" : "No queries match your search"}</p>
                <button onClick={() => onNavigate("workspace")} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">
                  Open Workspace
                </button>
              </div>
            ) : (
              filtered.map(q => (
                <button key={q.id} onClick={() => setSelectedId(q.id)}
                  className={`w-full text-left p-3.5 border-b border-border transition-colors hover:bg-muted/40 relative ${selectedId === q.id ? "bg-muted/60" : ""}`}>

                  {/* Selected indicator */}
                  {selectedId === q.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r-full" />}

                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 font-medium">{q.topic}</span>
                      {/* Saved badge — clearly visible */}
                      {q.saved && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> Saved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); queryStore.toggleSave(q.id); }}
                        title={q.saved ? "Unsave" : "Save"}
                        className={`p-1 rounded-lg transition-colors ${q.saved ? "hover:bg-amber-500/10" : "hover:bg-muted"}`}>
                        {q.saved
                          ? <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          : <StarOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); queryStore.delete(q.id); if (selectedId === q.id) setSelectedId(null); }}
                        title="Delete" className="p-1 rounded-lg hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] font-mono text-foreground/75 line-clamp-2 leading-relaxed mb-2">{q.sql}</p>

                  <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{q.time}</span>
                    <span className="w-px h-3 bg-border" />
                    <span>{q.rows} row{q.rows !== 1 ? "s" : ""}</span>
                    <span className="w-px h-3 bg-border" />
                    <span>{q.duration}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right: preview ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-400 font-medium">{selected.topic}</span>
                    {selected.saved
                      ? <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium"><Star className="w-3 h-3 fill-amber-400" />Saved</span>
                      : <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground font-medium">Not saved</span>
                    }
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{selected.time}</span>
                    <span>{selected.rows} row{selected.rows !== 1 ? "s" : ""} returned</span>
                    <span>{selected.duration}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => queryStore.toggleSave(selected.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border transition-colors ${selected.saved ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    <Star className={`w-3.5 h-3.5 ${selected.saved ? "fill-amber-400" : ""}`} />
                    {selected.saved ? "Unsave" : "Save"}
                  </button>
                  <button onClick={() => onNavigate("workspace")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                    <Play className="w-3.5 h-3.5" /> Open in Workspace
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* SQL */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5" /> SQL Query
                  </h3>
                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <pre className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-mono">{selected.sql}</pre>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[["Rows Returned", String(selected.rows)], ["Execution Time", selected.duration], ["Topic", selected.topic]].map(([label, value]) => (
                    <div key={label} className="p-4 rounded-xl bg-card border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
                      <div className="text-sm font-semibold text-foreground">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Execution steps */}
                {selected.steps && selected.steps.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Execution Steps ({selected.steps.length})
                    </h3>
                    <div className="space-y-2">
                      {selected.steps.map((s, i) => {
                        const badge = CLAUSE_COLORS[s.clause] || "bg-indigo-500";
                        return (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/40 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${badge} text-white uppercase`}>{s.clause}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-foreground">{s.title}</div>
                              <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{s.explanation}</div>
                            </div>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">{s.rowCount} rows</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <Database className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium">Select a query to preview</p>
                <p className="text-xs mt-1">Run queries in the Workspace to build your history</p>
              </div>
              <button onClick={() => onNavigate("workspace")} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
                <Play className="w-3.5 h-3.5" /> Open Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
