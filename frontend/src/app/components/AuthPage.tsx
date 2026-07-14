import { useState } from "react";
import { useTheme } from "./ThemeContext";
import {
  Database, Eye, EyeOff, ArrowLeft, Moon, Sun, Loader2, AlertCircle, CheckCircle2
} from "lucide-react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

interface AuthPageProps { onNavigate: (page: string) => void; }

export function AuthPage({ onNavigate }: AuthPageProps) {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearMessages = () => { setError(null); setSuccess(null); };

  const friendlyError = (code: string) => {
    const map: Record<string, string> = {
      "auth/user-not-found":       "No account found with this email.",
      "auth/wrong-password":       "Incorrect password. Try again.",
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/weak-password":        "Password must be at least 6 characters.",
      "auth/invalid-email":        "Please enter a valid email address.",
      "auth/too-many-requests":    "Too many attempts. Please wait a moment.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] || "Something went wrong. Please try again.";
  };

  const handleGoogle = async () => {
    clearMessages();
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onNavigate("dashboard");
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email);
        setSuccess("Reset link sent! Check your inbox.");
        setLoading(false);
        return;
      }
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onNavigate("dashboard");
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally { setLoading(false); }
  };

  const switchMode = (m: typeof mode) => { setMode(m); clearMessages(); };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <button onClick={() => onNavigate("landing")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </button>
        <button onClick={toggle} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-xl shadow-2xl shadow-black/20 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/25">
              <Database className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              {mode === "login" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login" ? "Sign in to your SQL Visualizer account"
                : mode === "signup" ? "Start your SQL learning journey"
                : "We'll send a reset link to your email"}
            </p>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 mb-4">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 mb-4">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{success}
            </div>
          )}

          {/* Google */}
          {mode !== "forgot" && (
            <>
              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm font-medium disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full px-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>
            )}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
            </div>
            {mode !== "forgot" && (
              <div>
                <label className="block text-sm text-muted-foreground mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={6}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === "login" && (
                  <div className="flex justify-end mt-1.5">
                    <button type="button" onClick={() => switchMode("forgot")}
                      className="text-xs text-primary hover:text-primary/80 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>Don't have an account?{" "}
                <button onClick={() => switchMode("signup")} className="text-primary hover:text-primary/80 font-medium transition-colors">Sign up</button>
              </>
            ) : mode === "signup" ? (
              <>Already have an account?{" "}
                <button onClick={() => switchMode("login")} className="text-primary hover:text-primary/80 font-medium transition-colors">Sign in</button>
              </>
            ) : (
              <button onClick={() => switchMode("login")} className="text-primary hover:text-primary/80 font-medium transition-colors">Back to Sign In</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
