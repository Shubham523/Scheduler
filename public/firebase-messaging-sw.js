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
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});