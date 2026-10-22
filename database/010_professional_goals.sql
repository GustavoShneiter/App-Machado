-- A preferência é individual; ocultar metas preserva os valores configurados.
ALTER TABLE public.professional_preferences
 ADD COLUMN IF NOT EXISTS show_goals boolean NOT NULL DEFAULT true;
