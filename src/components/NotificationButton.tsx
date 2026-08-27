'use client';

import { useState } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationButton() {
  const [status, setStatus] = useState('');

  const subscribeToPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('הדפדפן שלך לא תומך בהתראות פוש');
        return;
      }

      // רישום ה-Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // בקשת הרשאה מהמשתמש
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('המשתמש דחה את אישור ההתראות');
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');
        return;
      }

      // יצירת מנוי פוש מול הדפדפן
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // שליחת המנוי ל-API שהגדרנו בשרת
      const response = await fetch('/api/notifications/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      if (response.ok) {
        setStatus('נרשמת בהצלחה להתראות! 🔔');
      } else {
        setStatus('שגיאה בשמירת המנוי בשרת');
      }
    } catch (error) {
      console.error('Error subscribing to push:', error);
      setStatus('שגיאה ברישום להתראות');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={subscribeToPush}
        className="p-3 rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition"
        title="הפעל התראות"
      >
        🔔
      </button>
      {status && <span className="text-xs text-gray-600">{status}</span>}
    </div>
  );
}