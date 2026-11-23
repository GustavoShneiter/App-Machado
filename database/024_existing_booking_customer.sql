-- Reuse an explicit unit-scoped customer ID, including records without a valid
-- WhatsApp, rather than guessing identity from a shared phone number.
DO $$ DECLARE signature regprocedure; definition text; original text; block text; BEGIN
 FOR signature IN SELECT unnest(ARRAY['public.create_office_appointment(jsonb)'::regprocedure,'public.professional_create_appointment(jsonb)'::regprocedure]) LOOP
  definition:=pg_get_functiondef(signature);original:=definition;
  block:=substring(definition FROM 'customer_name:=trim\(payload->>''name''\);[\s\S]*?THEN RAISE EXCEPTION ''Nome e telefone válidos são obrigatórios\.''; END IF;');
  IF block IS NULL THEN RAISE EXCEPTION 'Unexpected customer validation in %',signature; END IF;
  definition:=replace(definition,block,
   'IF nullif(payload->>''customer_id'','''') IS NOT NULL THEN
    SELECT c.id,c.name,regexp_replace(c.phone,''\D'','''',''g'') INTO customer_uuid,customer_name,clean_phone
      FROM public.customers c WHERE c.id=(payload->>''customer_id'')::uuid;
    IF customer_uuid IS NULL THEN RAISE EXCEPTION ''Cliente não encontrado nesta unidade. Atualize a busca.'' USING ERRCODE=''42501''; END IF;
   ELSE '||block||' END IF;');
  block:=substring(definition FROM 'SELECT c.id INTO customer_uuid FROM public.customers c[\s\S]*?IF customer_uuid IS NULL THEN INSERT INTO public.customers[\s\S]*?END IF;');
  IF block IS NULL THEN RAISE EXCEPTION 'Unexpected customer lookup in %',signature; END IF;
  definition:=replace(definition,block,'IF customer_uuid IS NULL THEN '||block||' END IF;');
  IF definition=original THEN RAISE EXCEPTION 'Customer selection was not applied'; END IF;
  EXECUTE definition;
 END LOOP;
END $$;
