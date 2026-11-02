/**
 * Firebase Client & Offline Persistence Module
 * Uses local Firebase SDK modules in vendor/ with Firestore offline cache.
 */

import { initializeApp, getApps, getApp } from '../vendor/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from '../vendor/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from '../vendor/firebase-firestore.js';

// Default configuration placeholder - user can replace this or configure in the UI
const DEFAULT_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const STORAGE_KEY_CONFIG = 'streakly_firebase_config';

let app = null;
let auth = null;
let db = null;
let currentUser = null;

/**
 * Checks if a config has the required projectId and apiKey.
 */
export function isValidConfig(cfg) {
  return Boolean(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey !== "YOUR_API_KEY");
}

/**
 * Retrieves the stored Firebase configuration from localStorage or default.
 */
export function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidConfig(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to read stored Firebase config:', err);
  }
  return DEFAULT_CONFIG;
}

/**
 * Saves a new Firebase configuration to localStorage.
 */
export function setStoredFirebaseConfig(cfg) {
  if (cfg) {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  } else {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
  }
}

/**
 * Checks if Firebase is actively configured with valid project credentials.
 */
export function isFirebaseConfigured() {
  const cfg = getStoredFirebaseConfig();
  return isValidConfig(cfg);
}

/**
 * Initializes the Firebase app, Auth, and Firestore with persistent offline caching.
 */
export function initFirebase() {
  const config = getStoredFirebaseConfig();
  if (!isValidConfig(config)) {
    console.info('Streakly: Running in offline / local mode (no Firebase config provided yet).');
    return null;
  }

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    auth = getAuth(app);

    // Initialize Firestore with offline multi-tab persistent cache
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheErr) {
      console.warn('Persistent cache initialization note:', cacheErr);
    }

    return { app, auth, db };
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return null;
  }
}

/**
 * Initiates Google Sign-In with popup.
 */
export async function signInWithGoogle() {
  if (!auth) {
    const initialized = initFirebase();
    if (!initialized) {
      throw new Error('Please configure your Firebase credentials in Settings first.');
    }
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  
  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    return currentUser;
  } catch (err) {
    console.error('Google sign-in error:', err);
    throw err;
  }
}

/**
 * Signs out the current user.
 */
export async function signOutUser() {
  if (auth) {
    await signOut(auth);
    currentUser = null;
  }
}

/**
 * Subscribes to Firebase Authentication state changes.
 */
export function onAuthChange(callback) {
  if (!auth) {
    initFirebase();
  }

  if (auth) {
    return onAuthStateChanged(auth, (user) => {
      currentUser = user;
      callback(user);
    });
  } else {
    // If Firebase is not configured, deliver null user
    callback(null);
    return () => {};
  }
}

/**
 * Saves all user data to Firestore under users/{userId}.
 * Firestore's persistent cache handles offline queueing automatically.
 */
export async function saveUserDataToCloud(uid, data) {
  if (!db || !uid) return false;
  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, {
      ...data,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore write queued or error (will sync when online):', err);
    return false;
  }
}

/**
 * Subscribes to realtime updates of user data from Firestore.
 */
export function subscribeToUserData(uid, onData, onError) {
  if (!db || !uid) return () => {};
  
  const userDocRef = doc(db, 'users', uid);
  return onSnapshot(userDocRef, { includeMetadataChanges: true }, (snapshot) => {
    const source = snapshot.metadata.fromCache ? 'cache' : 'server';
    const hasPendingWrites = snapshot.metadata.hasPendingWrites;
    if (snapshot.exists()) {
      onData(snapshot.data(), { source, hasPendingWrites });
    } else {
      onData(null, { source, hasPendingWrites });
    }
  }, (err) => {
    if (onError) onError(err);
    else console.warn('Firestore snapshot error:', err);
  });
}

