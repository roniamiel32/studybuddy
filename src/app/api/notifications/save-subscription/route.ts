import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // בדיקה מי המשתמש המחובר כרגע
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await request.json();
    if (!subscription) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    // שמירת או עדכון המנוי בטבלה שהרצת כרגע
    const { error: dbError } = await supabase
      .from('push_subscriptions' as any)
      .upsert({
        user_id: user.id,
        subscription: subscription,
      }, {
        onConflict: 'user_id, subscription'
      });

    if (dbError) {
      console.error('Database error saving subscription:', dbError);
      return NextResponse.json({ error: 'Failed to save in database' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}