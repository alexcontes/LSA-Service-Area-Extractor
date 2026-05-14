import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// @ts-ignore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Helper to get user and account from URL
 */
export function getTrackingContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    username: params.get('username') || 'Admin',
    accountId: params.get('account_id') || '1'
  };
}
