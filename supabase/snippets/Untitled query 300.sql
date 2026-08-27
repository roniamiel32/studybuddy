-- יצירת טבלת מנויי פוש
create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  subscription jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_subscription unique (user_id, subscription)
);

-- הפעלת אבטחת שורות (RLS) כדי שרק המשתמש המחובר יוכל לשמור את המנוי שלו
alter table public.push_subscriptions enable row level security;

-- מדיניות: משתמש יכול להכניס מנוי רק לעצמו
create policy "Users can insert their own push subscription"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

-- מדיניות: משתמש יכול לראות או למחוק רק את המנויים של עצמו
create policy "Users can view and delete their own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);