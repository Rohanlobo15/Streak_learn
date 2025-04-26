const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Send notification for new messages
exports.sendMessageNotification = functions.firestore
  .document('groupChatMessages/{messageId}')
  .onCreate(async (snapshot, context) => {
    try {
      const messageData = snapshot.data();
      const senderId = messageData.userId;
      
      // Don't send notifications for system messages or if there's no sender
      if (!senderId || messageData.isSystemMessage) {
        return null;
      }
      
      // Get all members except the sender
      const membersSnapshot = await db.collection('groupChatMembers').get();
      const tokens = [];
      const userPromises = [];
      
      membersSnapshot.forEach(doc => {
        // Skip the sender
        if (doc.id === senderId) {
          return;
        }
        
        // Get user's FCM token
        userPromises.push(
          db.collection('fcmTokens').doc(doc.id).get()
            .then(tokenDoc => {
              if (tokenDoc.exists && tokenDoc.data().token) {
                tokens.push(tokenDoc.data().token);
              }
            })
        );
      });
      
      // Wait for all token retrievals
      await Promise.all(userPromises);
      
      if (tokens.length === 0) {
        console.log('No tokens to send to');
        return null;
      }
      
      // Get sender's name
      const senderDoc = await db.collection('groupChatMembers').doc(senderId).get();
      const senderName = senderDoc.exists ? senderDoc.data().name : 'Someone';
      
      // Create notification
      let notificationTitle = `${senderName} sent a message`;
      let notificationBody = messageData.text || 'New message in group chat';
      
      // If it's a file, customize the message
      if (messageData.fileURL) {
        notificationBody = `${senderName} shared a file: ${messageData.fileName || 'File'}`;
      }
      
      // Send notification to all tokens
      const message = {
        notification: {
          title: notificationTitle,
          body: notificationBody
        },
        data: {
          type: 'message',
          messageId: context.params.messageId,
          senderId: senderId,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens: tokens,
        // Avoid notification spam by collapsing similar notifications
        android: {
          notification: {
            tag: 'group_chat'
          }
        },
        apns: {
          payload: {
            aps: {
              'thread-id': 'group_chat'
            }
          }
        }
      };
      
      return messaging.sendMulticast(message);
    } catch (error) {
      console.error('Error sending message notification:', error);
      return null;
    }
  });

// Check deadlines daily and send notifications
exports.checkDeadlinesDaily = functions.pubsub
  .schedule('0 9 * * *') // Run daily at 9:00 AM
  .timeZone('Asia/Kolkata') // Indian Standard Time
  .onRun(async (context) => {
    try {
      // Get all active deadlines
      const deadlinesSnapshot = await db.collection('deadlines')
        .where('completed', '==', false)
        .get();
      
      if (deadlinesSnapshot.empty) {
        console.log('No active deadlines');
        return null;
      }
      
      const now = admin.firestore.Timestamp.now().toDate();
      const notificationPromises = [];
      
      deadlinesSnapshot.forEach(doc => {
        const deadline = doc.data();
        const deadlineDate = deadline.dueDate.toDate();
        
        // Calculate days until deadline
        const timeDiff = deadlineDate.getTime() - now.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        // Send notification if deadline is tomorrow (1 day away)
        // Or if it's within the last week (7 days) - send daily reminders
        if (daysDiff <= 7 && daysDiff >= 0) {
          notificationPromises.push(
            sendDeadlineNotification(doc.id, deadline, daysDiff)
          );
        }
      });
      
      await Promise.all(notificationPromises);
      return null;
    } catch (error) {
      console.error('Error checking deadlines:', error);
      return null;
    }
  });

// Send notification for a specific deadline
async function sendDeadlineNotification(deadlineId, deadline, daysRemaining) {
  try {
    // Get all users with FCM tokens
    const tokensSnapshot = await db.collection('fcmTokens').get();
    const tokens = [];
    
    tokensSnapshot.forEach(doc => {
      if (doc.data().token) {
        tokens.push(doc.data().token);
      }
    });
    
    if (tokens.length === 0) {
      console.log('No tokens to send to');
      return null;
    }
    
    // Create notification message based on days remaining
    let notificationTitle;
    let notificationBody;
    
    if (daysRemaining === 0) {
      notificationTitle = '⚠️ Deadline Today!';
      notificationBody = `"${deadline.title}" is due today!`;
    } else if (daysRemaining === 1) {
      notificationTitle = '⏰ Deadline Tomorrow';
      notificationBody = `"${deadline.title}" is due tomorrow!`;
    } else {
      notificationTitle = '📅 Upcoming Deadline';
      notificationBody = `"${deadline.title}" is due in ${daysRemaining} days.`;
    }
    
    // Send notification to all tokens
    const message = {
      notification: {
        title: notificationTitle,
        body: notificationBody
      },
      data: {
        type: 'deadline',
        deadlineId: deadlineId,
        daysRemaining: daysRemaining.toString(),
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      },
      tokens: tokens,
      // Use a unique tag based on the deadline ID to avoid notification spam
      android: {
        notification: {
          tag: `deadline_${deadlineId}`
        }
      },
      apns: {
        payload: {
          aps: {
            'thread-id': `deadline_${deadlineId}`
          }
        }
      }
    };
    
    return messaging.sendMulticast(message);
  } catch (error) {
    console.error('Error sending deadline notification:', error);
    return null;
  }
}

// Send notification when a new deadline is created
exports.newDeadlineNotification = functions.firestore
  .document('deadlines/{deadlineId}')
  .onCreate(async (snapshot, context) => {
    try {
      const deadlineData = snapshot.data();
      const creatorId = deadlineData.createdBy;
      
      // Get all users with FCM tokens except the creator
      const tokensSnapshot = await db.collection('fcmTokens').get();
      const tokens = [];
      
      tokensSnapshot.forEach(doc => {
        // Skip the creator
        if (doc.id === creatorId) {
          return;
        }
        
        if (doc.data().token) {
          tokens.push(doc.data().token);
        }
      });
      
      if (tokens.length === 0) {
        console.log('No tokens to send to');
        return null;
      }
      
      // Get creator's name
      let creatorName = 'Someone';
      const creatorDoc = await db.collection('groupChatMembers').doc(creatorId).get();
      if (creatorDoc.exists) {
        creatorName = creatorDoc.data().name;
      }
      
      // Format the due date
      const dueDate = deadlineData.dueDate.toDate();
      const formattedDate = dueDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      // Create notification
      const notificationTitle = 'New Deadline Added';
      const notificationBody = `${creatorName} added: "${deadlineData.title}" due on ${formattedDate}`;
      
      // Send notification to all tokens
      const message = {
        notification: {
          title: notificationTitle,
          body: notificationBody
        },
        data: {
          type: 'deadline',
          deadlineId: context.params.deadlineId,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens: tokens
      };
      
      return messaging.sendMulticast(message);
    } catch (error) {
      console.error('Error sending new deadline notification:', error);
      return null;
    }
  });
