begin;
revoke all on function public.create_cart_order(jsonb,text,text,text,boolean,text,integer,jsonb,integer,text,text,jsonb) from public;
revoke all on function public.create_cart_order(jsonb,text,text,text,boolean,text,integer,jsonb,integer,text,text,jsonb) from anon;
revoke all on function public.create_cart_order(jsonb,text,text,text,boolean,text,integer,jsonb,integer,text,text,jsonb) from authenticated;
grant execute on function public.create_cart_order(jsonb,text,text,text,boolean,text,integer,jsonb,integer,text,text,jsonb) to service_role;
commit;