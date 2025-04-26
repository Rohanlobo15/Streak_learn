// Firebase Cloud Messaging Service Worker

importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.1.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDPwHTBl1cquIIVBXIVyntES7_wyXv4XIw",
  authDomain: "mine-805ba.firebaseapp.com",
  projectId: "mine-805ba",
  storageBucket: "mine-805ba.firebasestorage.app",
  messagingSenderId: "755696512125",
  appId: "1:755696512125:web:2b575ce3d65aa82cae1514"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: payload.data
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click: ', event);
  
  event.notification.close();
  
  // This looks to see if the current is already open and focuses if it is
  event.waitUntil(
    clients.matchAll({
      type: "window"
    })
    .then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('/deadlines') && event.notification.data?.type === 'deadline') {
          return client.focus();
        }
        if (client.url.includes('/messaging') && event.notification.data?.type === 'message') {
          return client.focus();
        }
      }
      
      if (clients.openWindow) {
        if (event.notification.data?.type === 'deadline') {
          return clients.openWindow('/deadlines');
        } else if (event.notification.data?.type === 'message') {
          return clients.openWindow('/messaging');
        } else {
          return clients.openWindow('/');
        }
      }
    })
  );
});
