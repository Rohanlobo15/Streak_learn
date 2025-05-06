import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, writeBatch } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyDPwHTBl1cquIIVBXIVyntES7_wyXv4XIw",
  authDomain: "mine-805ba.firebaseapp.com",
  projectId: "mine-805ba",
  storageBucket: "mine-805ba.firebasestorage.app",
  messagingSenderId: "755696512125",
  appId: "1:755696512125:web:555b2a35c1e63c30ae1514"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize messaging (wrapped in try-catch as it might fail in some browsers)
let messagingInstance = null;
try {
  messagingInstance = getMessaging(app);
} catch (error) {
  console.log('Firebase messaging not supported or blocked');
}
export const messaging = messagingInstance;

// Initialize roles collection
export const initializeRoles = async () => {
  const roles = [
    'Rohan Lobo',
    'Vedanta',
    'Prabhas',
    'Ashif',
    'Sathwik',
    'Rohan K',
    'Shashank'
  ];

  try {
    // Check online status
    if (!window.navigator.onLine) {
      console.warn('No internet connection, skipping role initialization');
      return;
    }

    // Use getDoc to check if each role exists before initializing
    const batch = writeBatch(db);
    
    // Track if we've added any operations to the batch
    let batchHasOperations = false;
    
    // Process each role one by one to check if it exists
    for (const role of roles) {
      try {
        const roleRef = doc(db, 'roles', role);
        const roleDoc = await getDoc(roleRef);
        
        // Only initialize the role if it doesn't exist
        if (!roleDoc.exists()) {
          batch.set(roleRef, { taken: false, userId: null });
          batchHasOperations = true;
        }
      } catch (roleError) {
        console.warn(`Error checking role ${role}:`, roleError);
        // Continue with other roles
      }
    }
    
    // Commit the batch if there are any operations
    if (batchHasOperations) {
      try {
        await batch.commit();
        console.log('New roles initialized successfully');
      } catch (commitError) {
        console.error('Error committing role batch:', commitError);
      }
    } else {
      console.log('All roles already exist, no initialization needed');
    }
  } catch (error) {
    console.error('Error initializing roles:', error);
    // Don't throw, just log the error to prevent app crashes
  }
};
