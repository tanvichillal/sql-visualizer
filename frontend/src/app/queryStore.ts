import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, serverTimestamp, query, orderBy, where,
  Timestamp
} from "firebase/firestore";
import { db } from "./firebase";
import type { ExecutionStep } from "./api";

export interface StoredQuery {
  id: string;
  sql: string;
  topic: string;
  time: string;
  saved: boolean;
  rows: number;
  duration: string;
  steps?: ExecutionStep[];
  userId?: string;
  createdAt?: Timestamp;
}

const COL = "queries";

// ── In-memory cache (kept in sync by Firestore listener) ──────────────────────
let _queries: StoredQuery[] = [];
let _listeners: (() => void)[] = [];
let _unsubFirestore: (() => void) | null = null;
let _currentUserId: string | null = null;

function notify() { _listeners.forEach(fn => fn()); }

function formatTime(ts: Timestamp | null | undefined): string {
  if (!ts) return "Just now";
  const diff = Date.now() - ts.toMillis();
  if (diff < 60_000)  return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Call this when a user logs in — starts real-time Firestore sync */
export function initQueryStore(userId: string) {
  if (_currentUserId === userId) return; // already listening for this user
  _currentUserId = userId;
  if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null; }

  const q = query(
    collection(db, COL),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  _unsubFirestore = onSnapshot(q, (snap) => {
    _queries = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        sql: data.sql ?? "",
        topic: data.topic ?? "General",
        time: formatTime(data.createdAt),
        saved: data.saved ?? false,
        rows: data.rows ?? 0,
        duration: data.duration ?? "",
        steps: data.steps ?? undefined,
        userId: data.userId,
        createdAt: data.createdAt,
      } as StoredQuery;
    });
    notify();
  });
}

/** Call when user logs out — stops sync and clears cache */
export function clearQueryStore() {
  _currentUserId = null;
  if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null; }
  _queries = [];
  notify();
}

export const queryStore = {
  getAll: () => [..._queries],
  getSaved: () => _queries.filter(q => q.saved),

  subscribe: (fn: () => void) => {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  },

  add: async (entry: Omit<StoredQuery, "id" | "time">) => {
    if (!_currentUserId) {
      // Not logged in — add to local memory only
      const id = Date.now().toString();
      _queries = [{ ...entry, id, time: "Just now" }, ..._queries.slice(0, 99)];
      notify();
      return id;
    }
    // Logged in — persist to Firestore
    // Strip steps if too large (Firestore 1MB doc limit)
    const stepsToStore = entry.steps && JSON.stringify(entry.steps).length < 500_000
      ? entry.steps : undefined;

    const ref = await addDoc(collection(db, COL), {
      ...entry,
      steps: stepsToStore,
      userId: _currentUserId,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  toggleSave: async (id: string) => {
    const q = _queries.find(q => q.id === id);
    if (!q) return;
    // Optimistic update
    _queries = _queries.map(x => x.id === id ? { ...x, saved: !x.saved } : x);
    notify();
    if (_currentUserId) {
      await updateDoc(doc(db, COL, id), { saved: !q.saved });
    }
  },

  delete: async (id: string) => {
    _queries = _queries.filter(q => q.id !== id);
    notify();
    if (_currentUserId) {
      await deleteDoc(doc(db, COL, id));
    }
  },

  getById: (id: string) => _queries.find(q => q.id === id),
};
