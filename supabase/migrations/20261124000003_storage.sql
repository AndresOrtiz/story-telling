-- Public bucket for generated images. Only the server writes to it. Skipped in the embedded database.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
  end if;
end $$;
