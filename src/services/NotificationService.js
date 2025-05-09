import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  Timestamp, 
  addDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../firebase';

// VAPID key from Firebase Cloud Messaging
const VAPID_KEY = "";

// Get messaging instance
let messaging;
try {
  messaging = getMessaging();
} catch (error) {
  console.log('Messaging not supported or blocked');
}

// Request permission and get FCM token
export const requestNotificationPermission = async () => {
  try {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return null;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }
    
    // Get token if messaging is available
    if (messaging) {
      const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
      
      if (currentToken) {
        console.log('FCM Token:', currentToken);
        
        // Save token to user's document
        const user = auth.currentUser;
        if (user) {
          await saveTokenToDatabase(currentToken, user.uid);
        }
        
        return currentToken;
      }
    }
    
    console.log('No registration token available');
    return null;
  } catch (error) {
    console.error('Error getting notification permission:', error);
    return null;
  }
};

// Save token to Firestore
const saveTokenToDatabase = async (token, userId) => {
  try {
    // Save to user's document
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      fcmToken: token,
      tokenUpdatedAt: Timestamp.now(),
      notificationsEnabled: true
    }, { merge: true });
    
    // Also save to a separate tokens collection for easier querying
    const tokenRef = doc(db, 'fcmTokens', userId);
    await setDoc(tokenRef, {
      token,
      userId,
      updatedAt: Timestamp.now(),
      platform: 'web'
    });
    
    console.log('Token saved to database');
  } catch (error) {
    console.error('Error saving token to database:', error);
  }
};

// Handle foreground messages
export const setupForegroundNotifications = () => {
  if (!messaging) return;
  
  onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    
    // Show custom notification for foreground messages
    if (payload.notification) {
      const { title, body } = payload.notification;
      
      // Only show notification if we have permission
      if (Notification.permission === 'granted') {
        // Use the Notification API directly for foreground notifications
        const notification = new Notification(title, {
          body,
          icon: '/logo192.png',
          data: payload.data
        });
        
        // Handle notification click
        notification.onclick = () => {
          notification.close();
          
          // Navigate based on notification type
          if (payload.data?.type === 'deadline') {
            window.location.href = '/deadlines';
          } else if (payload.data?.type === 'message') {
            window.location.href = '/messaging';
          }
        };
      }
    }
  });
};

// Track notification history to prevent spam
export const recordNotificationSent = async (userId, type, entityId) => {
  try {
    await addDoc(collection(db, 'notificationHistory'), {
      userId,
      type,
      entityId,
      sentAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error recording notification:', error);
  }
};

// Check if we've recently sent a similar notification
export const hasRecentlySentSimilarNotification = async (userId, type, entityId, hoursThreshold = 24) => {
  try {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - hoursThreshold);
    
    const notificationsRef = collection(db, 'notificationHistory');
    const q = query(
      notificationsRef, 
      where('userId', '==', userId),
      where('type', '==', type),
      where('entityId', '==', entityId),
      where('sentAt', '>=', Timestamp.fromDate(threshold))
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking notification history:', error);
    return false;
  }
};

// Disable notifications for a user
export const disableNotifications = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      notificationsEnabled: false
    }, { merge: true });
  } catch (error) {
    console.error('Error disabling notifications:', error);
  }
};

// Enable notifications for a user
export const enableNotifications = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      notificationsEnabled: true
    }, { merge: true });
  } catch (error) {
    console.error('Error enabling notifications:', error);
  }
};

// Check if user has notifications enabled
export const areNotificationsEnabled = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data().notificationsEnabled !== false;
    }
    
    return true; // Default to true if user doc doesn't exist
  } catch (error) {
    console.error('Error checking notification status:', error);
    return true;
  }
};
