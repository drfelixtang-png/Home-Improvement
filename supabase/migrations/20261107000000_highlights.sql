-- One-line highlight per item (why it is useful), in English and Traditional Chinese.
alter table public.items
  add column highlight_en text,
  add column highlight_zh text;
