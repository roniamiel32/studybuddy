import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:test@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // שליפת המנוי של המשתמש מהטבלה
    const { data: subs, error } = await supabase
      .from('push_subscriptions' as any)
      .select('subscription')
      .eq('user_id', user.id);

    if (error || !subs || subs.length === 0) {
      return NextResponse.json({ error: 'No subscription found for user. Did you click the bell button?' }, { status: 404 });
    }

    const payload = JSON.stringify({
      title: 'StudyBuddy - בדיקת התראה',
      body: 'היי! ההתראות עובדות בהצלחה 🔔',
      icon: '/icon.png',
      badge: 1,
    });

    // שליחת הפוש למכשירים הרשומים של המשתמש
    const sendPromises = subs.map((sub: any) => 
      webpush.sendNotification(sub.subscription, payload).catch((err) => {
        console.error('Error sending push to a subscription:', err);
      })
    );

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, message: 'Test push sent!' });
  } catch (error) {
    console.error('Test push error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}