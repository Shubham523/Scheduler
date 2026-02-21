import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";
import { getFirestore } from "firebase/firestore"; 

const firebaseConfig = {
  apiKey: "AIzaSyD3kk6lsdTUtm-FqxXuXXWHzUZlskbm4hk",
  authDomain: "lifesync-73485.firebaseapp.com",
  projectId: "lifesync-73485",
  storageBucket: "lifesync-73485.firebasestorage.app",
  messagingSenderId: "846606800836",
  appId: "1:846606800836:web:3a20fe80eba7826f6a3691"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);
export const db = getFirestore(app); 