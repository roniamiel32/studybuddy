'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

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

export function EnablePushNotifications() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Your browser does not support push notifications.');
      return;
    }

    try {
      setLoading(true);
      const permissionResult = await window.Notification.requestPermission();
      if (permissionResult !== 'granted') {
        alert('Please enable notifications in your browser settings.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicVapidKey) {
        console.error('Missing VAPID public key');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });

      // שליחת המנוי לשרת/למסד הנתונים
      await fetch('/api/notifications/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      alert('Notifications enabled successfully! You will now receive updates.');
    } catch (error) {
      console.error('Error subscribing:', error);
      alert('An error occurred while subscribing to notifications.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      <Bell className="size-4 shrink-0" />
      {loading ? 'Activating...' : 'Enable Push Notifications'}
    </button>
  );
}