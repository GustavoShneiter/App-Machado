-- Keep each annual workbook independently connected, without revoking 2026.
ALTER TABLE public.spreadsheet_connections DROP CONSTRAINT spreadsheet_connections_pkey;
ALTER TABLE public.spreadsheet_connections ADD PRIMARY KEY(tenant_id,year);
ALTER TABLE public.spreadsheet_connections ADD COLUMN last_rows jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.spreadsheet_connections ADD COLUMN catalog_state jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.spreadsheet_connections ADD COLUMN sync_mode text NOT NULL DEFAULT 'live';
ALTER TABLE public.spreadsheet_connections ADD CONSTRAINT spreadsheet_sync_mode CHECK(sync_mode IN ('completed','live'));
