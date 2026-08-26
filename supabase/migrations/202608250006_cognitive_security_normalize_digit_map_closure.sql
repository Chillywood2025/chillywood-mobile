-- Precompute the reviewed Unicode decimal-digit translation map once while the
-- migration is installed. The previous function rebuilt this 670-character map
-- for every normalized fragment, which made a maximum-sized positioned payload
-- exceed its reviewed statement-timeout budget.
do $migration$
declare
  digit_characters text;
  ascii_digits text;
begin
  select
    pg_catalog.string_agg(pg_catalog.chr(block_start + digit_offset), '' order by block_order, digit_offset),
    pg_catalog.string_agg(pg_catalog.chr(48 + digit_offset), '' order by block_order, digit_offset)
  into digit_characters, ascii_digits
  from pg_catalog.unnest(array[
      48,1632,1776,1984,2406,2534,2662,2790,2918,3046,3174,3302,3430,3558,
      3664,3792,3872,4160,4240,6112,6160,6470,6608,6784,6800,6992,7088,7232,
      7248,42528,43216,43264,43472,43504,43600,44016,66720,68912,69734,69872,
      69942,70096,70384,70736,70864,71248,71360,71472,71904,72016,72784,73040,
      73120,73552,92768,92864,93008,120782,120792,120802,120812,120822,
      123200,123632,124144,125264,130032
    ]) with ordinality as digit_block(block_start, block_order)
  cross join pg_catalog.generate_series(0,9) digit_offset;

  execute pg_catalog.format($definition$
create or replace function public.cognitive_security_normalize(payload text)
returns text
language plpgsql
immutable
set search_path = ''
as $body$
declare
  normalized text := normalize(coalesce(payload, ''), NFKD);
  digit_characters constant text := %1$L;
  ascii_digits constant text := %2$L;
  supplementary_ignorable_pattern text;
begin
  normalized := translate(normalized, U&'\3002\FF0E\FF61', '...');
  normalized := regexp_replace(
    normalized,
    U&'[\00AD\0300-\036F\034F\061C\115F\1160\17B4\17B5\180B-\180F\1AB0-\1AFF\1DC0-\1DFF\200B-\200F\202A-\202E\2060-\206F\20D0-\20FF\3164\FE00-\FE0F\FE20-\FE2F\FEFF\FFA0]',
    '',
    'g'
  );
  supplementary_ignorable_pattern := '['
    || chr(113824) || '-' || chr(113839)
    || chr(119155) || '-' || chr(119162)
    || chr(917504) || '-' || chr(921599)
    || ']';
  normalized := regexp_replace(normalized, supplementary_ignorable_pattern, '', 'g');
  normalized := translate(normalized, digit_characters, ascii_digits);
  normalized := translate(
    normalized,
    U&'\0410\0412\0415\041A\041C\041D\041E\0420\0421\0422\0423\0425\0406\0408\0405\0500\051A\051C\04AE\04C0\0391\0392\0395\0397\0399\039A\039C\039D\039F\03A1\03A4\03A5\03A7\03F9\0546\0555\0430\0432\0435\043A\043C\043D\043E\0440\0441\0442\0443\0445\0456\0458\0455\0501\051B\051D\04AF\04CF\03B1\03B2\03B5\03B7\03B9\03BA\03BC\03BD\03BF\03C1\03C4\03C5\03C7\03F2\0576\0585',
    'ABEKMHOPCTYXIJSDQWYLABEHIKMVOPTYXCNOabekmhopctyxijsdqwylabehikmvoptyxcno'
  );
  normalized := translate(normalized, U&'\04BB\0131\0261\026A\0269\0540\0570', 'higiiHh');
  return translate(
    normalized,
    'ɑᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ',
    'aabcdefghijklmnoprstuvwyz'
  );
end;
$body$;
$definition$, digit_characters, ascii_digits);
end
$migration$;

revoke all on function public.cognitive_security_normalize(text) from public, anon, authenticated;
grant execute on function public.cognitive_security_normalize(text) to service_role;
