begin;

delete from public.ai_benchmarks
where slug in (
  'accuracy-basic','extraction-basic','classification-basic','research-basic','writing-basic',
  'coding-basic','multilingual-basic','reasoning-basic','tool-calling-basic'
);

commit;
