import { useState } from "react";
import { useTheme } from "./ThemeContext";
import {
  Database, Zap, GitBranch, BarChart3, Star, ChevronRight,
  Play, Moon, Sun, Menu, X, Code2
} from "lucide-react";

interface LandingPageProps {
  onNavigate: (page: string) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const features = [
    { icon: Database, title: "Query Visualization", desc: "See your SQL query transform data in real-time with animated table states.", color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { icon: Zap, title: "Step-by-Step Execution", desc: "Break down complex queries into digestible steps — FROM, WHERE, JOIN, GROUP BY.", color: "text-purple-500", bg: "bg-purple-500/10" },
    { icon: GitBranch, title: "Join Visualizer", desc: "Visualize INNER, LEFT, RIGHT, FULL OUTER joins with animated Venn diagrams.", color: "text-pink-500", bg: "bg-pink-500/10" },
    { icon: BarChart3, title: "Aggregate Functions", desc: "Watch COUNT, SUM, AVG, MIN, MAX operate on grouped rows step by step.", color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const testimonials = [
    { name: "Priya Sharma", role: "CS Student, IIT Delhi", avatar: "PS", text: "Finally understood JOINs after weeks of struggling. The visual execution is a game changer!", rating: 5 },
    { name: "Rahul Mehta", role: "Placement Candidate", avatar: "RM", text: "Cleared 3 SQL interview rounds back to back. SQL Visualizer made GROUP BY and HAVING so intuitive.", rating: 5 },
    { name: "Sarah Chen", role: "Data Analyst Intern", avatar: "SC", text: "The step-by-step breakdown of window functions saved my internship. Absolutely brilliant tool.", rating: 5 },
    { name: "Arjun Patel", role: "Backend Developer", avatar: "AP", text: "Even as an experienced dev, the subquery visualization helped me debug complex queries instantly.", rating: 5 },
  ];



  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Database className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-foreground">SQL Visualizer</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it Works</a>
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Reviews</a>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={() => onNavigate("auth")} className="hidden sm:block text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                Sign In
              </button>
              <button onClick={() => onNavigate("auth")} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Get Started
              </button>
              <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-4">
            <a href="#features" className="text-sm text-muted-foreground" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="text-sm text-muted-foreground" onClick={() => setMenuOpen(false)}>How it Works</a>
            <a href="#testimonials" className="text-sm text-muted-foreground" onClick={() => setMenuOpen(false)}>Reviews</a>
          </div>
        )}
      </nav>

      {/* Hero — two-column, everything above the fold */}
      <section className="relative overflow-hidden px-4" style={{ minHeight: "calc(100vh - 64px)", display: "flex", alignItems: "center" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-pink-500/10 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center py-12">
          {/* Left: text + CTAs */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs mb-6">
              <Zap className="w-3 h-3" />
              <span>Interactive SQL Learning Platform</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground mb-5 leading-tight">
              Visualize SQL{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Step by Step
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-lg">
              Understand how SQL queries execute internally — FROM, JOIN, WHERE, GROUP BY, HAVING — with live animated visualizations.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onNavigate("dashboard")}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/25"
              >
                <Play className="w-4 h-4" />
                Get Started Free
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate("workspace")}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <Code2 className="w-4 h-4" />
                Try Demo
              </button>
            </div>


          </div>

          {/* Right: live SQL editor card */}
          <div className="relative">
            <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/15 rounded-3xl blur-2xl pointer-events-none" />
            <div className="relative rounded-2xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-2 text-xs text-muted-foreground" style={{ fontFamily: "monospace" }}>sql_visualizer.sql</span>
              </div>

              {/* Syntax-highlighted SQL */}
              <div className="p-5 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.75" }}>
                <div><span style={{ color: "#c084fc", fontWeight: 600 }}>SELECT</span> <span style={{ color: "#fbbf24" }}>d.department_name</span>, <span style={{ color: "#34d399", fontWeight: 600 }}>COUNT</span>(<span style={{ color: "#fbbf24" }}>e.id</span>) <span style={{ color: "#60a5fa" }}>AS</span> <span style={{ color: "#a5b4fc" }}>headcount</span>,</div>
                <div className="pl-4"><span style={{ color: "#34d399", fontWeight: 600 }}>AVG</span>(<span style={{ color: "#fbbf24" }}>e.salary</span>) <span style={{ color: "#60a5fa" }}>AS</span> <span style={{ color: "#a5b4fc" }}>avg_salary</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>FROM</span> <span style={{ color: "#fbbf24" }}>employees e</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>JOIN</span> <span style={{ color: "#fbbf24" }}>departments d</span> <span style={{ color: "#60a5fa" }}>ON</span> <span style={{ color: "#fbbf24" }}>e.dept_id</span> <span style={{ color: "#e879f9" }}>=</span> <span style={{ color: "#fbbf24" }}>d.id</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>WHERE</span> <span style={{ color: "#fbbf24" }}>e.salary</span> <span style={{ color: "#e879f9" }}>&gt;</span> <span style={{ color: "#fbbf24" }}>50000</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>GROUP BY</span> <span style={{ color: "#fbbf24" }}>d.department_name</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>HAVING</span> <span style={{ color: "#34d399", fontWeight: 600 }}>COUNT</span>(<span style={{ color: "#fbbf24" }}>e.id</span>) <span style={{ color: "#e879f9" }}>&gt;</span> <span style={{ color: "#fbbf24" }}>3</span></div>
                <div><span style={{ color: "#60a5fa", fontWeight: 600 }}>ORDER BY</span> <span style={{ color: "#a5b4fc" }}>avg_salary</span> <span style={{ color: "#60a5fa" }}>DESC</span><span style={{ color: "#94a3b8" }}>;</span></div>
              </div>

              {/* Step badges */}
              <div className="grid grid-cols-4 gap-2 px-5 pb-5">
                {[
                  { label: "FROM",     bg: "#3730a3", text: "#818cf8", border: "#4338ca" },
                  { label: "WHERE",    bg: "#831843", text: "#f9a8d4", border: "#9d174d" },
                  { label: "GROUP BY", bg: "#064e3b", text: "#6ee7b7", border: "#065f46" },
                  { label: "HAVING",  bg: "#164e63", text: "#67e8f9", border: "#155e75" },
                ].map(({ label, bg, text, border }) => (
                  <div
                    key={label}
                    className="px-2 py-2 rounded-lg text-xs font-semibold text-center"
                    style={{ background: bg, color: text, border: `1px solid ${border}`, fontFamily: "monospace" }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Features */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold text-foreground mb-4">Everything you need to master SQL</h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">From basic SELECT to complex window functions — visualize it all.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc, color, bg }) => (
              <div key={title} className="p-6 rounded-2xl border border-border bg-card hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold text-foreground mb-4">How it works</h2>
            <p className="text-lg text-muted-foreground">Three simple steps to SQL mastery</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Write your SQL", desc: "Paste or type any SQL query in our intelligent editor with syntax highlighting and auto-completion." },
              { step: "02", title: "Execute & Visualize", desc: "Click 'Step-by-Step' to watch your query execute clause by clause with animated table transformations." },
              { step: "03", title: "Understand & Learn", desc: "Read AI-powered explanations for each step, understand WHY the query produces specific results." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-mono font-semibold text-sm mx-auto mb-4">
                  {step}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-semibold text-foreground mb-4">Loved by learners</h2>
            <p className="text-lg text-muted-foreground">Join 50,000+ students who mastered SQL with us</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {testimonials.map(({ name, role, avatar, text, rating }) => (
              <div key={name} className="p-6 rounded-2xl border border-border bg-card">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {avatar}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="text-xs text-muted-foreground">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10 rounded-3xl" />
            <div className="relative">
              <h2 className="text-4xl font-semibold mb-4">Ready to master SQL?</h2>
              <p className="text-white/80 mb-8 text-lg">Start visualizing queries for free. No credit card required.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => onNavigate("auth")} className="px-8 py-4 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-white/90 transition-colors">
                  Start for Free
                </button>
                <button onClick={() => onNavigate("workspace")} className="px-8 py-4 bg-white/10 text-white rounded-xl border border-white/20 hover:bg-white/20 transition-colors">
                  Try Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-foreground">SQL Visualizer</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
