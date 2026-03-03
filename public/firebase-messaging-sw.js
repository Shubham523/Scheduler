// Firebase Service Worker for Background Notifications
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyD3kk6lsdTUtm-FqxXuXXWHzUZlskbm4hk",
  authDomain: "lifesync-73485.firebaseapp.com",
  projectId: "lifesync-73485",
  storageBucket: "lifesync-73485.firebasestorage.app",
  messagingSenderId: "846606800836",
  appId: "1:846606800836:web:3a20fe80eba7826f6a3691"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// This listener triggers the notification when the browser/tab is closed
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
});
// Listen for the user clicking the notification banner
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click Received.');
  
  // 1. Close the notification banner
  event.notification.close();

  // 2. Grab the URL we hid in the Vercel payload
  const targetUrl = event.notification.data?.url || 'https://scheduler-ten-tan.vercel.app';

  // 3. Open the app (or focus the tab if it's already open in the background)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Look for an already open LifeSync tab
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('scheduler-ten-tan') && 'focus' in client) {
          return client.focus();
        }
      }
      // If no tab is open, open a fresh one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});