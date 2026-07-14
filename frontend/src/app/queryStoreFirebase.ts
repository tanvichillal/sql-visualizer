/**
 * DROP-IN REPLACEMENT for queryStore.ts once Firebase is configured.
 *
 * Usage:
 *   1. Complete firebase.ts setup above
 *   2. Uncomment the imports in firebase.ts
 *   3. In every component that imports queryStore, change:
 *        import { queryStore } from "../queryStore";
 *      to:
 *        import { queryStore } from "../queryStoreFirebase";
 */

// import {
//   collection, addDoc, updateDoc, deleteDoc, doc,
//   onSnapshot, serverTimestamp, query, orderBy
// } from "firebase/firestore";
// import { db } from "./firebase";
// import type { ExecutionStep } from "./api";
//
// export interface StoredQuery {
//   id: string; sql: string; topic: string; time: string;
//   saved: boolean; rows: number; duration: string;
//   steps?: ExecutionStep[];
// }
//
// const COL = "queries";
// let _listeners: (() => void)[] = [];
//
// // Real-time Firestore listener — call once at app start
// export function initFirestoreSync(onUpdate: (q: StoredQuery[]) => void) {
//   const q = query(collection(db, COL), orderBy("createdAt", "desc"));
//   return onSnapshot(q, (snap) => {
//     const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StoredQuery));
//     onUpdate(docs);
//   });
// }
//
// export const queryStore = {
//   // Add a new query run to Firestore
//   add: async (entry: Omit<StoredQuery, "id" | "time">) => {
//     const ref = await addDoc(collection(db, COL), {
//       ...entry,
//       time: "Just now",
//       createdAt: serverTimestamp(),
//     });
//     return ref.id;
//   },
//
//   // Toggle saved/unsaved
//   toggleSave: async (id: string, currentlySaved: boolean) => {
//     await updateDoc(doc(db, COL, id), { saved: !currentlySaved });
//   },
//
//   // Delete a query
//   delete: async (id: string) => {
//     await deleteDoc(doc(db, COL, id));
//   },
// };
//
// // In Dashboard.tsx / SQLWorkspace.tsx replace useEffect with:
// //
// // useEffect(() => {
// //   const unsub = initFirestoreSync(setQueries);
// //   return unsub; // cleanup on unmount
// // }, []);

export {};
