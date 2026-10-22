-- E-mail de login é exclusivo entre profissionais e administradores, sem diferenciar maiúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS auth_user_email_lower_unique ON public.auth_user(lower(email));
