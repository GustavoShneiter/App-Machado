-- Baseline extraída do sistema Machado em 20/10/2026; sem dados ou credenciais.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
SET check_function_bodies = false;
CREATE TYPE public."appointment_status" AS ENUM ('scheduled','confirmed','arrived','in_service','completed','cancelled','no_show');
CREATE TYPE public."command_status" AS ENUM ('open','awaiting_payment','closed','voided','refunded');
CREATE TYPE public."commission_status" AS ENUM ('forecast','pending','paid','reversed');
CREATE TYPE public."user_role" AS ENUM ('owner','admin','professional');
CREATE TABLE public."cash_movements" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "session_id" uuid NOT NULL,
 "type" text NOT NULL,
 "amount_cents" integer NOT NULL,
 "payment_method" text,
 "notes" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_by" uuid,
 "command_id" uuid,
 "commission_entry_id" uuid,
 "package_sale_id" uuid
);
CREATE TABLE public."commission_entries" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "command_item_id" uuid NOT NULL,
 "professional_id" uuid NOT NULL,
 "gross_cents" integer NOT NULL,
 "commission_cents" integer NOT NULL,
 "rule_snapshot" jsonb NOT NULL,
 "status" commission_status DEFAULT 'forecast'::commission_status NOT NULL,
 "paid_at" timestamp with time zone,
 "reversed_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "paid_method" text
);
CREATE TABLE public."professionals" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "profile_id" uuid,
 "name" text NOT NULL,
 "phone" text,
 "specialties" text,
 "active" boolean DEFAULT true NOT NULL,
 "default_commission_percent" numeric(5,2),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "photo_url" text,
 "default_product_commission_percent" numeric(5,2)
);
CREATE TABLE public."profiles" (
 "id" uuid NOT NULL,
 "name" text NOT NULL,
 "role" user_role DEFAULT 'professional'::user_role NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."customers" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "phone" text NOT NULL,
 "email" text,
 "birth_date" date,
 "notes" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_by" uuid
);
CREATE TABLE public."services" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "price_cents" integer NOT NULL,
 "duration_minutes" integer NOT NULL,
 "color" text,
 "active" boolean DEFAULT true NOT NULL,
 "default_commission_percent" numeric(5,2) DEFAULT 50,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."appointments" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "customer_id" uuid NOT NULL,
 "professional_id" uuid NOT NULL,
 "service_id" uuid NOT NULL,
 "starts_at" timestamp with time zone NOT NULL,
 "ends_at" timestamp with time zone NOT NULL,
 "expected_price_cents" integer NOT NULL,
 "status" appointment_status DEFAULT 'scheduled'::appointment_status NOT NULL,
 "source" text DEFAULT 'panel'::text NOT NULL,
 "notes" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_by" uuid
);
CREATE TABLE public."commands" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "appointment_id" uuid,
 "customer_id" uuid,
 "status" command_status DEFAULT 'open'::command_status NOT NULL,
 "discount_cents" integer DEFAULT 0 NOT NULL,
 "surcharge_cents" integer DEFAULT 0 NOT NULL,
 "notes" text,
 "opened_by" uuid,
 "closed_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."command_items" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "command_id" uuid NOT NULL,
 "type" text NOT NULL,
 "service_id" uuid,
 "product_id" uuid,
 "professional_id" uuid,
 "description" text NOT NULL,
 "unit_price_cents" integer NOT NULL,
 "quantity" integer DEFAULT 1 NOT NULL,
 "commission_kind" text,
 "commission_value" numeric(10,2),
 "commission_cents" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public."payments" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "command_id" uuid NOT NULL,
 "method" text NOT NULL,
 "amount_cents" integer NOT NULL,
 "paid_at" timestamp with time zone DEFAULT now() NOT NULL,
 "recorded_by" uuid,
 "reversed_at" timestamp with time zone
);
CREATE TABLE public."stock_movements" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "product_id" uuid NOT NULL,
 "type" text NOT NULL,
 "quantity_delta" integer NOT NULL,
 "reference_id" uuid,
 "reason" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_by" uuid
);
CREATE TABLE public."cash_sessions" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "opened_by" uuid,
 "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
 "opening_balance_cents" integer DEFAULT 0 NOT NULL,
 "closed_at" timestamp with time zone,
 "declared_balance_cents" integer,
 "notes" text
);
CREATE TABLE public."notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "profile_id" uuid,
 "title" text NOT NULL,
 "body" text NOT NULL,
 "read_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."products" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "category" text,
 "internal_code" text,
 "barcode" text,
 "cost_cents" integer,
 "sale_price_cents" integer NOT NULL,
 "quantity" integer DEFAULT 0 NOT NULL,
 "minimum_quantity" integer DEFAULT 0 NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "commission_percent" numeric(5,2) DEFAULT 20,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "photo_url" text
);
CREATE TABLE public."audit_logs" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "actor_profile_id" uuid,
 "integration_id" text,
 "operation" text NOT NULL,
 "entity_type" text,
 "entity_id" uuid,
 "request_summary" jsonb,
 "result" text NOT NULL,
 "error_code" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."agent_integrations" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "token_hash" text NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "rate_limit_per_minute" integer DEFAULT 30 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."agent_rate_buckets" (
 "integration_id" uuid NOT NULL,
 "bucket_start" timestamp with time zone NOT NULL,
 "request_count" integer DEFAULT 0 NOT NULL
);
CREATE TABLE public."professional_services" (
 "professional_id" uuid NOT NULL,
 "service_id" uuid NOT NULL,
 "commission_percent" numeric(5,2)
);
CREATE TABLE public."business_hours" (
 "weekday" smallint NOT NULL,
 "opens_at" time without time zone NOT NULL,
 "closes_at" time without time zone NOT NULL
);
CREATE TABLE public."service_package_items" (
 "package_id" uuid NOT NULL,
 "service_id" uuid NOT NULL,
 "quantity" integer NOT NULL
);
CREATE TABLE public."package_sales" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "package_id" uuid NOT NULL,
 "customer_id" uuid NOT NULL,
 "amount_cents" integer NOT NULL,
 "method" text NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "sold_at" timestamp with time zone DEFAULT now() NOT NULL,
 "sold_by" uuid
);
CREATE TABLE public."package_sale_balances" (
 "sale_id" uuid NOT NULL,
 "service_id" uuid NOT NULL,
 "total" integer NOT NULL,
 "remaining" integer NOT NULL
);
CREATE TABLE public."business_settings" (
 "id" boolean DEFAULT true NOT NULL,
 "name" text DEFAULT 'Machado Barbearia'::text NOT NULL,
 "legal_name" text,
 "email" text,
 "phone" text,
 "postal_code" text,
 "street" text,
 "city" text,
 "state" text,
 "instagram" text,
 "website" text,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."schedule_blocks" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "professional_id" uuid NOT NULL,
 "starts_at" timestamp with time zone NOT NULL,
 "ends_at" timestamp with time zone NOT NULL,
 "reason" text DEFAULT 'Agenda bloqueada'::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "created_by" uuid
);
CREATE TABLE public."service_packages" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "price_cents" integer NOT NULL,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."package_redemptions" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "sale_id" uuid NOT NULL,
 "service_id" uuid NOT NULL,
 "command_item_id" uuid NOT NULL,
 "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
 "redeemed_by" uuid
);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."customers" ADD CONSTRAINT "customers_name_check" CHECK ((char_length(name) >= 2));
ALTER TABLE public."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
ALTER TABLE public."customers" ADD CONSTRAINT "customers_phone_key" UNIQUE (phone);
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_default_commission_percent_check" CHECK (((default_commission_percent >= (0)::numeric) AND (default_commission_percent <= (100)::numeric)));
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_pkey" PRIMARY KEY (id);
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_profile_id_key" UNIQUE (profile_id);
ALTER TABLE public."services" ADD CONSTRAINT "services_price_cents_check" CHECK ((price_cents >= 0));
ALTER TABLE public."services" ADD CONSTRAINT "services_duration_minutes_check" CHECK (((duration_minutes >= 5) AND (duration_minutes <= 480)));
ALTER TABLE public."services" ADD CONSTRAINT "services_default_commission_percent_check" CHECK (((default_commission_percent >= (0)::numeric) AND (default_commission_percent <= (100)::numeric)));
ALTER TABLE public."services" ADD CONSTRAINT "services_pkey" PRIMARY KEY (id);
ALTER TABLE public."professional_services" ADD CONSTRAINT "professional_services_commission_percent_check" CHECK (((commission_percent >= (0)::numeric) AND (commission_percent <= (100)::numeric)));
ALTER TABLE public."professional_services" ADD CONSTRAINT "professional_services_pkey" PRIMARY KEY (professional_id, service_id);
ALTER TABLE public."products" ADD CONSTRAINT "products_cost_cents_check" CHECK ((cost_cents >= 0));
ALTER TABLE public."products" ADD CONSTRAINT "products_sale_price_cents_check" CHECK ((sale_price_cents >= 0));
ALTER TABLE public."products" ADD CONSTRAINT "products_minimum_quantity_check" CHECK ((minimum_quantity >= 0));
ALTER TABLE public."products" ADD CONSTRAINT "products_commission_percent_check" CHECK (((commission_percent >= (0)::numeric) AND (commission_percent <= (100)::numeric)));
ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE public."products" ADD CONSTRAINT "products_internal_code_key" UNIQUE (internal_code);
ALTER TABLE public."products" ADD CONSTRAINT "products_barcode_key" UNIQUE (barcode);
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_expected_price_cents_check" CHECK ((expected_price_cents >= 0));
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_check" CHECK ((ends_at > starts_at));
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_pkey" PRIMARY KEY (id);
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_professional_id_tstzrange_excl" EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status <> ALL (ARRAY['cancelled'::appointment_status, 'no_show'::appointment_status])));
ALTER TABLE public."commands" ADD CONSTRAINT "commands_discount_cents_check" CHECK ((discount_cents >= 0));
ALTER TABLE public."commands" ADD CONSTRAINT "commands_surcharge_cents_check" CHECK ((surcharge_cents >= 0));
ALTER TABLE public."commands" ADD CONSTRAINT "commands_pkey" PRIMARY KEY (id);
ALTER TABLE public."commands" ADD CONSTRAINT "commands_appointment_id_key" UNIQUE (appointment_id);
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_type_check" CHECK ((type = ANY (ARRAY['service'::text, 'product'::text])));
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_unit_price_cents_check" CHECK ((unit_price_cents >= 0));
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_commission_kind_check" CHECK ((commission_kind = ANY (ARRAY['percent'::text, 'fixed'::text])));
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_check" CHECK (((((service_id IS NOT NULL))::integer + ((product_id IS NOT NULL))::integer) = 1));
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."payments" ADD CONSTRAINT "payments_method_check" CHECK ((method = ANY (ARRAY['cash'::text, 'pix'::text, 'debit'::text, 'credit'::text, 'other'::text])));
ALTER TABLE public."payments" ADD CONSTRAINT "payments_amount_cents_check" CHECK ((amount_cents > 0));
ALTER TABLE public."payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_type_check" CHECK ((type = ANY (ARRAY['entry'::text, 'sale'::text, 'adjustment'::text, 'loss'::text, 'return'::text])));
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."cash_sessions" ADD CONSTRAINT "cash_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_type_check" CHECK ((type = ANY (ARRAY['sale'::text, 'expense'::text, 'withdrawal'::text, 'reinforcement'::text, 'refund'::text])));
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_pkey" PRIMARY KEY (id);
ALTER TABLE public."commission_entries" ADD CONSTRAINT "commission_entries_pkey" PRIMARY KEY (id);
ALTER TABLE public."commission_entries" ADD CONSTRAINT "commission_entries_command_item_id_key" UNIQUE (command_item_id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."agent_integrations" ADD CONSTRAINT "agent_integrations_rate_limit_per_minute_check" CHECK (((rate_limit_per_minute >= 1) AND (rate_limit_per_minute <= 300)));
ALTER TABLE public."agent_integrations" ADD CONSTRAINT "agent_integrations_pkey" PRIMARY KEY (id);
ALTER TABLE public."agent_integrations" ADD CONSTRAINT "agent_integrations_name_key" UNIQUE (name);
ALTER TABLE public."agent_integrations" ADD CONSTRAINT "agent_integrations_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."agent_rate_buckets" ADD CONSTRAINT "agent_rate_buckets_request_count_check" CHECK ((request_count >= 0));
ALTER TABLE public."agent_rate_buckets" ADD CONSTRAINT "agent_rate_buckets_pkey" PRIMARY KEY (integration_id, bucket_start);
ALTER TABLE public."business_hours" ADD CONSTRAINT "business_hours_weekday_check" CHECK (((weekday >= 1) AND (weekday <= 7)));
ALTER TABLE public."business_hours" ADD CONSTRAINT "business_hours_check" CHECK ((closes_at > opens_at));
ALTER TABLE public."business_hours" ADD CONSTRAINT "business_hours_pkey" PRIMARY KEY (weekday, opens_at);
ALTER TABLE public."service_packages" ADD CONSTRAINT "service_packages_name_check" CHECK ((char_length(name) >= 2));
ALTER TABLE public."service_packages" ADD CONSTRAINT "service_packages_price_cents_check" CHECK ((price_cents > 0));
ALTER TABLE public."service_packages" ADD CONSTRAINT "service_packages_pkey" PRIMARY KEY (id);
ALTER TABLE public."service_package_items" ADD CONSTRAINT "service_package_items_quantity_check" CHECK ((quantity > 0));
ALTER TABLE public."service_package_items" ADD CONSTRAINT "service_package_items_pkey" PRIMARY KEY (package_id, service_id);
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_amount_cents_check" CHECK ((amount_cents > 0));
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_method_check" CHECK ((method = ANY (ARRAY['cash'::text, 'pix'::text, 'debit'::text, 'credit'::text, 'other'::text])));
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_pkey" PRIMARY KEY (id);
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_total_check" CHECK ((total > 0));
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_remaining_check" CHECK ((remaining >= 0));
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_check" CHECK ((remaining <= total));
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_pkey" PRIMARY KEY (sale_id, service_id);
ALTER TABLE public."business_settings" ADD CONSTRAINT "business_settings_id_check" CHECK (id);
ALTER TABLE public."business_settings" ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."schedule_blocks" ADD CONSTRAINT "schedule_blocks_check" CHECK ((ends_at > starts_at));
ALTER TABLE public."schedule_blocks" ADD CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY (id);
ALTER TABLE public."schedule_blocks" ADD CONSTRAINT "schedule_blocks_no_overlap" EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&);
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_command_item_id_key" UNIQUE (command_item_id);
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_default_product_commission_percent_check" CHECK (((default_product_commission_percent >= (0)::numeric) AND (default_product_commission_percent <= (100)::numeric)));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."professional_services" ADD CONSTRAINT "professional_services_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."commands" ADD CONSTRAINT "commands_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."professionals" ADD CONSTRAINT "professionals_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."professional_services" ADD CONSTRAINT "professional_services_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES professionals(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."appointments" ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."commands" ADD CONSTRAINT "commands_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."commands" ADD CONSTRAINT "commands_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_command_id_fkey" FOREIGN KEY (command_id) REFERENCES commands(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."command_items" ADD CONSTRAINT "command_items_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES professionals(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."payments" ADD CONSTRAINT "payments_command_id_fkey" FOREIGN KEY (command_id) REFERENCES commands(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_fkey" FOREIGN KEY (opened_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_session_id_fkey" FOREIGN KEY (session_id) REFERENCES cash_sessions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."commission_entries" ADD CONSTRAINT "commission_entries_command_item_id_fkey" FOREIGN KEY (command_item_id) REFERENCES command_items(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."commission_entries" ADD CONSTRAINT "commission_entries_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES professionals(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_actor_profile_id_fkey" FOREIGN KEY (actor_profile_id) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."agent_rate_buckets" ADD CONSTRAINT "agent_rate_buckets_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES agent_integrations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_command_id_fkey" FOREIGN KEY (command_id) REFERENCES commands(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_commission_entry_id_fkey" FOREIGN KEY (commission_entry_id) REFERENCES commission_entries(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."service_package_items" ADD CONSTRAINT "service_package_items_package_id_fkey" FOREIGN KEY (package_id) REFERENCES service_packages(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."service_package_items" ADD CONSTRAINT "service_package_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_package_id_fkey" FOREIGN KEY (package_id) REFERENCES service_packages(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_sales" ADD CONSTRAINT "package_sales_sold_by_fkey" FOREIGN KEY (sold_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES package_sales(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_sale_balances" ADD CONSTRAINT "package_sale_balances_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."cash_movements" ADD CONSTRAINT "cash_movements_package_sale_id_fkey" FOREIGN KEY (package_sale_id) REFERENCES package_sales(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."schedule_blocks" ADD CONSTRAINT "schedule_blocks_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."schedule_blocks" ADD CONSTRAINT "schedule_blocks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES package_sales(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_service_id_fkey" FOREIGN KEY (service_id) REFERENCES services(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_command_item_id_fkey" FOREIGN KEY (command_item_id) REFERENCES command_items(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public."package_redemptions" ADD CONSTRAINT "package_redemptions_redeemed_by_fkey" FOREIGN KEY (redeemed_by) REFERENCES profiles(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX cash_sale_package_unique ON public.cash_movements USING btree (package_sale_id) WHERE (package_sale_id IS NOT NULL);
CREATE INDEX package_redemptions_sale_idx ON public.package_redemptions USING btree (sale_id, redeemed_at);
CREATE INDEX appointments_customer_idx ON public.appointments USING btree (customer_id);
CREATE INDEX schedule_blocks_professional_period_idx ON public.schedule_blocks USING btree (professional_id, starts_at, ends_at);
CREATE UNIQUE INDEX cash_commission_entry_unique ON public.cash_movements USING btree (commission_entry_id) WHERE (commission_entry_id IS NOT NULL);
CREATE INDEX appointments_start_idx ON public.appointments USING btree (starts_at);
CREATE UNIQUE INDEX cash_sale_command_unique ON public.cash_movements USING btree (command_id) WHERE (command_id IS NOT NULL);
CREATE OR REPLACE FUNCTION public.guard_completed_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status='completed' and (new.status<>old.status or new.expected_price_cents<>old.expected_price_cents or new.professional_id<>old.professional_id or new.service_id<>old.service_id) then
    raise exception 'Atendimento concluído não pode ser alterado. É necessário um estorno financeiro.';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.require_office()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.can_access_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.delete_appointment_record(appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.appointments a where a.id=delete_appointment_record.appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  select c.id into command_uuid from public.commands c where c.appointment_id=delete_appointment_record.appointment_id;
  if command_uuid is not null then perform public.delete_command_record(command_uuid); end if;
  delete from public.appointments a where a.id=delete_appointment_record.appointment_id;
  return jsonb_build_object('id',delete_appointment_record.appointment_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.add_product_to_command(command_id uuid, product_id uuid, item_quantity integer, professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; product_row public.products%rowtype; professional_row public.professionals%rowtype; item_uuid uuid; rate numeric; commission integer;
begin
  perform public.require_office();
  if item_quantity is null or item_quantity<1 then raise exception 'Informe uma quantidade válida.'; end if;
  select * into strict command_row from public.commands c where c.id=add_product_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos produtos.'; end if;
  select * into strict product_row from public.products p where p.id=add_product_to_command.product_id and p.active for update;
  select * into strict professional_row from public.professionals p where p.id=add_product_to_command.professional_id and p.active;
  if product_row.quantity<item_quantity then raise exception 'Estoque insuficiente para este produto.'; end if;
  rate:=coalesce(professional_row.default_product_commission_percent,product_row.commission_percent,20);
  commission:=round(product_row.sale_price_cents*rate/100.0);
  select i.id into item_uuid from public.command_items i where i.command_id=command_row.id and i.product_id=product_row.id and i.professional_id=professional_row.id for update;
  if item_uuid is null then
    insert into public.command_items(command_id,type,product_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      values(command_row.id,'product',product_row.id,professional_row.id,product_row.name,product_row.sale_price_cents,item_quantity,'percent',rate,commission) returning id into item_uuid;
  else
    update public.command_items i set quantity=i.quantity+item_quantity,commission_cents=commission*(i.quantity+item_quantity),commission_value=rate where i.id=item_uuid;
  end if;
  update public.products p set quantity=p.quantity-item_quantity where p.id=product_row.id;
  insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by) values(product_row.id,'sale',-item_quantity,command_row.id,'Adicionado à comanda',auth.uid());
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) select i.id,professional_row.id,i.unit_price_cents*i.quantity,i.commission_cents,jsonb_build_object('rate_percent',rate,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type','product'),'pending' from public.command_items i where i.id=item_uuid on conflict(command_item_id) do update set gross_cents=excluded.gross_cents,commission_cents=excluded.commission_cents,rule_snapshot=excluded.rule_snapshot;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.complete_appointment(appointment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.appointments%rowtype;
begin
  perform public.require_office();
  select * into strict a from public.appointments where id=$1 for update;
  if a.status in ('cancelled','no_show') then raise exception 'Atendimento cancelado ou ausente não pode gerar receita.'; end if;
  if a.expected_price_cents<=0 then raise exception 'Informe o valor combinado na comanda antes de concluir o atendimento.'; end if;
  if a.status<>'completed' then update public.appointments set status='completed' where id=a.id; end if;
  perform public.sync_appointment_command(a.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.save_customer_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare customer_uuid uuid; clean_name text; clean_phone text; birth_value date;
begin
  perform public.require_office();
  customer_uuid := nullif(payload->>'id','')::uuid;
  clean_name := trim(payload->>'name');
  clean_phone := regexp_replace(payload->>'phone','\D','','g');
  birth_value := nullif(payload->>'birth_date','')::date;
  if length(coalesce(clean_name,''))<2 or length(coalesce(clean_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
  if customer_uuid is null then
    insert into public.customers(name,phone,email,birth_date,notes,created_by)
      values(clean_name,clean_phone,nullif(trim(payload->>'email'),''),birth_value,nullif(trim(payload->>'notes'),''),auth.uid()) returning id into customer_uuid;
  else
    update public.customers set name=clean_name,phone=clean_phone,email=nullif(trim(payload->>'email'),''),birth_date=birth_value,notes=nullif(trim(payload->>'notes'),'') where id=customer_uuid;
  end if;
  return jsonb_build_object('id',customer_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public."current_role"()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.profiles where id = auth.uid() $function$
;
CREATE OR REPLACE FUNCTION public.delete_customer_record(customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_uuid uuid; sale_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.customers c where c.id=delete_customer_record.customer_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  for command_uuid in select c.id from public.commands c where c.customer_id=delete_customer_record.customer_id loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.appointments a where a.customer_id=delete_customer_record.customer_id;
  for sale_uuid in select ps.id from public.package_sales ps where ps.customer_id=delete_customer_record.customer_id loop
    delete from public.cash_movements m where m.package_sale_id=sale_uuid;
    delete from public.package_redemptions r where r.sale_id=sale_uuid;
    delete from public.package_sales ps where ps.id=sale_uuid;
  end loop;
  delete from public.customers c where c.id=delete_customer_record.customer_id;
  return jsonb_build_object('id',delete_customer_record.customer_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.create_public_appointment(customer_name text, customer_phone text, chosen_service uuid, chosen_professional uuid, start_time timestamp with time zone, terms_accepted boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare customer_uuid uuid; appointment_uuid uuid; duration integer; price integer; local_start timestamp;
begin
  if not terms_accepted then raise exception 'terms_not_accepted' using errcode = '22023'; end if;
  local_start := start_time at time zone 'America/Sao_Paulo';
  if not exists (
    select 1 from public.public_available_slots(chosen_service, local_start::date, chosen_professional)
    where slot_time = local_start::time
  ) then raise exception 'slot_not_available' using errcode = '22023'; end if;
  select duration_minutes, price_cents into duration, price from public.services where id = chosen_service and active;
  select id into customer_uuid from public.customers where phone = customer_phone;
  if customer_uuid is null then
    insert into public.customers(name, phone) values (customer_name, customer_phone) returning id into customer_uuid;
  else
    update public.customers set name = customer_name where id = customer_uuid;
  end if;
  insert into public.appointments(customer_id, professional_id, service_id, starts_at, ends_at, expected_price_cents, source)
  values (customer_uuid, chosen_professional, chosen_service, start_time, start_time + make_interval(mins => duration), price, 'instagram')
  returning id into appointment_uuid;
  insert into public.notifications(title, body) values ('Novo agendamento online', customer_name || ' agendou pelo link público.');
  return appointment_uuid;
end $function$
;
CREATE OR REPLACE FUNCTION public.appointment_command_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('cancelled','no_show') then
    update public.commands set status='voided' where appointment_id=new.id and status in ('open','awaiting_payment');
  else
    perform public.sync_appointment_command(new.id);
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.sell_service_package(package_id uuid, customer_id uuid, payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare package_row public.service_packages%rowtype; cash_row public.cash_sessions%rowtype; sale_uuid uuid;
begin
  perform public.require_office();
  if payment_method not in ('cash','pix','debit','credit','other') then raise exception 'Forma de pagamento inválida.'; end if;
  select * into strict cash_row from public.cash_sessions where closed_at is null order by opened_at desc limit 1 for update;
  select * into strict package_row from public.service_packages where id=package_id and active for update;
  if not exists(select 1 from public.customers where id=customer_id) then raise exception 'Cliente não encontrado.'; end if;
  insert into public.package_sales(package_id,customer_id,amount_cents,method,sold_by)
    values(package_row.id,customer_id,package_row.price_cents,payment_method,auth.uid()) returning id into sale_uuid;
  insert into public.package_sale_balances(sale_id,service_id,total,remaining)
    select sale_uuid,service_id,quantity,quantity from public.service_package_items where package_id=package_row.id;
  if not found then raise exception 'Este pacote não possui serviços.'; end if;
  insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,package_sale_id)
    values(cash_row.id,'sale',package_row.price_cents,payment_method,'Venda de pacote',auth.uid(),sale_uuid);
  return jsonb_build_object('id',sale_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.close_package_command(command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; total integer;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=close_package_command.command_id for update;
  if command_row.status='closed' then return jsonb_build_object('id',command_row.id); end if;
  if command_row.status<>'awaiting_payment' then raise exception 'Finalize o atendimento antes de concluir a comanda.'; end if;
  if not exists(select 1 from public.package_redemptions r join public.command_items i on i.id=r.command_item_id where i.command_id=command_row.id) then raise exception 'Esta comanda não possui sessão de plano aplicada.'; end if;
  select coalesce(sum(i.unit_price_cents*i.quantity),0)-command_row.discount_cents+command_row.surcharge_cents into total from public.command_items i where i.command_id=command_row.id;
  if total<>0 then raise exception 'Ainda existem itens para receber nesta comanda.'; end if;
  update public.commands c set status='closed',closed_at=now() where c.id=command_row.id;
  return jsonb_build_object('id',command_row.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_service_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare service_uuid uuid; rate numeric(5,2);
begin
  perform public.require_office();
  service_uuid:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do serviço.'; end if;
  if coalesce((payload->>'price')::integer,-1)<0 then raise exception 'Informe um valor válido.'; end if;
  if coalesce((payload->>'duration')::integer,0)<5 then raise exception 'A duração mínima é de cinco minutos.'; end if;
  rate:=coalesce((payload->>'commission')::numeric,50);
  if rate<0 or rate>100 then raise exception 'A comissão deve estar entre zero e cem por cento.'; end if;
  if service_uuid is null then
    insert into public.services(name,description,price_cents,duration_minutes,color,active,default_commission_percent)
      values(trim(payload->>'name'),nullif(trim(payload->>'description'),''),(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(nullif(payload->>'color',''),'#203F20'),coalesce((payload->>'active')::boolean,true),rate)
      returning id into service_uuid;
  else
    update public.services s set name=trim(payload->>'name'),description=nullif(trim(payload->>'description'),''),price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,color=coalesce(nullif(payload->>'color',''),s.color),active=coalesce((payload->>'active')::boolean,true),default_commission_percent=rate where s.id=service_uuid;
    if not found then raise exception 'Serviço não encontrado.'; end if;
  end if;
  insert into public.professional_services(professional_id,service_id,commission_percent)
    select p.id,service_uuid,null from public.professionals p
    on conflict(professional_id,service_id) do update set commission_percent=null;
  return jsonb_build_object('id',service_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.public_available_slots(chosen_service uuid, booking_day date, preferred_professional uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_time time without time zone, professional_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with selected_service as (
    select duration_minutes from public.services where id = chosen_service and active
  ), candidates as (
    select candidate::time as slot_time, candidate as local_start, selected_service.duration_minutes
    from public.business_hours h cross join selected_service,
      lateral generate_series(
        (booking_day + h.opens_at)::timestamp,
        (booking_day + h.closes_at)::timestamp - make_interval(mins => selected_service.duration_minutes),
        interval '30 minutes'
      ) candidate
    where h.weekday = extract(isodow from booking_day)
      and candidate >= (now() at time zone 'America/Sao_Paulo') + interval '5 minutes'
  )
  select c.slot_time, p.id
  from candidates c
  join public.professionals p on p.active and (preferred_professional is null or p.id = preferred_professional)
  join public.professional_services ps on ps.professional_id = p.id and ps.service_id = chosen_service
  where not exists (
    select 1 from public.appointments a
    where a.professional_id = p.id
      and a.status not in ('cancelled', 'no_show')
      and a.starts_at < ((c.local_start + make_interval(mins => c.duration_minutes)) at time zone 'America/Sao_Paulo')
      and a.ends_at > (c.local_start at time zone 'America/Sao_Paulo')
  )
  order by c.slot_time, p.id;
$function$
;
CREATE OR REPLACE FUNCTION public.remove_command_item(command_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare item_row public.command_items%rowtype; command_row public.commands%rowtype;
begin
  perform public.require_office();
  select * into strict item_row from public.command_items where id=command_item_id for update;
  select * into strict command_row from public.commands where id=item_row.command_id for update;
  if command_row.status <> 'open' or command_row.appointment_id is not null then
    raise exception 'Itens só podem ser removidos de comandas de balcão em aberto.';
  end if;
  if item_row.product_id is not null then
    update public.products set quantity=quantity+item_row.quantity where id=item_row.product_id;
    insert into public.stock_movements(product_id,type,quantity_delta,reference_id,reason,created_by)
      values(item_row.product_id,'return',item_row.quantity,command_row.id,'Removido da comanda',auth.uid());
  end if;
  delete from public.commission_entries where command_item_id=item_row.id;
  delete from public.command_items where id=item_row.id;
  return jsonb_build_object('id',item_row.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_business_settings(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.require_office();
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome da empresa.'; end if;
  insert into public.business_settings(id,name,legal_name,email,phone,postal_code,street,city,state,instagram,website,updated_at)
    values(true,trim(payload->>'name'),nullif(trim(payload->>'legal_name'),''),nullif(trim(payload->>'email'),''),nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'postal_code'),''),nullif(trim(payload->>'street'),''),nullif(trim(payload->>'city'),''),nullif(trim(payload->>'state'),''),nullif(trim(payload->>'instagram'),''),nullif(trim(payload->>'website'),''),now())
  on conflict(id) do update set name=excluded.name,legal_name=excluded.legal_name,email=excluded.email,phone=excluded.phone,postal_code=excluded.postal_code,street=excluded.street,city=excluded.city,state=excluded.state,instagram=excluded.instagram,website=excluded.website,updated_at=now();
  return jsonb_build_object('id',true);
end; $function$
;
CREATE OR REPLACE FUNCTION public.office_action(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; c public.commands%rowtype; a public.appointments%rowtype; s public.cash_sessions%rowtype;
  item record; total integer; amount integer; balance integer; method text; target public.appointment_status;
  customer_uuid uuid; pro_uuid uuid; service_row public.services%rowtype; customer_name text; v_phone text; start_at timestamptz;
begin
  perform public.require_office();
  v_id := nullif(payload->>'id','')::uuid;
  method := coalesce(payload->>'method','cash');
  if action in ('receive','pay_commissions','move_cash') then
    if method not in ('cash','pix','debit','credit','other') then raise exception 'Forma de pagamento inválida.'; end if;
    select * into s from public.cash_sessions where closed_at is null order by opened_at desc limit 1 for update;
    if s.id is null then raise exception 'Abra o caixa antes de registrar movimentações.'; end if;
  end if;
  if action='set_status' then
    target := (payload->>'status')::public.appointment_status;
    select * into strict a from public.appointments where id=v_id for update;
    if a.status='completed' and target<>'completed' then raise exception 'Atendimento já concluído.'; end if;
    if a.status in ('cancelled','no_show') then raise exception 'Crie um novo agendamento para este cliente.'; end if;
    if target='completed' then perform public.complete_appointment(v_id);
    else update public.appointments set status=target where id=v_id; end if;
  elsif action='receive' then
    select * into strict c from public.commands where id=v_id for update;
    if c.status='closed' then return jsonb_build_object('id',c.id); end if;
    if c.status<>'awaiting_payment' then raise exception 'Confirme a conclusão do atendimento antes de receber.'; end if;
    select coalesce(sum(unit_price_cents*quantity),0)-c.discount_cents+c.surcharge_cents into total from public.command_items where command_id=c.id;
    if total<=0 then raise exception 'Defina o valor do serviço antes de receber.'; end if;
    insert into public.payments(command_id,method,amount_cents,recorded_by) values(c.id,method,total,auth.uid());
    insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,command_id) values(s.id,'sale',total,method,'Recebimento de comanda',auth.uid(),c.id);
    update public.commands set status='closed',closed_at=now() where id=c.id;
  elsif action='pay_commissions' then
    -- Somente IDs visualizados e confirmados pelo operador; linhas travadas impedem pagamento duplicado.
    for item in select e.* from public.commission_entries e where e.professional_id=v_id and e.status='pending' and e.commission_cents>0 and e.id in (select jsonb_array_elements_text(payload->'entries')::uuid) for update loop
      if method='cash' then
        select s.opening_balance_cents+coalesce(sum(m.amount_cents) filter(where m.payment_method='cash'),0) into balance from public.cash_movements m where m.session_id=s.id;
        if balance<item.commission_cents then raise exception 'Dinheiro insuficiente no caixa para o repasse.'; end if;
      end if;
      insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by,commission_entry_id) values(s.id,'withdrawal',-item.commission_cents,method,'Repasse ao profissional',auth.uid(),item.id);
      update public.commission_entries set status='paid',paid_at=now(),paid_method=method where id=item.id;
    end loop;
  elsif action='open_cash' then
    perform pg_advisory_xact_lock(180010);
    if exists(select 1 from public.cash_sessions where closed_at is null) then raise exception 'Já existe um caixa aberto.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Saldo inicial inválido.'; end if;
    insert into public.cash_sessions(opened_by,opening_balance_cents) values(auth.uid(),amount) returning id into v_id;
  elsif action='close_cash' then
    select * into strict s from public.cash_sessions where id=v_id for update;
    if s.closed_at is not null then raise exception 'Caixa já fechado.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Informe o dinheiro contado no caixa.'; end if;
    update public.cash_sessions set closed_at=now(),declared_balance_cents=amount,notes=payload->>'notes' where id=s.id;
  elsif action='move_cash' then
    if coalesce(payload->>'type','') not in ('expense','withdrawal','reinforcement') then raise exception 'Tipo de lançamento inválido.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<=0 or length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'Informe valor positivo e descrição.'; end if;
    if payload->>'type'<>'reinforcement' then amount := -amount; end if;
    if method='cash' and amount<0 then
      select s.opening_balance_cents+coalesce(sum(m.amount_cents) filter(where m.payment_method='cash'),0) into balance from public.cash_movements m where m.session_id=s.id;
      if balance+amount<0 then raise exception 'Dinheiro insuficiente no caixa.'; end if;
    end if;
    insert into public.cash_movements(session_id,type,amount_cents,payment_method,notes,created_by) values(s.id,payload->>'type',amount,method,trim(payload->>'notes'),auth.uid());
  elsif action='save_customer' then
    customer_name := trim(payload->>'name'); v_phone := regexp_replace(payload->>'phone','\D','','g');
    if length(coalesce(customer_name,''))<2 or length(coalesce(v_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
    if v_id is null then
      insert into public.customers(name,phone,created_by) values(customer_name,v_phone,auth.uid()) returning id into v_id;
    else update public.customers set name=customer_name,phone=v_phone,notes=payload->>'notes' where id=v_id; end if;
  elsif action='create_appointment' then
    customer_name := trim(payload->>'name'); v_phone := regexp_replace(payload->>'phone','\D','','g');
    if length(coalesce(customer_name,''))<2 or length(coalesce(v_phone,''))<10 then raise exception 'Nome e telefone válidos são obrigatórios.'; end if;
    pro_uuid := (payload->>'professional_id')::uuid;
    if not exists(select 1 from public.professionals where id=pro_uuid and active) then raise exception 'Profissional indisponível.'; end if;
    select * into strict service_row from public.services where id=(payload->>'service_id')::uuid and active;
    start_at := (payload->>'starts_at')::timestamptz;
    if start_at is null then raise exception 'Informe data e horário.'; end if;
    select id into customer_uuid from public.customers where regexp_replace(customers.phone,'\D','','g')=v_phone order by created_at limit 1;
    if customer_uuid is null then insert into public.customers(name,phone,created_by) values(customer_name,v_phone,auth.uid()) returning id into customer_uuid; end if;
    amount := coalesce((payload->>'amount')::integer,service_row.price_cents);
    if amount<0 then raise exception 'Valor inválido.'; end if;
    insert into public.appointments(customer_id,professional_id,service_id,starts_at,ends_at,expected_price_cents,source,created_by)
      values(customer_uuid,pro_uuid,service_row.id,start_at,start_at+make_interval(mins=>service_row.duration_minutes),amount,'panel',auth.uid()) returning id into v_id;
  elsif action='set_price' then
    select * into strict a from public.appointments where id=v_id for update;
    if a.status in ('completed','cancelled','no_show') then raise exception 'Altere o valor antes de concluir o atendimento.'; end if;
    amount := (payload->>'amount')::integer;
    if amount is null or amount<0 then raise exception 'Valor inválido.'; end if;
    update public.appointments set expected_price_cents=amount where id=a.id;
    update public.command_items i set unit_price_cents=amount,commission_cents=round(amount*i.commission_value/100.0) from public.commands cmd where i.command_id=cmd.id and cmd.appointment_id=a.id;
  elsif action='save_service' then
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do serviço.'; end if;
    if v_id is null then
      insert into public.services(name,description,price_cents,duration_minutes,color,active) values(trim(payload->>'name'),payload->>'description',(payload->>'price')::integer,(payload->>'duration')::integer,coalesce(payload->>'color','#203F20'),true) returning id into v_id;
    else update public.services set name=trim(payload->>'name'),description=payload->>'description',price_cents=(payload->>'price')::integer,duration_minutes=(payload->>'duration')::integer,active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
    insert into public.professional_services(professional_id,service_id,commission_percent) select p.id,v_id,case when lower(trim(p.name))='machado' then 0 else 40 end from public.professionals p on conflict do nothing;
  elsif action='save_professional' then
    if public.current_role()<>'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do profissional.'; end if;
    amount := case when lower(trim(payload->>'name'))='machado' then 0 else 40 end;
    if v_id is null then
      insert into public.professionals(name,phone,specialties,default_commission_percent,active) values(trim(payload->>'name'),payload->>'phone',payload->>'specialties',amount,true) returning id into v_id;
    else update public.professionals set name=trim(payload->>'name'),phone=payload->>'phone',specialties=payload->>'specialties',default_commission_percent=amount,active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
    insert into public.professional_services(professional_id,service_id,commission_percent) select v_id,id,amount from public.services on conflict(professional_id,service_id) do update set commission_percent=excluded.commission_percent;
  elsif action='save_product' then
    if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome.'; end if;
    if v_id is null then
      insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity) values(trim(payload->>'name'),payload->>'category',(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0) returning id into v_id;
    else update public.products set name=trim(payload->>'name'),category=payload->>'category',sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),active=coalesce((payload->>'active')::boolean,true) where id=v_id; end if;
  elsif action='adjust_stock' then
    select quantity into strict total from public.products where id=v_id for update;
    amount := (payload->>'delta')::integer;
    if amount is null or amount=0 or total+amount<0 then raise exception 'Ajuste de estoque inválido.'; end if;
    if length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'Informe o motivo do ajuste.'; end if;
    insert into public.stock_movements(product_id,type,quantity_delta,reason,created_by) values(v_id,'adjustment',amount,payload->>'notes',auth.uid());
    update public.products set quantity=quantity+amount where id=v_id;
  else raise exception 'Operação desconhecida.';
  end if;
  return jsonb_build_object('id',v_id);
exception when exclusion_violation then raise exception 'Este profissional já tem atendimento nesse horário.';
  when unique_violation then raise exception 'Esse registro já existe. Atualize a página e confira os dados.';
end $function$
;
CREATE OR REPLACE FUNCTION public.delete_command_record(command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; item_row public.command_items%rowtype; redemption_row public.package_redemptions%rowtype;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=delete_command_record.command_id for update;
  for item_row in select * from public.command_items i where i.command_id=command_row.id for update loop
    if command_row.status in ('open','awaiting_payment') and item_row.product_id is not null then
      update public.products p set quantity=p.quantity+item_row.quantity where p.id=item_row.product_id;
    end if;
    select * into redemption_row from public.package_redemptions r where r.command_item_id=item_row.id for update;
    if found then
      update public.package_sale_balances b set remaining=least(b.total,b.remaining+1) where b.sale_id=redemption_row.sale_id and b.service_id=redemption_row.service_id;
      update public.package_sales ps set status='active' where ps.id=redemption_row.sale_id;
      delete from public.package_redemptions r where r.id=redemption_row.id;
    end if;
  end loop;
  delete from public.cash_movements m where m.command_id=command_row.id or m.commission_entry_id in (select e.id from public.commission_entries e join public.command_items i on i.id=e.command_item_id where i.command_id=command_row.id);
  delete from public.stock_movements m where m.reference_id=command_row.id;
  delete from public.payments p where p.command_id=command_row.id;
  delete from public.commission_entries e where e.command_item_id in (select i.id from public.command_items i where i.command_id=command_row.id);
  delete from public.command_items i where i.command_id=command_row.id;
  delete from public.commands c where c.id=command_row.id;
  if command_row.appointment_id is not null then delete from public.appointments a where a.id=command_row.appointment_id; end if;
  return jsonb_build_object('id',command_row.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.create_schedule_block(professional_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare block_uuid uuid;
begin
  perform public.require_office();
  if not exists(select 1 from public.professionals p where p.id=create_schedule_block.professional_id and p.active) then
    raise exception 'Profissional indisponível.';
  end if;
  if create_schedule_block.starts_at is null or create_schedule_block.ends_at is null or create_schedule_block.ends_at<=create_schedule_block.starts_at then
    raise exception 'Período de bloqueio inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(create_schedule_block.professional_id::text,0));
  if extract(second from create_schedule_block.starts_at at time zone 'America/Sao_Paulo')<>0
    or mod(extract(minute from create_schedule_block.starts_at at time zone 'America/Sao_Paulo')::integer,15)<>0
    or mod((extract(epoch from (create_schedule_block.ends_at-create_schedule_block.starts_at))/60)::integer,15)<>0 then
    raise exception 'O bloqueio precisa respeitar intervalos de 15 minutos.';
  end if;
  if exists(select 1 from public.appointments a where a.professional_id=create_schedule_block.professional_id and a.status not in ('cancelled','no_show') and a.starts_at<create_schedule_block.ends_at and a.ends_at>create_schedule_block.starts_at)
    or exists(select 1 from public.schedule_blocks b where b.professional_id=create_schedule_block.professional_id and b.starts_at<create_schedule_block.ends_at and b.ends_at>create_schedule_block.starts_at) then
    raise exception 'slot_blocked' using errcode='23P01';
  end if;
  insert into public.schedule_blocks(professional_id,starts_at,ends_at,reason,created_by)
    values(create_schedule_block.professional_id,create_schedule_block.starts_at,create_schedule_block.ends_at,coalesce(nullif(trim(create_schedule_block.reason),''),'Agenda bloqueada'),auth.uid())
    returning id into block_uuid;
  return jsonb_build_object('id',block_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.sync_appointment_command(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.appointments%rowtype; command_uuid uuid; item_uuid uuid; rate numeric; amount integer; package_sale_uuid uuid;
begin
  select * into strict a from public.appointments ap where ap.id=p_id for update;
  if a.status in ('cancelled','no_show') then return null; end if;
  insert into public.commands(appointment_id,customer_id,status) values(a.id,a.customer_id,'open') on conflict on constraint commands_appointment_id_key do nothing;
  select c.id into command_uuid from public.commands c where c.appointment_id=a.id for update;
  select i.id into item_uuid from public.command_items i where i.command_id=command_uuid and i.service_id=a.service_id limit 1;
  if item_uuid is null then
    select coalesce(p.default_commission_percent,s.default_commission_percent,50) into rate
      from public.professionals p cross join public.services s where p.id=a.professional_id and s.id=a.service_id;
    amount:=round(a.expected_price_cents*rate/100.0);
    insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
      select command_uuid,'service',a.service_id,a.professional_id,s.name,a.expected_price_cents,1,'percent',rate,amount from public.services s where s.id=a.service_id returning id into item_uuid;
  end if;
  if a.status='completed' then
    select r.sale_id into package_sale_uuid from public.package_redemptions r where r.command_item_id=item_uuid;
    if package_sale_uuid is null then
      select ps.id into package_sale_uuid from public.package_sales ps join public.package_sale_balances b on b.sale_id=ps.id where ps.customer_id=a.customer_id and ps.status='active' and b.service_id=a.service_id and b.remaining>0 order by ps.sold_at,ps.id limit 1 for update of ps,b;
      if package_sale_uuid is not null then
        update public.package_sale_balances b set remaining=b.remaining-1 where b.sale_id=package_sale_uuid and b.service_id=a.service_id and b.remaining>0;
        insert into public.package_redemptions(sale_id,service_id,command_item_id,redeemed_by) values(package_sale_uuid,a.service_id,item_uuid,auth.uid());
        if not exists(select 1 from public.package_sale_balances b where b.sale_id=package_sale_uuid and b.remaining>0) then update public.package_sales ps set status='completed' where ps.id=package_sale_uuid; end if;
      end if;
    end if;
    if package_sale_uuid is not null then update public.command_items i set unit_price_cents=0 where i.id=item_uuid; end if;
    update public.commands c set status='awaiting_payment',closed_at=null where c.id=command_uuid and not exists(select 1 from public.payments p where p.command_id=command_uuid and p.reversed_at is null);
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
      select i.id,i.professional_id,a.expected_price_cents,i.commission_cents,jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',a.expected_price_cents-i.commission_cents,'package_sale_id',package_sale_uuid),'pending' from public.command_items i where i.id=item_uuid and i.commission_cents>0 on conflict(command_item_id) do nothing;
  end if;
  return command_uuid;
end; $function$
;
CREATE OR REPLACE FUNCTION public.add_service_to_command(command_id uuid, service_id uuid, professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; service_row public.services%rowtype; professional_row public.professionals%rowtype; rate numeric; commission integer; item_uuid uuid;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=add_service_to_command.command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita novos serviços.'; end if;
  select * into strict service_row from public.services s where s.id=add_service_to_command.service_id and s.active;
  select * into strict professional_row from public.professionals p where p.id=add_service_to_command.professional_id and p.active;
  rate:=coalesce(professional_row.default_commission_percent,service_row.default_commission_percent,50);
  commission:=round(service_row.price_cents*rate/100.0);
  insert into public.command_items(command_id,type,service_id,professional_id,description,unit_price_cents,quantity,commission_kind,commission_value,commission_cents)
    values(command_row.id,'service',service_row.id,professional_row.id,service_row.name,service_row.price_cents,1,'percent',rate,commission) returning id into item_uuid;
  if command_row.status='awaiting_payment' and commission>0 then
    insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status) values(item_uuid,professional_row.id,service_row.price_cents,commission,jsonb_build_object('rate_percent',rate,'barbershop_cents',service_row.price_cents-commission),'pending') on conflict(command_item_id) do nothing;
  end if;
  return jsonb_build_object('id',item_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.public_booking_slots(chosen_service uuid, booking_day date, preferred_professional uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_time time without time zone, professional_id uuid, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with selected_service as (
    select duration_minutes from public.services where id=chosen_service and active
  ), candidates as (
    select candidate::time as slot_time, candidate as local_start, selected_service.duration_minutes
    from public.business_hours h cross join selected_service,
      lateral generate_series(
        (booking_day+h.opens_at)::timestamp,
        (booking_day+h.closes_at)::timestamp-make_interval(mins=>selected_service.duration_minutes),
        interval '15 minutes'
      ) candidate
    where h.weekday=extract(isodow from booking_day)
      and candidate>=(now() at time zone 'America/Sao_Paulo')+interval '5 minutes'
  )
  select c.slot_time,free_professional.id,free_professional.id is not null
  from candidates c
  left join lateral (
    select p.id from public.professionals p
    join public.professional_services ps on ps.professional_id=p.id and ps.service_id=chosen_service
    where p.active and (preferred_professional is null or p.id=preferred_professional)
      and not exists(select 1 from public.appointments a where a.professional_id=p.id and a.status not in ('cancelled','no_show') and a.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) at time zone 'America/Sao_Paulo') and a.ends_at>(c.local_start at time zone 'America/Sao_Paulo'))
      and not exists(select 1 from public.schedule_blocks b where b.professional_id=p.id and b.starts_at<((c.local_start+make_interval(mins=>c.duration_minutes)) at time zone 'America/Sao_Paulo') and b.ends_at>(c.local_start at time zone 'America/Sao_Paulo'))
    order by p.name limit 1
  ) free_professional on true
  order by c.slot_time;
$function$
;
CREATE OR REPLACE FUNCTION public.open_manual_command(customer_name text, customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare customer_uuid uuid; command_uuid uuid; clean_name text; clean_phone text;
begin
  perform public.require_office();
  clean_name := trim(customer_name);
  clean_phone := regexp_replace(customer_phone, '\\D', '', 'g');
  if length(coalesce(clean_name,'')) < 2 or length(coalesce(clean_phone,'')) < 10 then
    raise exception 'Informe nome e WhatsApp válidos.';
  end if;

  select id into customer_uuid
    from public.customers
   where regexp_replace(phone, '\\D', '', 'g') = clean_phone
   order by created_at
   limit 1
   for update;
  if customer_uuid is null then
    insert into public.customers(name, phone, created_by)
      values(clean_name, clean_phone, auth.uid()) returning id into customer_uuid;
  else
    update public.customers set name=clean_name where id=customer_uuid;
  end if;

  insert into public.commands(customer_id, status, opened_by)
    values(customer_uuid, 'open', auth.uid()) returning id into command_uuid;
  return jsonb_build_object('id', command_uuid, 'customer_id', customer_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.reset_operational_data(confirmation text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare removed_appointments integer:=0; removed_customers integer:=0; removed_commands integer:=0; removed_sessions integer:=0; removed_packages integer:=0; removed_blocks integer:=0;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário pode zerar a operação.'; end if;
  if coalesce(confirmation,'')<>'ZERAR OPERAÇÃO' then raise exception 'Digite ZERAR OPERAÇÃO para confirmar a limpeza.'; end if;
  delete from public.cash_movements where id is not null;
  delete from public.package_redemptions where id is not null;
  delete from public.package_sale_balances where sale_id is not null;
  delete from public.package_sales where id is not null; get diagnostics removed_packages=row_count;
  delete from public.commission_entries where id is not null;
  delete from public.payments where id is not null;
  delete from public.command_items where id is not null;
  delete from public.commands where id is not null; get diagnostics removed_commands=row_count;
  delete from public.appointments where id is not null; get diagnostics removed_appointments=row_count;
  delete from public.schedule_blocks where id is not null; get diagnostics removed_blocks=row_count;
  delete from public.cash_sessions where id is not null; get diagnostics removed_sessions=row_count;
  delete from public.customers where id is not null; get diagnostics removed_customers=row_count;
  insert into public.audit_logs(actor_profile_id,operation,entity_type,request_summary,result) values(auth.uid(),'reset_operational_data','operation',jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages),'success');
  return jsonb_build_object('appointments',removed_appointments,'blocks',removed_blocks,'customers',removed_customers,'commands',removed_commands,'cash_sessions',removed_sessions,'package_sales',removed_packages);
end; $function$
;
CREATE OR REPLACE FUNCTION public.set_command_adjustments(command_id uuid, discount_cents integer DEFAULT 0, surcharge_cents integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype; subtotal integer;
begin
  perform public.require_office();
  select * into strict command_row from public.commands where id=command_id for update;
  if command_row.status not in ('open','awaiting_payment') then raise exception 'Esta comanda não aceita mais alterações.'; end if;
  if discount_cents < 0 or surcharge_cents < 0 then raise exception 'Desconto e gorjeta não podem ser negativos.'; end if;
  select coalesce(sum(unit_price_cents*quantity),0) into subtotal from public.command_items where command_id=command_row.id;
  if subtotal-discount_cents+surcharge_cents <= 0 then raise exception 'O total da comanda precisa ser maior que zero.'; end if;
  update public.commands set discount_cents=set_command_adjustments.discount_cents,surcharge_cents=set_command_adjustments.surcharge_cents where id=command_row.id;
  return jsonb_build_object('id',command_row.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.redeem_package_service(package_sale_id uuid, service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare remaining_total integer;
begin
  perform public.require_office();
  perform pg_advisory_xact_lock(hashtextextended(redeem_package_service.package_sale_id::text,0));
  perform ps.id from public.package_sales ps where ps.id=redeem_package_service.package_sale_id and ps.status='active' for update;
  if not found then raise exception 'Pacote indisponível para uso.'; end if;
  update public.package_sale_balances b set remaining=b.remaining-1 where b.sale_id=redeem_package_service.package_sale_id and b.service_id=redeem_package_service.service_id and b.remaining>0;
  if not found then raise exception 'Não há sessão disponível para este serviço.'; end if;
  select coalesce(sum(b.remaining),0) into remaining_total from public.package_sale_balances b where b.sale_id=redeem_package_service.package_sale_id;
  if remaining_total=0 then update public.package_sales ps set status='completed' where ps.id=redeem_package_service.package_sale_id; end if;
  return jsonb_build_object('id',redeem_package_service.package_sale_id,'remaining',remaining_total);
end; $function$
;
CREATE OR REPLACE FUNCTION public.ensure_appointment_not_blocked()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status not in ('cancelled','no_show') then
    perform pg_advisory_xact_lock(hashtextextended(new.professional_id::text,0));
    if exists (
      select 1 from public.schedule_blocks b
      where b.professional_id=new.professional_id
        and b.starts_at<new.ends_at and b.ends_at>new.starts_at
    ) then
      raise exception 'slot_blocked' using errcode='23P01';
    end if;
  end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_product_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare product_uuid uuid; rate numeric(5,2);
begin
  perform public.require_office();
  product_uuid:=nullif(payload->>'id','')::uuid;
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Informe o nome do produto.'; end if;
  rate:=coalesce((payload->>'commission')::numeric,20);
  if rate<0 or rate>100 then raise exception 'A comissão deve ficar entre zero e cem por cento.'; end if;
  if product_uuid is null then
    insert into public.products(name,category,sale_price_cents,cost_cents,minimum_quantity,quantity,photo_url,commission_percent,active)
      values(trim(payload->>'name'),nullif(trim(payload->>'category'),''),(payload->>'price')::integer,coalesce((payload->>'cost')::integer,0),coalesce((payload->>'minimum')::integer,0),0,nullif(payload->>'photo_url',''),rate,coalesce((payload->>'active')::boolean,true)) returning id into product_uuid;
  else
    update public.products p set name=trim(payload->>'name'),category=nullif(trim(payload->>'category'),''),sale_price_cents=(payload->>'price')::integer,cost_cents=coalesce((payload->>'cost')::integer,0),minimum_quantity=coalesce((payload->>'minimum')::integer,0),photo_url=nullif(payload->>'photo_url',''),commission_percent=rate,active=coalesce((payload->>'active')::boolean,true) where p.id=product_uuid;
    if not found then raise exception 'Produto não encontrado.'; end if;
  end if;
  return jsonb_build_object('id',product_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.delete_product_record(product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_uuid uuid;
begin
  perform public.require_office();
  perform 1 from public.products p where p.id=delete_product_record.product_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  for command_uuid in select distinct i.command_id from public.command_items i where i.product_id=delete_product_record.product_id loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.stock_movements m where m.product_id=delete_product_record.product_id;
  delete from public.products p where p.id=delete_product_record.product_id;
  return jsonb_build_object('id',delete_product_record.product_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.save_professional_profile(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare professional_uuid uuid; professional_name text; service_rate numeric(5,2); product_rate numeric(5,2); is_new boolean:=false;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário gerencia profissionais.'; end if;
  professional_uuid:=nullif(payload->>'id','')::uuid;
  professional_name:=trim(payload->>'name');
  if length(coalesce(professional_name,''))<2 then raise exception 'Informe o nome do profissional.'; end if;
  service_rate:=nullif(payload->>'service_commission','')::numeric;
  product_rate:=nullif(payload->>'product_commission','')::numeric;
  if service_rate is not null and (service_rate<0 or service_rate>100) then raise exception 'A comissão de serviços deve ficar entre zero e cem por cento.'; end if;
  if product_rate is not null and (product_rate<0 or product_rate>100) then raise exception 'A comissão de produtos deve ficar entre zero e cem por cento.'; end if;
  if professional_uuid is null then
    is_new:=true;
    insert into public.professionals(name,phone,specialties,default_commission_percent,default_product_commission_percent,photo_url,active)
      values(professional_name,nullif(trim(payload->>'phone'),''),nullif(trim(payload->>'specialties'),''),service_rate,product_rate,nullif(payload->>'photo_url',''),coalesce((payload->>'active')::boolean,true)) returning id into professional_uuid;
  else
    update public.professionals p set name=professional_name,phone=nullif(trim(payload->>'phone'),''),specialties=nullif(trim(payload->>'specialties'),''),default_commission_percent=service_rate,default_product_commission_percent=product_rate,photo_url=nullif(payload->>'photo_url',''),active=coalesce((payload->>'active')::boolean,true) where p.id=professional_uuid;
    if not found then raise exception 'Profissional não encontrado.'; end if;
  end if;
  if is_new then
    insert into public.professional_services(professional_id,service_id,commission_percent)
      select professional_uuid,s.id,null from public.services s
      on conflict(professional_id,service_id) do nothing;
  end if;
  return jsonb_build_object('id',professional_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.delete_schedule_block(block_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.require_office();
  delete from public.schedule_blocks where id=block_id;
  if not found then raise exception 'Bloqueio não encontrado.'; end if;
  return jsonb_build_object('id',block_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.office_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.require_office();
  return jsonb_build_object(
    'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select a.*,c.name customer_name,c.phone customer_phone,p.name professional_name,s.name service_name from public.appointments a join public.customers c on c.id=a.customer_id join public.professionals p on p.id=a.professional_id join public.services s on s.id=a.service_id) x),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(b order by b.starts_at) from public.schedule_blocks b),'[]'::jsonb),
    'customers',coalesce((select jsonb_agg(c order by c.name) from public.customers c),'[]'::jsonb),
    'commands',coalesce((select jsonb_agg(c order by c.created_at desc) from public.commands c),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(i) from public.command_items i),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(p) from public.payments p),'[]'::jsonb),
    'commissions',coalesce((select jsonb_agg(c) from public.commission_entries c),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(s order by s.opened_at desc) from public.cash_sessions s),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(m order by m.created_at desc) from public.cash_movements m),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(p order by p.name) from public.products p),'[]'::jsonb),
    'packages',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select p.*,coalesce((select jsonb_agg(jsonb_build_object('service_id',i.service_id,'service_name',s.name,'quantity',i.quantity) order by s.name) from public.service_package_items i join public.services s on s.id=i.service_id where i.package_id=p.id),'[]'::jsonb) items from public.service_packages p) x),'[]'::jsonb),
    'packageSales',coalesce((select jsonb_agg(to_jsonb(x) order by x.sold_at desc) from (select ps.*,p.name package_name,c.name customer_name,coalesce((select jsonb_agg(jsonb_build_object('service_id',b.service_id,'service_name',s.name,'total',b.total,'remaining',b.remaining) order by s.name) from public.package_sale_balances b join public.services s on s.id=b.service_id where b.sale_id=ps.id),'[]'::jsonb) balances from public.package_sales ps join public.service_packages p on p.id=ps.package_id join public.customers c on c.id=ps.customer_id) x),'[]'::jsonb),
    'packageRedemptions',coalesce((select jsonb_agg(to_jsonb(x) order by x.redeemed_at desc) from (select r.*,p.name package_name from public.package_redemptions r join public.package_sales ps on ps.id=r.sale_id join public.service_packages p on p.id=ps.package_id) x),'[]'::jsonb),
    'business',coalesce((select jsonb_agg(b) from public.business_settings b),'[]'::jsonb)
  );
end; $function$
;
CREATE OR REPLACE FUNCTION public.can_access_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('owner', 'admin')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.save_service_package(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare package_uuid uuid; package_name text; package_price integer; package_item jsonb; service_uuid uuid; item_quantity integer;
begin
  perform public.require_office();
  package_uuid := nullif(payload->>'id','')::uuid;
  package_name := trim(payload->>'name'); package_price := (payload->>'price')::integer;
  if length(coalesce(package_name,''))<2 or package_price is null or package_price<=0 then raise exception 'Informe nome e valor válidos para o pacote.'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb))=0 then raise exception 'Inclua ao menos um serviço no pacote.'; end if;
  if package_uuid is null then
    insert into public.service_packages(name,description,price_cents,active)
      values(package_name,nullif(trim(payload->>'description'),''),package_price,coalesce((payload->>'active')::boolean,true)) returning id into package_uuid;
  else
    update public.service_packages set name=package_name,description=nullif(trim(payload->>'description'),''),price_cents=package_price,active=coalesce((payload->>'active')::boolean,true) where id=package_uuid;
    delete from public.service_package_items where package_id=package_uuid;
  end if;
  for package_item in select value from jsonb_array_elements(payload->'items') loop
    service_uuid := (package_item->>'service_id')::uuid; item_quantity := (package_item->>'quantity')::integer;
    if item_quantity is null or item_quantity<1 or not exists(select 1 from public.services where id=service_uuid) then raise exception 'Serviço ou quantidade inválida no pacote.'; end if;
    insert into public.service_package_items(package_id,service_id,quantity) values(package_uuid,service_uuid,item_quantity);
  end loop;
  return jsonb_build_object('id',package_uuid);
end; $function$
;
CREATE OR REPLACE FUNCTION public.mark_command_ready(command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_row public.commands%rowtype;
begin
  perform public.require_office();
  select * into strict command_row from public.commands c where c.id=mark_command_ready.command_id for update;
  if command_row.status<>'open' or command_row.appointment_id is not null then raise exception 'Apenas comandas de balcão em aberto podem ser enviadas para receber.'; end if;
  if not exists(select 1 from public.command_items i where i.command_id=command_row.id) then raise exception 'Inclua ao menos um serviço ou produto antes de enviar para receber.'; end if;
  update public.commands c set status='awaiting_payment',closed_at=null where c.id=command_row.id;
  insert into public.commission_entries(command_item_id,professional_id,gross_cents,commission_cents,rule_snapshot,status)
    select i.id,i.professional_id,i.unit_price_cents*i.quantity,i.commission_cents,jsonb_build_object('rate_percent',i.commission_value,'barbershop_cents',i.unit_price_cents*i.quantity-i.commission_cents,'type',i.type),'pending'
      from public.command_items i where i.command_id=command_row.id and i.professional_id is not null and i.commission_cents>0
    on conflict(command_item_id) do nothing;
  return jsonb_build_object('id',command_row.id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.delete_professional_record(professional_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare command_uuid uuid; profile_uuid uuid;
begin
  perform public.require_office();
  if public.current_role()<>'owner' then raise exception 'Somente o proprietário pode excluir profissionais.'; end if;
  select p.profile_id into profile_uuid from public.professionals p where p.id=delete_professional_record.professional_id for update;
  if not found then raise exception 'Profissional não encontrado.'; end if;
  if profile_uuid=auth.uid() then raise exception 'O proprietário não pode excluir o próprio acesso.'; end if;
  for command_uuid in
    select distinct c.id from public.commands c left join public.command_items i on i.command_id=c.id left join public.appointments a on a.id=c.appointment_id
     where i.professional_id=delete_professional_record.professional_id or a.professional_id=delete_professional_record.professional_id
  loop
    perform public.delete_command_record(command_uuid);
  end loop;
  delete from public.appointments a where a.professional_id=delete_professional_record.professional_id;
  delete from public.schedule_blocks b where b.professional_id=delete_professional_record.professional_id;
  delete from public.commission_entries e where e.professional_id=delete_professional_record.professional_id;
  delete from public.professionals p where p.id=delete_professional_record.professional_id;
  if profile_uuid is not null then
    update public.customers set created_by=null where created_by=profile_uuid;
    update public.appointments set created_by=null where created_by=profile_uuid;
    update public.commands set opened_by=null where opened_by=profile_uuid;
    update public.payments set recorded_by=null where recorded_by=profile_uuid;
    update public.stock_movements set created_by=null where created_by=profile_uuid;
    update public.cash_sessions set opened_by=null where opened_by=profile_uuid;
    update public.cash_movements set created_by=null where created_by=profile_uuid;
    update public.notifications set profile_id=null where profile_id=profile_uuid;
    update public.audit_logs set actor_profile_id=null where actor_profile_id=profile_uuid;
    update public.package_sales set sold_by=null where sold_by=profile_uuid;
    update public.package_redemptions set redeemed_by=null where redeemed_by=profile_uuid;
    update public.schedule_blocks set created_by=null where created_by=profile_uuid;
    delete from auth.users u where u.id=profile_uuid;
  end if;
  return jsonb_build_object('id',delete_professional_record.professional_id);
end; $function$
;
CREATE TRIGGER customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER professionals_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER sync_appointment_command AFTER INSERT OR UPDATE OF status ON public.appointments FOR EACH ROW EXECUTE FUNCTION appointment_command_trigger();
CREATE TRIGGER guard_completed_appointment BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION guard_completed_appointment();
CREATE TRIGGER service_packages_updated BEFORE UPDATE ON public.service_packages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER appointments_block_guard BEFORE INSERT OR UPDATE OF professional_id, starts_at, ends_at, status ON public.appointments FOR EACH ROW EXECUTE FUNCTION ensure_appointment_not_blocked();
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
SET check_function_bodies = true;
ALTER TABLE public."cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commission_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."professionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."command_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_rate_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."professional_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_package_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."package_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."package_sale_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."business_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."schedule_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."package_redemptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

