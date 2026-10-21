-- Retour arrière de 20261019010000_commerce_and_ops.sql (les colonnes ajoutées aux commandes sont conservées : aucune perte de données)
begin;
drop function if exists public.export_personal_data(text);
drop function if exists public.erase_personal_data(text);
drop function if exists public.purge_expired_personal_data(int, int);
drop function if exists public.rate_limit_purge();
drop function if exists public.release_download(uuid);
drop function if exists public.claim_download(text, text, text);
drop function if exists public.fulfil_order(uuid, text, int, text, text, text, timestamptz, jsonb, jsonb, int);
drop trigger if exists problems_snapshot on public.problems;
drop function if exists public.snapshot_problem();
drop policy if exists "problèmes publiés visibles (anonyme)" on public.problems;
drop policy if exists "problèmes visibles (connecté)" on public.problems;
create policy "lecture publique des problèmes publiés" on public.problems for select to anon, authenticated using (status = 'published');
create policy "admin lit tous les problèmes" on public.problems for select to authenticated using (public.is_admin());
drop policy if exists "produits publiés visibles (anonyme)" on public.products;
drop policy if exists "produits visibles (connecté)" on public.products;
create policy "lecture publique des produits publiés" on public.products for select to anon, authenticated using (status = 'published');
create policy "admin lit tous les produits" on public.products for select to authenticated using (public.is_admin());
-- Les politiques fusionnées des domaines, commentaires, avis, livrables et messages sont à recréer depuis 20261016000000_init.sql si nécessaire.
commit;
