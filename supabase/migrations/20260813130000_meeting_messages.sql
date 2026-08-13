CREATE TABLE public.hidden_messages (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (profile_id, message_id)
);

-- חוק אבטחה (RLS): כל משתמש יכול לראות ולנהל רק את ההסתרות של עצמו
ALTER TABLE public.hidden_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own hidden messages" 
ON public.hidden_messages 
FOR ALL 
USING (auth.uid() = profile_id);