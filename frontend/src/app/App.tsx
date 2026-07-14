import { useState, useEffect } from "react";
import { ThemeProvider } from "./components/ThemeContext";
import { AuthProvider, useAuth } from "./AuthContext";
import { LandingPage } from "./components/LandingPage";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { SQLWorkspace } from "./components/SQLWorkspace";
import { initQueryStore, clearQueryStore } from "./queryStore";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { Loader2 } from "lucide-react";

type Page = "landing" | "auth" | "dashboard" | "workspace";

function AppInner() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>("landing");

  // When auth state changes — init or clear Firestore sync
  useEffect(() => {
    if (user) {
      initQueryStore(user.uid);
      // Auto-navigate to dashboard if user is already signed in
      setPage(p => (p === "landing" || p === "auth") ? "dashboard" : p);
    } else {
      clearQueryStore();
    }
  }, [user]);

  const navigate = (p: string) => {
    if (p === "logout") {
      signOut(auth).then(() => setPage("landing"));
      return;
    }
    if (["landing", "auth", "dashboard", "workspace"].includes(p)) {
      // Guard — redirect to auth if trying to access protected page without login
      if ((p === "dashboard" || p === "workspace") && !user) {
        setPage("auth");
        return;
      }
      setPage(p as Page);
    } else if (["history", "saved", "learn", "visualization"].includes(p)) {
      setPage("dashboard");
    }
  };

  // Show spinner while Firebase checks auth state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {page === "landing"   && <LandingPage onNavigate={navigate} />}
      {page === "auth"      && <AuthPage onNavigate={navigate} />}
      {page === "dashboard" && <Dashboard onNavigate={navigate} />}
      {page === "workspace" && <SQLWorkspace onNavigate={navigate} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
