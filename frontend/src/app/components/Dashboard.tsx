import { useState, useEffect } from "react";
import { useTheme } from "./ThemeContext";
import {
  Database, Code2, Star, Moon, Sun, Menu, LogOut,
  Settings, BarChart3, ChevronLeft, Clock, Play, Trash2, StarOff, Check
} from "lucide-react";
import { queryStore, type StoredQuery } from "../queryStore";
import { useAuth } from "../AuthContext";

interface DashboardProps { onNavigate: (page: string) => void; }

export function Dashboard({ onNavigate }: DashboardProps) {
  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeNav, setActiveNav] = useState("saved");
  const [queries, setQueries] = useState<StoredQuery[]>(queryStore.getAll());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => queryStore.subscribe(() => setQueries(queryStore.getAll())), []);

  const filtered = (activeNav === "saved" ? queries.filter(q => q.saved) : queries)
    .filter(q =>
      q.sql.toLowerCase().includes(search.toLowerCase()) ||
      q.topic.toLowerCase().includes(search.toLowerCase())
    );

  const selected = queries.find(q => q.id === selectedId);

  const navItems = [
    { id: "saved",     label: "Saved Queries",  icon: Star },
    { id: "history",   label: "Recent History",  icon: Clock },
    { id: "workspace", label: "SQL Workspace",   icon: Code2 },
  ];

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-56" : "w-14"} flex-shrink-0 flex flex-col border-r border-border bg-card transition-all duration-200`}>
        <div className="h-14 flex items-center px-3 border-b border-border gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-3.5 h-3.5 text-white" />
          </div>
          {sidebarOpen && <span className="font-semibold text-sm truncate">SQL Visualizer</span>}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id}
              onClick={() => { setActiveNav(id); if (id === "workspace") onNavigate("workspace"); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                activeNav === id
                  ? "bg-indigo-500/15 text-indigo-400 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${id === "saved" && activeNav === id ? "fill-amber-400 text-amber-400" : ""}`} />
              {sidebarOpen && <span className="truncate">{label}</span>}
              {/* live count badge */}
              {sidebarOpen && id === "saved" && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500/10 text-amber-400 font-semibold">
                  {queries.filter(q => q.saved).length}
                </span>
              )}
              {sidebarOpen && id === "history" && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] bg-muted text-muted-foreground font-semibold">
                  {queries.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-border space-y-0.5">
          <button onClick={toggle} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            {theme === "dark" ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
            {sidebarOpen && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <Settings className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>Settings</span>}
          </button>
          <button onClick={() => onNavigate("logout")} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center gap-3 px-5 border-b border-border bg-background flex-shrink-0">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-2">
            {activeNav === "saved"
              ? <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              : <Clock className="w-4 h-4 text-indigo-400" />}
            <h1 className="text-sm font-semibold">
              {activeNav === "saved" ? "Saved Queries" : "Recent History"}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground">{filtered.length}</span>
          </div>
          <div className="flex-1 max-w-xs ml-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search queries…"
              className="w-full px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => onNavigate("workspace")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">
              <Play className="w-3.5 h-3.5" /> Open Workspace
            </button>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold" title={user?.email ?? ""}>{user?.displayName ? user.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0,2) : user?.email?.[0]?.toUpperCase() ?? "U"}</div>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Query list */}
          <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col">
            {/* Section header */}
            <div className="px-4 py-2.5 border-b border-border bg-muted/10 flex items-center gap-2 flex-shrink-0">
              {activeNav === "saved"
                ? <><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /><span className="text-xs font-semibold text-foreground">Starred Queries</span></>
                : <><Clock className="w-3.5 h-3.5 text-indigo-400" /><span className="text-xs font-semibold text-foreground">Recent Queries</span></>}
            </div>

            <div style={{ flex: 1, overflowY: "scroll", scrollbarWidth: "none" }} className="[&::-webkit-scrollbar]:hidden">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
                  {activeNav === "saved" ? <Star className="w-10 h-10 opacity-20" /> : <Clock className="w-10 h-10 opacity-20" />}
                  <p className="text-sm text-center leading-relaxed">
                    {activeNav === "saved"
                      ? "No saved queries yet.\nRun a query in the Workspace and hit ★ to save it here."
                      : "No history yet.\nOpen the Workspace and run your first query."}
                  </p>
                  <button onClick={() => onNavigate("workspace")} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors mt-1">
                    Open Workspace
                  </button>
                </div>
              ) : (
                filtered.map((q, idx) => (
                  <button key={q.id} onClick={() => setSelectedId(q.id)}
                    className={`w-full text-left p-4 border-b border-border transition-all hover:bg-muted/40 ${selectedId === q.id ? "bg-muted/60 border-l-[3px] border-l-indigo-500" : ""}`}>

                    {/* Row 1: topic + saved badge + actions */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 font-semibold flex-shrink-0">{q.topic}</span>
                        {q.saved && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500/10 text-amber-400 font-semibold flex-shrink-0">
                            <Star className="w-2 h-2 fill-amber-400" />Saved
                          </span>
                        )}
                        {idx === 0 && activeNav === "history" && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-500/10 text-emerald-400 font-semibold flex-shrink-0">Latest</span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={e => { e.stopPropagation(); queryStore.toggleSave(q.id); }}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={q.saved ? "Unsave" : "Save"}>
                          {q.saved
                            ? <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            : <StarOff className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); queryStore.delete(q.id); if (selectedId === q.id) setSelectedId(null); }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: SQL preview */}
                    <p className="text-[11px] font-mono text-foreground/75 line-clamp-2 leading-relaxed mb-2">{q.sql}</p>

                    {/* Row 3: meta */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{q.time}</span>
                      <span>{q.rows} rows</span>
                      <span>{q.duration}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Preview pane */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selected ? (
              <>
                {/* Preview header */}
                <div className="px-6 py-4 border-b border-border flex-shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-400 font-semibold">{selected.topic}</span>
                        {selected.saved
                          ? <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 font-semibold">
                              <Star className="w-3 h-3 fill-amber-400" />Saved
                            </span>
                          : <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted text-muted-foreground font-semibold">
                              Unsaved
                            </span>
                        }
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{selected.time}</span>
                        <span>{selected.rows} rows returned</span>
                        <span>{selected.duration}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => queryStore.toggleSave(selected.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                          selected.saved
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}>
                        <Star className={`w-3.5 h-3.5 ${selected.saved ? "fill-amber-400" : ""}`} />
                        {selected.saved ? "Unsave" : "Save"}
                      </button>
                      <button onClick={() => onNavigate("workspace")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                        <Play className="w-3.5 h-3.5" /> Open in Workspace
                      </button>
                    </div>
                  </div>
                </div>

                {/* Preview body */}
                <div className="flex-1 overflow-auto p-6">
                  <div className="mb-6">
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">SQL Query</h3>
                    <div className="p-4 rounded-xl bg-muted/20 border border-border">
                      <pre className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-mono">{selected.sql}</pre>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      ["Rows Returned", String(selected.rows)],
                      ["Execution Time", selected.duration],
                      ["Topic", selected.topic],
                    ].map(([label, value]) => (
                      <div key={label} className="p-4 rounded-xl bg-card border border-border">
                        <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">{label}</div>
                        <div className="text-sm font-semibold text-foreground">{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Execution steps */}
                  {selected.steps && selected.steps.length > 0 && (
                    <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                      <h3 className="text-xs font-semibold text-indigo-400 mb-3 flex items-center gap-2">
                        Execution Steps
                        <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-[10px]">{selected.steps.length}</span>
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selected.steps.map((s, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[9px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <span className="text-[10px] text-indigo-300 font-mono font-semibold">{s.clause}</span>
                            <span className="text-[10px] text-muted-foreground">{s.rowCount}r</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <BarChart3 className="w-12 h-12 opacity-20" />
                <p className="text-sm">Select a query to preview</p>
                <p className="text-xs opacity-60">Star queries to save them here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
