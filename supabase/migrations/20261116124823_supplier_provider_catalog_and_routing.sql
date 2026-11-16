begin;

create table if not exists public.supplier_provider_catalog (
  provider_key text primary key,
  name text not null,
  integration_mode text not null check (integration_mode in ('native_api','oauth_api','partner_api','restricted_api','feed','managed_platform','directory','generic_rest')),
  adapter_key text not null default 'generic_rest',
  verification_status text not null default 'documented' check (verification_status in ('documented','approval_required','partner_required','managed_only','directory','custom')),
  official_url text,
  docs_url text,
  capabilities jsonb not null default '{}'::jsonb,
  config_schema jsonb not null default '{}'::jsonb,
  notes text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.supplier_connections
  add column if not exists provider_key text not null default 'custom_rest',
  add column if not exists integration_mode text not null default 'generic_rest',
  add column if not exists credentials_ciphertext text,
  add column if not exists credential_version integer not null default 1,
  add column if not exists sandbox_enabled boolean not null default false,
  add column if not exists provider_capabilities jsonb not null default '{}'::jsonb,
  add column if not exists docs_url text;

alter table public.supplier_connections drop constraint if exists supplier_connections_adapter_check;
alter table public.supplier_connections add constraint supplier_connections_adapter_check
  check (adapter in ('generic_rest','cj','hypersku','alibaba','syncee','spocket','dsers','aliexpress','salehoo','eprolo','wiio','custom'));

alter table public.supplier_connections
  add constraint supplier_connections_provider_key_fkey
  foreign key (provider_key) references public.supplier_provider_catalog(provider_key)
  on update cascade;

alter table public.supplier_connections
  add constraint supplier_connections_integration_mode_check
  check (integration_mode in ('native_api','oauth_api','partner_api','restricted_api','feed','managed_platform','directory','generic_rest'));

alter table public.product_supplier_mappings
  add column if not exists priority integer not null default 100,
  add column if not exists destination_countries text[] not null default '{}'::text[];

alter table public.product_supplier_mappings
  add constraint product_supplier_mappings_priority_check
  check (priority between 1 and 10000);

create index if not exists supplier_connections_provider_idx
  on public.supplier_connections(provider_key, enabled, status);

create index if not exists product_supplier_mappings_routing_idx
  on public.product_supplier_mappings(product_id,variant_id,enabled,priority);

insert into public.supplier_provider_catalog
(provider_key,name,integration_mode,adapter_key,verification_status,official_url,docs_url,capabilities,config_schema,notes)
values
('cj_dropshipping','CJdropshipping','native_api','cj','documented','https://cjdropshipping.com','https://developers.cjdropshipping.com/en/api/start/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":true,"sandbox":true,"repricing":true}'::jsonb,
 '{"credentials":["api_key","access_token","refresh_token","open_id"],"auth":"CJ-Access-Token","webhook_signature":"HMAC-SHA256"}'::jsonb,
 'API 2.0 documentée; tokenisation serveur; webhooks produits/stock/commandes/logistique.'),
('hypersku','HyperSKU','native_api','hypersku','approval_required','https://hypersku.com','https://support.hypersku.com/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"credentials":["api_key_or_token","client_id"],"auth":"provider_defined_open_api"}'::jsonb,
 'Open API disponible; accès et paramètres API à obtenir auprès de HyperSKU.'),
('alibaba_dropshipping','Alibaba.com Dropshipping','oauth_api','alibaba','approval_required','https://www.alibaba.com','https://openapi.alibaba.com/doc/doc.htm',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":true,"sandbox":false,"repricing":true}'::jsonb,
 '{"credentials":["app_key","app_secret","authorization"],"auth":"oauth_app"}'::jsonb,
 'Open Platform avec application et permissions; le flux dropshipping dépend des droits accordés.'),
('syncee','Syncee','feed','syncee','managed_only','https://syncee.com','https://help.syncee.com/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"feeds":["csv","xml","xlsx","json","url","google_drive","dropbox","sftp","soap","api"],"refresh":"scheduled"}'::jsonb,
 'Plateforme/feed manager; pas de promesse d API retailer universelle directe.'),
('spocket','Spocket','managed_platform','spocket','managed_only','https://www.spocket.co','https://help.spocket.co/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"connection":["supported_store_integration","partner_connector"]}'::jsonb,
 'Intégrations de plateformes e-commerce documentées; connexion directe à une boutique custom à valider avec Spocket.'),
('dsers','DSers','partner_api','dsers','approval_required','https://www.dsers.com','https://help.dsers.com/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":true,"sandbox":true,"repricing":true,"multi_supplier":true}'::jsonb,
 '{"credentials":["developer_app","api_credentials"],"auth":"partner_open_api"}'::jsonb,
 'Open API réservée aux partenaires/applications approuvées; orchestre notamment AliExpress, Alibaba et 1688.'),
('aliexpress','AliExpress','restricted_api','aliexpress','approval_required','https://www.aliexpress.com','https://developer.alibaba.com/docs/doc.htm?treeId=727',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":true,"sandbox":false,"repricing":true}'::jsonb,
 '{"credentials":["app_key","app_secret","seller_authorization"],"auth":"aliexpress_open_platform"}'::jsonb,
 'API Open Platform soumise à inscription développeur, application et permissions; DSers est la voie d orchestration recommandée si l accès direct n est pas accordé.'),
('salehoo','SaleHoo','directory','salehoo','directory','https://www.salehoo.com','https://support.salehoo.com/',
 '{"catalog":true,"inventory":false,"orders":false,"order_status":false,"tracking":false,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"feeds":["csv","xml","plugin","manual"],"order_channels":["supplier_specific"]}'::jsonb,
 'Annuaire de fournisseurs: l automatisation dépend de chaque fournisseur référencé.'),
('eprolo','EPROLO','native_api','eprolo','approval_required','https://eprolo.com','https://eprolo.com/eprolo-api/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"credentials":["api_credentials_from_support"],"auth":"provider_defined_api"}'::jsonb,
 'API disponible sur demande auprès du support EPROLO.'),
('wiio','Wiio','managed_platform','wiio','managed_only','https://wiio.com','https://wiio.com/dropshipping/',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true}'::jsonb,
 '{"connection":["supported_store_integration","partner_connector"]}'::jsonb,
 'Plateforme de sourcing/fulfillment avec intégrations de boutiques documentées.'),
('1688_via_dsers','1688 via DSers','partner_api','dsers','documented','https://www.dsers.com','https://www.dsers.com/en/integration/1688-dropshipping-service',
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":false,"sandbox":false,"repricing":true,"multi_supplier":true}'::jsonb,
 '{"credentials":["dsers_account"],"auth":"dsers_managed"}'::jsonb,
 'Route dropshipping 1688 gérée par DSers.'),
('custom_rest','Fournisseur personnalisé','generic_rest','custom','custom',null,null,
 '{"catalog":true,"inventory":true,"orders":true,"order_status":true,"tracking":true,"webhooks":true,"sandbox":false,"repricing":true}'::jsonb,
 '{"credentials":["api_secret"],"auth":"configurable_header"}'::jsonb,
 'Connecteur REST générique pour tout fournisseur qui fournit une API exploitable.')
on conflict (provider_key) do update set
  name=excluded.name,
  integration_mode=excluded.integration_mode,
  adapter_key=excluded.adapter_key,
  verification_status=excluded.verification_status,
  official_url=excluded.official_url,
  docs_url=excluded.docs_url,
  capabilities=excluded.capabilities,
  config_schema=excluded.config_schema,
  notes=excluded.notes,
  enabled=true,
  updated_at=now();

update public.supplier_connections sc
set
  provider_key = coalesce(nullif(sc.config->>'provider_key',''),'custom_rest'),
  integration_mode = coalesce((select spc.integration_mode from public.supplier_provider_catalog spc where spc.provider_key=coalesce(sc.config->>'provider_key','custom_rest')),'generic_rest'),
  docs_url = coalesce(sc.docs_url, (select spc.docs_url from public.supplier_provider_catalog spc where spc.provider_key=coalesce(sc.config->>'provider_key','custom_rest')))
where true;

alter table public.supplier_provider_catalog enable row level security;
revoke all on public.supplier_provider_catalog from anon,authenticated;

commit;
