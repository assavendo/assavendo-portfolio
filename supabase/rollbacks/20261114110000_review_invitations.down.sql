begin;
drop trigger if exists orders_review_invitations_after_delivery on public.orders;
drop function if exists public.activate_review_invitations_after_delivery();
drop trigger if exists orders_review_invitations_after_paid on public.orders;
drop function if exists public.create_review_invitations_on_paid();
drop table if exists public.review_invitations;
commit;
