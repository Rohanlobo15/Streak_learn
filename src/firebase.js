import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, writeBatch, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDPwHTBl1cquIIVBXIVyntES7_wyXv4XIw",
  authDomain: "mine-805ba.firebaseapp.com",
  projectId: "mine-805ba",
  storageBucket: "mine-805ba.firebasestorage.app",
  messagingSenderId: "755696512125",
  appId: "1:755696512125:web:2b575ce3d65aa82cae1514"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.log('The current browser does not support offline persistence');
    }
  });

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
      throw new Error('No internet connection');
    }

    // Use getDoc to check if each role exists before initializing
    const batch = writeBatch(db);
    
    // Track if we've added any operations to the batch
    let batchHasOperations = false;
    
    // Process each role one by one to check if it exists
    for (const role of roles) {
      const roleRef = doc(db, 'roles', role);
      const roleDoc = await getDoc(roleRef);
      
      // Only initialize the role if it doesn't exist
      if (!roleDoc.exists()) {
        batch.set(roleRef, { taken: false, userId: null });
        batchHasOperations = true;
      }
    }
    
    // Commit the batch if there are any operations
    if (batchHasOperations) {
      await batch.commit();
      console.log('New roles initialized successfully');
    } else {
      console.log('All roles already exist, no initialization needed');
    }
  } catch (error) {
    console.error('Error initializing roles:', error);
    throw error; // Re-throw to handle in component
  }
};
