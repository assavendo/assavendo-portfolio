-- Retire le nom du fournisseur et la note interne du catalogue public.
begin;
create table if not exists public.product_slug_redirects (
  old_slug text primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.product_slug_redirects enable row level security;
revoke all on public.product_slug_redirects from anon, authenticated;
grant select, insert, update, delete on public.product_slug_redirects to service_role;
insert into public.product_slug_redirects (old_slug, product_id)
select slug, id from public.products where slug ~ '-cj$'
on conflict (old_slug) do nothing;
update public.products
set slug = regexp_replace(slug, '-cj$', ''),
    description = regexp_replace(description,
      '\s*Produit fourni par CJdropshipping\s*;\s*prix de vente et disponibilité commerciale restent à définir\.?\s*',
      ' ', 'gi')
where slug ~ '-cj$' or description ilike '%Produit fourni par CJdropshipping%';
commit;
