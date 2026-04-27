update public."titles"
set "content_access_rule" = 'open'
where ("id"::text = 't1' or lower(coalesce("title", '')) = 'chicago streets')
  and "content_access_rule" is distinct from 'open';
