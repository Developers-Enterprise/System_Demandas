-- SEDURB Mamanguape v8 — modelo Obra > Demandas + acesso por obra
-- Execute no SQL Editor do Supabase antes de usar a versão v8.
-- Seguro para rodar mais de uma vez: usa IF NOT EXISTS quando possível.

-- 1. Perfis: role pode ser admin, colab ou prefeito.
alter table public.profiles
  add column if not exists prof_type text,
  add column if not exists initial text;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to service_role;

-- 2. Obras: processo principal. As demandas ficam vinculadas a uma obra.
create table if not exists public.works (
  id bigserial primary key,
  title text not null,
  bairro text,
  localizacao text,
  objeto text,
  processo text,
  status text default 'Em planejamento',
  prioridade text default 'Normal',
  valor_estimado text,
  prazo_previsto date,
  obs text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists works_status_idx on public.works(status);
create index if not exists works_bairro_idx on public.works(bairro);
create index if not exists works_created_by_idx on public.works(created_by);

grant select, insert, update on table public.works to authenticated;
grant usage, select on sequence public.works_id_seq to authenticated;

-- 3. Demandas: agora cada demanda pode/precisa estar vinculada a uma obra.
alter table public.demands
  add column if not exists work_id bigint references public.works(id) on delete cascade,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists prioridade text default 'Normal',
  add column if not exists processo_numero text,
  add column if not exists termo_referencia text,
  add column if not exists matriz_riscos text,
  add column if not exists alteracao_estrutural boolean default false,
  add column if not exists responsaveis jsonb default '[]'::jsonb,
  add column if not exists anexos jsonb default '{}'::jsonb;

create index if not exists demands_work_id_idx on public.demands(work_id);
create index if not exists demands_status_idx on public.demands(status);
create index if not exists demands_esp_idx on public.demands(esp);
create index if not exists demands_prazo_idx on public.demands(prazo);
create index if not exists demands_prioridade_idx on public.demands(prioridade);
create index if not exists demands_responsaveis_gin_idx on public.demands using gin (responsaveis);
create index if not exists demands_anexos_gin_idx on public.demands using gin (anexos);

grant select, insert, update, delete on table public.demands to authenticated;

-- 4. Função auxiliar: verifica se o usuário é gestão/prefeito.
create or replace function public.is_sedurb_manager(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'prefeito')
  );
$$;

create or replace function public.is_sedurb_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- Evita recursão nas policies: esta função SECURITY DEFINER checa o acesso à obra
-- sem fazer a policy de demands consultar a própria tabela diretamente.
create or replace function public.user_has_sedurb_work_access(p_work_id bigint, uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_sedurb_manager(uid)
    or exists (
      select 1 from public.demands d
      where d.work_id = p_work_id
        and p_work_id is not null
        and (
          d.resp_id = uid
          or d.responsaveis @> jsonb_build_array(jsonb_build_object('id', uid::text))
        )
    );
$$;

-- 5. RLS em obras: prefeito e gestão veem tudo. Técnico vê apenas obra onde há demanda atribuída a ele.
alter table public.works enable row level security;

drop policy if exists "SEDURB works select" on public.works;
drop policy if exists "SEDURB works insert admin" on public.works;
drop policy if exists "SEDURB works update admin" on public.works;

create policy "SEDURB works select"
on public.works
for select
to authenticated
using (public.user_has_sedurb_work_access(works.id, auth.uid()));

create policy "SEDURB works insert admin"
on public.works
for insert
to authenticated
with check (public.is_sedurb_admin(auth.uid()));

create policy "SEDURB works update admin"
on public.works
for update
to authenticated
using (public.is_sedurb_admin(auth.uid()))
with check (public.is_sedurb_admin(auth.uid()));

-- 6. RLS em demandas: prefeito/gestão veem tudo. Técnico vê demandas da obra onde ele participa.
alter table public.demands enable row level security;

drop policy if exists "SEDURB demands select by work" on public.demands;
drop policy if exists "SEDURB demands insert admin" on public.demands;
drop policy if exists "SEDURB demands update assigned" on public.demands;
drop policy if exists "SEDURB demands delete admin" on public.demands;

create policy "SEDURB demands select by work"
on public.demands
for select
to authenticated
using (
  public.is_sedurb_manager(auth.uid())
  or resp_id = auth.uid()
  or responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
  or public.user_has_sedurb_work_access(demands.work_id, auth.uid())
);

create policy "SEDURB demands insert admin"
on public.demands
for insert
to authenticated
with check (public.is_sedurb_admin(auth.uid()));

create policy "SEDURB demands update assigned"
on public.demands
for update
to authenticated
using (
  public.is_sedurb_admin(auth.uid())
  or resp_id = auth.uid()
  or responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
)
with check (
  public.is_sedurb_admin(auth.uid())
  or resp_id = auth.uid()
  or responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
);

create policy "SEDURB demands delete admin"
on public.demands
for delete
to authenticated
using (public.is_sedurb_admin(auth.uid()));

-- 7. Histórico: leitura para participantes da obra e gestão/prefeito.
alter table if exists public.demand_history enable row level security;

grant select, insert on table public.demand_history to authenticated;

drop policy if exists "SEDURB history select by work" on public.demand_history;
drop policy if exists "SEDURB history insert authenticated" on public.demand_history;

create policy "SEDURB history select by work"
on public.demand_history
for select
to authenticated
using (
  public.is_sedurb_manager(auth.uid())
  or exists (
    select 1 from public.demands d
    where d.id = demand_history.demand_id
      and (
        d.resp_id = auth.uid()
        or d.responsaveis @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))
        or public.user_has_sedurb_work_access(d.work_id, auth.uid())
      )
  )
);

create policy "SEDURB history insert authenticated"
on public.demand_history
for insert
to authenticated
with check (auth.uid() = user_id or public.is_sedurb_admin(auth.uid()));

-- 8. Storage para anexos.
insert into storage.buckets (id, name, public)
values ('demand-files', 'demand-files', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'SEDURB - ler arquivos') then
    create policy "SEDURB - ler arquivos" on storage.objects for select using (bucket_id = 'demand-files');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'SEDURB - enviar arquivos autenticado') then
    create policy "SEDURB - enviar arquivos autenticado" on storage.objects for insert to authenticated with check (bucket_id = 'demand-files');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'SEDURB - atualizar arquivos autenticado') then
    create policy "SEDURB - atualizar arquivos autenticado" on storage.objects for update to authenticated using (bucket_id = 'demand-files') with check (bucket_id = 'demand-files');
  end if;
end $$;

-- 9. Exemplo para transformar um usuário em prefeito:
-- update public.profiles set role = 'prefeito', name = 'Prefeito de Mamanguape', initial = 'PM' where email = 'email_do_prefeito@dominio.com';

notify pgrst, 'reload schema';

-- 10. Alteração 2026-07-01: arquitetos/engenheiros atribuídos podem editar obras vinculadas
-- e excluir arquivos do bucket. Seguro para rodar sem apagar dados.
create or replace function public.is_sedurb_technical(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'colab'
  );
$$;

drop policy if exists "SEDURB works update admin" on public.works;
drop policy if exists "SEDURB works update assigned technicians" on public.works;

create policy "SEDURB works update assigned technicians"
on public.works
for update
to authenticated
using (
  public.is_sedurb_admin(auth.uid())
  or (
    public.is_sedurb_technical(auth.uid())
    and public.user_has_sedurb_work_access(works.id, auth.uid())
  )
)
with check (
  public.is_sedurb_admin(auth.uid())
  or (
    public.is_sedurb_technical(auth.uid())
    and public.user_has_sedurb_work_access(works.id, auth.uid())
  )
);

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'SEDURB - excluir arquivos autenticado') then
    create policy "SEDURB - excluir arquivos autenticado" on storage.objects for delete to authenticated using (bucket_id = 'demand-files');
  end if;
end $$;

notify pgrst, 'reload schema';
