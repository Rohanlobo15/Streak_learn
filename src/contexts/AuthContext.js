import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const signup = async (email, password, selectedRole) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Store user role in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        role: selectedRole
      });
      // Mark role as taken
      await setDoc(doc(db, 'roles', selectedRole), {
        taken: true,
        userId: userCredential.user.uid
      }, { merge: true });
      return userCredential;
    } catch (error) {
      throw error;
    }
  }

  const login = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Store auth token in localStorage for persistent login
      if (userCredential.user) {
        const token = await userCredential.user.getIdToken();
        localStorage.setItem('authToken', token);
      }
      return userCredential;
    } catch (error) {
      throw error;
    }
  }

  const logout = async () => {
    try {
      // Remove auth token from localStorage on logout
      localStorage.removeItem('authToken');
      return await signOut(auth);
    } catch (error) {
      throw error;
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          setCurrentUser({ ...user, ...userDoc.data() });
          
          // Store auth token in localStorage for persistent login
          const token = await user.getIdToken();
          localStorage.setItem('authToken', token);
        } catch (error) {
          console.error('Error fetching user data:', error);
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
        localStorage.removeItem('authToken');
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const contextValue = {
    currentUser,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
