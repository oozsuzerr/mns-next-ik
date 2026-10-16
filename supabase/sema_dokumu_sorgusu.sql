-- Şema dökümü (yalnızca OKUR, hiçbir şeyi değiştirmez)
-- Çok firmalı yapı planı, Adım 0: repoda olmayan tablo, fonksiyon ve kuralları görmek için.
-- Supabase > SQL Editor'de çalıştırın; tek satır, tek sütun ("sema") döner.
-- Hücrenin içeriğini kopyalayıp supabase/sema_2026-10-16.sql dosyasına yapıştırın.
-- Veri (personel adı, T.C. vb.) içermez, yalnızca yapı bilgisidir.

with
tablolar as (
  select string_agg(
    format(
      E'-- TABLO %I (RLS: %s)\ncreate table public.%I (\n%s\n);',
      c.relname,
      case when c.relrowsecurity then 'açık' else 'KAPALI' end,
      c.relname,
      (
        select string_agg(
          format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                 case when a.attnotnull then ' not null' else '' end,
                 coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
          E',\n' order by a.attnum)
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      )
    ),
    E'\n\n' order by c.relname) as metin
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
kisitlar as (
  select string_agg(
    format('alter table public.%I add constraint %I %s;', c.relname, k.conname, pg_get_constraintdef(k.oid)),
    E'\n' order by c.relname, k.conname) as metin
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
indeksler as (
  select string_agg(i.indexdef || ';', E'\n' order by i.tablename, i.indexname) as metin
  from pg_indexes i
  where i.schemaname = 'public'
),
kurallar as (
  select string_agg(
    format(E'create policy %I on public.%I as %s for %s to %s%s%s;',
      p.policyname, p.tablename, p.permissive, p.cmd, array_to_string(p.roles, ', '),
      coalesce(E'\n  using (' || p.qual || ')', ''),
      coalesce(E'\n  with check (' || p.with_check || ')', '')),
    E'\n' order by p.tablename, p.policyname) as metin
  from pg_policies p
  where p.schemaname = 'public'
),
fonksiyonlar as (
  select string_agg(pg_get_functiondef(f.oid) || ';', E'\n\n' order by f.proname) as metin
  from pg_proc f
  join pg_namespace n on n.oid = f.pronamespace
  where n.nspname = 'public' and f.prokind = 'f'
),
tetikleyiciler as (
  select string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by c.relname, t.tgname) as metin
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
yetkiler as (
  select string_agg(
    format('-- %s: %s', p.proname, coalesce(array_to_string(p.proacl, ' '), 'varsayılan')),
    E'\n' order by p.proname) as metin
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
)
select concat_ws(E'\n\n',
  '-- ===== TABLOLAR =====', (select metin from tablolar),
  '-- ===== KISITLAR =====', (select metin from kisitlar),
  '-- ===== İNDEKSLER =====', (select metin from indeksler),
  '-- ===== RLS KURALLARI =====', (select metin from kurallar),
  '-- ===== FONKSİYONLAR =====', (select metin from fonksiyonlar),
  '-- ===== TETİKLEYİCİLER =====', (select metin from tetikleyiciler),
  '-- ===== FONKSİYON ÇALIŞTIRMA YETKİLERİ =====', (select metin from yetkiler)
) as sema;
