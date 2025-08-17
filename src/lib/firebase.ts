// src/lib/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDFwsilm4B-3PnazCz4UFFhWNhTDFgiNNQ",
  authDomain: "lie-hard.firebaseapp.com",
  projectId: "lie-hard",
  storageBucket: "lie-hard.firebasestorage.app",
  messagingSenderId: "557893076131",
  appId: "1:557893076131:web:838dee9c46ca5febfe6b16",
  measurementId: "G-52E7DDY094"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { db };
