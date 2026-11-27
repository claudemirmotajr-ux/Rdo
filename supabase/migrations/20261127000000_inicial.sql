-- =====================================================================
-- RDO Pavimentação — estrutura inicial do banco
--
-- Princípio: quem decide o que cada pessoa pode fazer é o banco, não a
-- tela. Toda mudança de situação (enviar, pré-validar, validar,
-- devolver...) passa por funções que conferem o papel de quem chama.
-- Edição direta de tabela só altera conteúdo, nunca situação ou
-- assinaturas de aprovação.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.papel as enum ('pendente', 'tecnico', 'analista', 'engenheiro', 'proprietario');
create type public.rdo_status as enum ('rascunho', 'enviado', 'prevalidado', 'validado', 'devolvido');
create type public.lev_status as enum ('rascunho', 'enviado', 'preaprovado', 'aprovado', 'devolvido');
create type public.nc_status as enum ('aberta', 'tratativa', 'encerrada', 'improcedente');

-- ---------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text,
  papel      public.papel not null default 'pendente',
  criado_em  timestamptz not null default now()
);

-- Papel de quem está chamando (security definer para não cair em
-- recursão nas regras da própria tabela profiles).
create or replace function public.meu_papel()
returns public.papel
language sql stable security definer set search_path = public
as $$ select papel from public.profiles where id = auth.uid() $$;

create or replace function public.e_ativo()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.meu_papel() <> 'pendente', false) $$;

create or replace function public.e_gestao()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.meu_papel() in ('analista', 'engenheiro', 'proprietario'), false) $$;

create or replace function public.meu_nome()
returns text
language sql stable security definer set search_path = public
as $$ select coalesce(nullif(nome, ''), email, 'Usuário') from public.profiles where id = auth.uid() $$;

create or replace function public.nome_de(p_id uuid)
returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select coalesce(nullif(nome, ''), email, '') from public.profiles where id = p_id), '') $$;

-- Cada conta nova entra como "pendente" (sem acesso a nada) até o
-- proprietário definir o papel. A primeira conta do sistema vira
-- proprietário.
create or replace function public.ao_criar_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_papel public.papel := 'pendente';
begin
  perform pg_advisory_xact_lock(hashtext('rdo_primeiro_usuario'));
  if not exists (select 1 from public.profiles) then
    v_papel := 'proprietario';
  end if;
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    v_papel
  );
  return new;
end $$;

create trigger ao_criar_usuario
after insert on auth.users
for each row execute function public.ao_criar_usuario();

alter table public.profiles enable row level security;

-- Cada um vê o próprio cadastro; analistas, engenheiros e proprietário
-- veem todos. Ninguém altera profiles diretamente: só pelas funções
-- abaixo.
create policy profiles_ler on public.profiles for select
  using (id = auth.uid() or public.e_gestao());

create or replace function public.definir_papel(p_usuario uuid, p_papel public.papel)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.meu_papel() is distinct from 'proprietario' then
    raise exception 'Só o proprietário pode definir papéis' using errcode = '42501';
  end if;
  if p_usuario = auth.uid() and p_papel <> 'proprietario'
     and (select count(*) from public.profiles where papel = 'proprietario') <= 1 then
    raise exception 'O sistema precisa de pelo menos um proprietário' using errcode = '42501';
  end if;
  update public.profiles set papel = p_papel where id = p_usuario;
  if not found then
    raise exception 'Usuário não encontrado';
  end if;
  insert into public.historico (entidade, entidade_id, acao, para, por, por_nome)
  values ('usuario', p_usuario, 'papel', p_papel::text, auth.uid(), public.meu_nome());
end $$;

create or replace function public.atualizar_meu_nome(p_nome text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login' using errcode = '42501';
  end if;
  update public.profiles set nome = left(trim(p_nome), 120) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Cadastros (obras, usinas, equipes...)
-- ---------------------------------------------------------------------
create table public.obras (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  contrato   text not null default '',
  rodovia    text not null default '',
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.cadastros (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('usina', 'equipe', 'equipe_pintura', 'deposito')),
  nome       text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (tipo, nome)
);

alter table public.obras enable row level security;
alter table public.cadastros enable row level security;

create policy obras_ler on public.obras for select using (public.e_ativo());
create policy obras_gravar on public.obras for all
  using (public.meu_papel() = 'proprietario')
  with check (public.meu_papel() = 'proprietario');

create policy cadastros_ler on public.cadastros for select using (public.e_ativo());
create policy cadastros_gravar on public.cadastros for all
  using (public.meu_papel() = 'proprietario')
  with check (public.meu_papel() = 'proprietario');

-- ---------------------------------------------------------------------
-- Histórico (somente inclusão; ninguém edita nem apaga)
-- ---------------------------------------------------------------------
create table public.historico (
  id           bigint generated always as identity primary key,
  entidade     text not null,          -- rdo | lev | nc | usuario
  entidade_id  uuid not null,
  acao         text not null,          -- criado | enviado | prevalidado | validado | devolvido | correcao | ...
  de           text,
  para         text,
  motivo       text,
  detalhe      jsonb,
  por          uuid,
  por_nome     text,
  em           timestamptz not null default now()
);
create index historico_entidade on public.historico (entidade, entidade_id, em);

alter table public.historico enable row level security;
-- (política de leitura definida mais abaixo, depois das tabelas que ela consulta)

-- ---------------------------------------------------------------------
-- RDO
-- ---------------------------------------------------------------------
create sequence public.rdo_codigo_seq;

create table public.rdos (
  id                     uuid primary key default gen_random_uuid(),
  numero                 bigint generated always as identity unique,
  codigo                 text unique,                 -- RDO-00001, atribuído na validação
  obra_id                uuid references public.obras (id),
  data                   date not null default current_date,
  tecnico_id             uuid not null default auth.uid() references public.profiles (id),
  tecnico_nome           text not null default '',
  status                 public.rdo_status not null default 'rascunho',
  dados                  jsonb not null default '{}'::jsonb,
  assinante              text,
  assinado_em            timestamptz,
  enviado_em             timestamptz,
  prevalidado_por        uuid references public.profiles (id),
  prevalidado_por_nome   text,
  prevalidado_em         timestamptz,
  validado_por           uuid references public.profiles (id),
  validado_por_nome      text,
  validado_em            timestamptz,
  devolvido_por          uuid references public.profiles (id),
  devolvido_por_nome     text,
  devolvido_em           timestamptz,
  devolvido_motivo       text,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index rdos_status on public.rdos (status, data desc);
create index rdos_tecnico on public.rdos (tecnico_id, data desc);

-- ---------------------------------------------------------------------
-- Levantamento
-- ---------------------------------------------------------------------
create sequence public.lev_codigo_seq;

create table public.levantamentos (
  id                     uuid primary key default gen_random_uuid(),
  numero                 bigint generated always as identity unique,
  codigo                 text unique,                 -- LEV-00001, atribuído na aprovação
  obra_id                uuid references public.obras (id),
  data                   date not null default current_date,
  tecnico_id             uuid not null default auth.uid() references public.profiles (id),
  tecnico_nome           text not null default '',
  status                 public.lev_status not null default 'rascunho',
  dados                  jsonb not null default '{}'::jsonb,
  assinante              text,
  assinado_em            timestamptz,
  enviado_em             timestamptz,
  preaprovado_por        uuid references public.profiles (id),
  preaprovado_por_nome   text,
  preaprovado_em         timestamptz,
  aprovado_por           uuid references public.profiles (id),
  aprovado_por_nome      text,
  aprovado_em            timestamptz,
  devolvido_por          uuid references public.profiles (id),
  devolvido_por_nome     text,
  devolvido_em           timestamptz,
  devolvido_motivo       text,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index levs_status on public.levantamentos (status, data desc);
create index levs_tecnico on public.levantamentos (tecnico_id, data desc);

-- ---------------------------------------------------------------------
-- Não conformidade (indicada de dentro do RDO)
-- ---------------------------------------------------------------------
create sequence public.nc_codigo_seq;

create table public.ncs (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity unique,
  codigo              text unique,                    -- NC-00001, atribuído quando entra em tratativa
  rdo_id              uuid not null references public.rdos (id) on delete cascade,
  tecnico_id          uuid not null default auth.uid() references public.profiles (id),
  status              public.nc_status not null default 'aberta',
  tipo                text not null default '',
  gravidade           text not null default '' check (gravidade in ('', 'Baixa', 'Média', 'Alta')),
  descricao           text not null default '',
  acao_sugerida       text not null default '',
  local               jsonb not null default '{}'::jsonb,   -- rodovia, sentido, faixa, km_ini, km_fim, hora
  tratativa           text,
  tratativa_por       uuid references public.profiles (id),
  tratativa_por_nome  text,
  tratativa_em        timestamptz,
  encerrada_por       uuid references public.profiles (id),
  encerrada_por_nome  text,
  encerrada_em        timestamptz,
  encerramento        text,
  improcedente_motivo text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index ncs_rdo on public.ncs (rdo_id);
create index ncs_status on public.ncs (status);

-- ---------------------------------------------------------------------
-- Anexos (fotos, ficha de campo fotografada, assinatura)
-- O arquivo fica no Storage privado em  {entidade}/{entidade_id}/{arquivo}
-- ---------------------------------------------------------------------
create table public.anexos (
  id           uuid primary key default gen_random_uuid(),
  entidade     text not null check (entidade in ('rdo', 'lev', 'nc')),
  entidade_id  uuid not null,
  tipo         text not null default 'foto' check (tipo in ('foto', 'ficha', 'assinatura')),
  categoria    text not null default '',
  legenda      text not null default '',
  path         text not null unique,
  lat          double precision,
  lon          double precision,
  tirada_em    timestamptz,
  criado_por   uuid not null default auth.uid() references public.profiles (id),
  criado_em    timestamptz not null default now()
);
create index anexos_entidade on public.anexos (entidade, entidade_id);

-- ---------------------------------------------------------------------
-- Quem pode ver / editar cada registro
-- ---------------------------------------------------------------------
create or replace function public.pode_ver(p_entidade text, p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when not public.e_ativo() then false
    when public.e_gestao() then
      case p_entidade
        when 'rdo' then exists (select 1 from public.rdos where id = p_id)
        when 'lev' then exists (select 1 from public.levantamentos where id = p_id)
        when 'nc'  then exists (select 1 from public.ncs where id = p_id)
        when 'usuario' then true
        else false
      end
    else
      case p_entidade
        when 'rdo' then exists (select 1 from public.rdos where id = p_id and tecnico_id = auth.uid())
        when 'lev' then exists (select 1 from public.levantamentos where id = p_id and tecnico_id = auth.uid())
        when 'nc'  then exists (select 1 from public.ncs n join public.rdos r on r.id = n.rdo_id
                                where n.id = p_id and r.tecnico_id = auth.uid())
        when 'usuario' then p_id = auth.uid()
        else false
      end
  end
$$;

-- Editar conteúdo/anexos: só o técnico dono, enquanto rascunho ou devolvido.
create or replace function public.pode_editar(p_entidade text, p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when not public.e_ativo() then false
    when p_entidade = 'rdo' then exists (
      select 1 from public.rdos
      where id = p_id and tecnico_id = auth.uid() and status in ('rascunho', 'devolvido'))
    when p_entidade = 'lev' then exists (
      select 1 from public.levantamentos
      where id = p_id and tecnico_id = auth.uid() and status in ('rascunho', 'devolvido'))
    when p_entidade = 'nc' then exists (
      select 1 from public.ncs n join public.rdos r on r.id = n.rdo_id
      where n.id = p_id and n.status = 'aberta'
        and r.tecnico_id = auth.uid() and r.status in ('rascunho', 'devolvido'))
    else false
  end
$$;

-- Versão para o caminho do Storage ("rdo/<uuid>/arquivo.jpg"), sem
-- quebrar quando o texto não é um uuid.
create or replace function public.caminho_entidade(p_path text, out entidade text, out entidade_id uuid)
language plpgsql immutable
as $$
begin
  entidade := split_part(p_path, '/', 1);
  begin
    entidade_id := split_part(p_path, '/', 2)::uuid;
  exception when others then
    entidade_id := null;
  end;
end $$;

create or replace function public.pode_ver_arquivo(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.pode_ver(c.entidade, c.entidade_id), false)
  from public.caminho_entidade(p_path) c
$$;

create or replace function public.pode_editar_arquivo(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.pode_editar(c.entidade, c.entidade_id), false)
  from public.caminho_entidade(p_path) c
$$;

-- ---------------------------------------------------------------------
-- Proteção dos campos de situação/aprovação contra edição direta
-- As funções de transição (security definer) rodam como dono do
-- banco; edição vinda do app roda como "authenticated".
-- ---------------------------------------------------------------------
create or replace function public.chamada_do_app()
returns boolean
language sql stable
as $$ select current_user in ('authenticated', 'anon') $$;

create or replace function public.rdo_antes_inserir()
returns trigger
language plpgsql set search_path = public  -- roda como quem chamou: é isso que distingue app de função de transição
as $$
begin
  if public.chamada_do_app() then
    new.tecnico_id := auth.uid();
    new.status := 'rascunho';
    new.codigo := null;
    new.enviado_em := null;
    new.prevalidado_por := null; new.prevalidado_por_nome := null; new.prevalidado_em := null;
    new.validado_por := null;    new.validado_por_nome := null;    new.validado_em := null;
    new.devolvido_por := null;   new.devolvido_por_nome := null;   new.devolvido_em := null;
    new.devolvido_motivo := null;
  end if;
  new.tecnico_nome := public.nome_de(new.tecnico_id);
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.rdo_antes_atualizar()
returns trigger
language plpgsql set search_path = public  -- roda como quem chamou: é isso que distingue app de função de transição
as $$
begin
  if public.chamada_do_app() then
    if new.status is distinct from old.status
       or new.tecnico_id is distinct from old.tecnico_id
       or new.tecnico_nome is distinct from old.tecnico_nome
       or new.codigo is distinct from old.codigo
       or new.enviado_em is distinct from old.enviado_em
       or new.prevalidado_por is distinct from old.prevalidado_por
       or new.prevalidado_por_nome is distinct from old.prevalidado_por_nome
       or new.prevalidado_em is distinct from old.prevalidado_em
       or new.validado_por is distinct from old.validado_por
       or new.validado_por_nome is distinct from old.validado_por_nome
       or new.validado_em is distinct from old.validado_em
       or new.devolvido_por is distinct from old.devolvido_por
       or new.devolvido_por_nome is distinct from old.devolvido_por_nome
       or new.devolvido_em is distinct from old.devolvido_em
       or new.devolvido_motivo is distinct from old.devolvido_motivo
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Situação e aprovações só mudam pelos botões de envio e validação' using errcode = '42501';
    end if;
    -- assinatura é do técnico; correção da gestão não pode trocar
    if auth.uid() is distinct from old.tecnico_id
       and (new.assinante is distinct from old.assinante or new.assinado_em is distinct from old.assinado_em) then
      raise exception 'Só o técnico assina o próprio RDO' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger rdo_antes_inserir before insert on public.rdos
for each row execute function public.rdo_antes_inserir();
create trigger rdo_antes_atualizar before update on public.rdos
for each row execute function public.rdo_antes_atualizar();

create or replace function public.lev_antes_inserir()
returns trigger
language plpgsql set search_path = public  -- roda como quem chamou: é isso que distingue app de função de transição
as $$
begin
  if public.chamada_do_app() then
    new.tecnico_id := auth.uid();
    new.status := 'rascunho';
    new.codigo := null;
    new.enviado_em := null;
    new.preaprovado_por := null; new.preaprovado_por_nome := null; new.preaprovado_em := null;
    new.aprovado_por := null;    new.aprovado_por_nome := null;    new.aprovado_em := null;
    new.devolvido_por := null;   new.devolvido_por_nome := null;   new.devolvido_em := null;
    new.devolvido_motivo := null;
  end if;
  new.tecnico_nome := public.nome_de(new.tecnico_id);
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.lev_antes_atualizar()
returns trigger
language plpgsql set search_path = public  -- roda como quem chamou: é isso que distingue app de função de transição
as $$
begin
  if public.chamada_do_app() then
    if new.status is distinct from old.status
       or new.tecnico_id is distinct from old.tecnico_id
       or new.tecnico_nome is distinct from old.tecnico_nome
       or new.codigo is distinct from old.codigo
       or new.enviado_em is distinct from old.enviado_em
       or new.preaprovado_por is distinct from old.preaprovado_por
       or new.preaprovado_por_nome is distinct from old.preaprovado_por_nome
       or new.preaprovado_em is distinct from old.preaprovado_em
       or new.aprovado_por is distinct from old.aprovado_por
       or new.aprovado_por_nome is distinct from old.aprovado_por_nome
       or new.aprovado_em is distinct from old.aprovado_em
       or new.devolvido_por is distinct from old.devolvido_por
       or new.devolvido_por_nome is distinct from old.devolvido_por_nome
       or new.devolvido_em is distinct from old.devolvido_em
       or new.devolvido_motivo is distinct from old.devolvido_motivo
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Situação e aprovações só mudam pelos botões de envio e aprovação' using errcode = '42501';
    end if;
    if auth.uid() is distinct from old.tecnico_id
       and (new.assinante is distinct from old.assinante or new.assinado_em is distinct from old.assinado_em) then
      raise exception 'Só o técnico assina o próprio levantamento' using errcode = '42501';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger lev_antes_inserir before insert on public.levantamentos
for each row execute function public.lev_antes_inserir();
create trigger lev_antes_atualizar before update on public.levantamentos
for each row execute function public.lev_antes_atualizar();

create or replace function public.nc_antes_gravar()
returns trigger
language plpgsql set search_path = public  -- roda como quem chamou: é isso que distingue app de função de transição
as $$
begin
  if public.chamada_do_app() then
    if tg_op = 'INSERT' then
      new.tecnico_id := auth.uid();
      new.status := 'aberta';
      new.codigo := null;
      new.tratativa := null; new.tratativa_por := null; new.tratativa_por_nome := null; new.tratativa_em := null;
      new.encerrada_por := null; new.encerrada_por_nome := null; new.encerrada_em := null; new.encerramento := null;
      new.improcedente_motivo := null;
      new.criado_em := now();
    else
      if new.status is distinct from old.status
         or new.rdo_id is distinct from old.rdo_id
         or new.tecnico_id is distinct from old.tecnico_id
         or new.codigo is distinct from old.codigo
         or new.tratativa is distinct from old.tratativa
         or new.tratativa_por is distinct from old.tratativa_por
         or new.tratativa_por_nome is distinct from old.tratativa_por_nome
         or new.tratativa_em is distinct from old.tratativa_em
         or new.encerrada_por is distinct from old.encerrada_por
         or new.encerrada_por_nome is distinct from old.encerrada_por_nome
         or new.encerrada_em is distinct from old.encerrada_em
         or new.encerramento is distinct from old.encerramento
         or new.improcedente_motivo is distinct from old.improcedente_motivo
         or new.criado_em is distinct from old.criado_em then
        raise exception 'Situação da NC só muda pelos botões de tratativa' using errcode = '42501';
      end if;
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger nc_antes_gravar before insert or update on public.ncs
for each row execute function public.nc_antes_gravar();

-- ---------------------------------------------------------------------
-- Histórico automático: criação, mudança de situação e correções da
-- gestão (com o que mudou)
-- ---------------------------------------------------------------------
create or replace function public.diff_jsonb(a jsonb, b jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('de', a -> k, 'para', b -> k)), '{}'::jsonb)
  from (select jsonb_object_keys(coalesce(a, '{}'::jsonb) || coalesce(b, '{}'::jsonb)) as k) keys
  where (a -> k) is distinct from (b -> k)
$$;

create or replace function public.registrar_historico()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_ent text := case tg_table_name when 'rdos' then 'rdo' when 'levantamentos' then 'lev' else 'nc' end;
  v_motivo text;
begin
  if tg_op = 'INSERT' then
    insert into public.historico (entidade, entidade_id, acao, para, por, por_nome)
    values (v_ent, new.id, 'criado', new.status::text, auth.uid(), public.meu_nome());
  elsif new.status is distinct from old.status then
    v_motivo := case
      when v_ent in ('rdo', 'lev') and new.status::text = 'devolvido' then to_jsonb(new) ->> 'devolvido_motivo'
      when v_ent = 'nc' and new.status::text = 'improcedente' then to_jsonb(new) ->> 'improcedente_motivo'
      when v_ent = 'nc' and new.status::text = 'tratativa' then to_jsonb(new) ->> 'tratativa'
      when v_ent = 'nc' and new.status::text = 'encerrada' then to_jsonb(new) ->> 'encerramento'
    end;
    insert into public.historico (entidade, entidade_id, acao, de, para, motivo, por, por_nome)
    values (v_ent, new.id, new.status::text, old.status::text, new.status::text, v_motivo, auth.uid(), public.meu_nome());
  elsif v_ent in ('rdo', 'lev')
        and auth.uid() is distinct from (to_jsonb(old) ->> 'tecnico_id')::uuid
        and (to_jsonb(new) -> 'dados') is distinct from (to_jsonb(old) -> 'dados') then
    -- correção feita pela gestão no conteúdo enviado pelo técnico
    insert into public.historico (entidade, entidade_id, acao, de, para, detalhe, por, por_nome)
    values (v_ent, new.id, 'correcao', old.status::text, new.status::text,
            public.diff_jsonb(to_jsonb(old) -> 'dados', to_jsonb(new) -> 'dados'),
            auth.uid(), public.meu_nome());
  end if;
  return new;
end $$;

create trigger rdo_historico after insert or update on public.rdos
for each row execute function public.registrar_historico();
create trigger lev_historico after insert or update on public.levantamentos
for each row execute function public.registrar_historico();
create trigger nc_historico after insert or update on public.ncs
for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------------
alter table public.rdos enable row level security;
alter table public.levantamentos enable row level security;
alter table public.ncs enable row level security;
alter table public.anexos enable row level security;

-- RDO
create policy rdos_ler on public.rdos for select
  using (public.e_ativo() and (tecnico_id = auth.uid() or public.e_gestao()));

create policy rdos_criar on public.rdos for insert
  with check (public.e_ativo() and tecnico_id = auth.uid());

-- Técnico edita o próprio enquanto rascunho/devolvido. Gestão corrige
-- conteúdo do que está na sua etapa (analista: enviado; engenheiro:
-- enviado ou pré-validado). Validado não muda mais.
create policy rdos_editar on public.rdos for update
  using (
    (tecnico_id = auth.uid() and status in ('rascunho', 'devolvido') and public.e_ativo())
    or (public.meu_papel() = 'analista' and status = 'enviado')
    or (public.meu_papel() in ('engenheiro', 'proprietario') and status in ('enviado', 'prevalidado'))
  )
  with check (
    (tecnico_id = auth.uid() and status in ('rascunho', 'devolvido') and public.e_ativo())
    or (public.meu_papel() = 'analista' and status = 'enviado')
    or (public.meu_papel() in ('engenheiro', 'proprietario') and status in ('enviado', 'prevalidado'))
  );

create policy rdos_apagar on public.rdos for delete
  using (tecnico_id = auth.uid() and status = 'rascunho' and public.e_ativo());

-- Levantamento
create policy levs_ler on public.levantamentos for select
  using (public.e_ativo() and (tecnico_id = auth.uid() or public.e_gestao()));

create policy levs_criar on public.levantamentos for insert
  with check (public.e_ativo() and tecnico_id = auth.uid());

create policy levs_editar on public.levantamentos for update
  using (
    (tecnico_id = auth.uid() and status in ('rascunho', 'devolvido') and public.e_ativo())
    or (public.meu_papel() = 'analista' and status = 'enviado')
    or (public.meu_papel() in ('engenheiro', 'proprietario') and status in ('enviado', 'preaprovado'))
  )
  with check (
    (tecnico_id = auth.uid() and status in ('rascunho', 'devolvido') and public.e_ativo())
    or (public.meu_papel() = 'analista' and status = 'enviado')
    or (public.meu_papel() in ('engenheiro', 'proprietario') and status in ('enviado', 'preaprovado'))
  );

create policy levs_apagar on public.levantamentos for delete
  using (tecnico_id = auth.uid() and status = 'rascunho' and public.e_ativo());

-- NC: o técnico indica dentro do próprio RDO enquanto ainda pode editar
-- o RDO; a gestão vê todas.
create policy ncs_ler on public.ncs for select
  using (public.pode_ver('rdo', rdo_id));

create policy ncs_criar on public.ncs for insert
  with check (public.pode_editar('rdo', rdo_id));

create policy ncs_editar on public.ncs for update
  using (status = 'aberta' and public.pode_editar('rdo', rdo_id))
  with check (status = 'aberta' and public.pode_editar('rdo', rdo_id));

create policy ncs_apagar on public.ncs for delete
  using (status = 'aberta' and public.pode_editar('rdo', rdo_id));

-- Anexos
create policy anexos_ler on public.anexos for select
  using (public.pode_ver(entidade, entidade_id));

create policy anexos_criar on public.anexos for insert
  with check (criado_por = auth.uid()
              and public.pode_editar(entidade, entidade_id)
              and path like entidade || '/' || entidade_id::text || '/%');

create policy anexos_apagar on public.anexos for delete
  using (criado_por = auth.uid() and public.pode_editar(entidade, entidade_id));

-- Histórico
create policy historico_ler on public.historico for select
  using (public.pode_ver(entidade, entidade_id));

-- ---------------------------------------------------------------------
-- Transições do RDO
-- ---------------------------------------------------------------------
create or replace function public.rdo_enviar(p_id uuid)
returns public.rdos
language plpgsql security definer set search_path = public
as $$
declare r public.rdos;
begin
  select * into r from public.rdos where id = p_id for update;
  if not found or r.tecnico_id is distinct from auth.uid() or not public.e_ativo() then
    raise exception 'RDO não encontrado' using errcode = '42501';
  end if;
  if r.status not in ('rascunho', 'devolvido') then
    raise exception 'Este RDO já foi enviado' using errcode = '22023';
  end if;
  if r.obra_id is null then
    raise exception 'Escolha a obra antes de enviar' using errcode = '22023';
  end if;
  if coalesce(r.assinante, '') = '' or r.assinado_em is null then
    raise exception 'Assine o RDO antes de enviar' using errcode = '22023';
  end if;
  update public.rdos set
    status = 'enviado', enviado_em = now(),
    devolvido_por = null, devolvido_por_nome = null, devolvido_em = null, devolvido_motivo = null
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.rdo_prevalidar(p_id uuid)
returns public.rdos
language plpgsql security definer set search_path = public
as $$
declare r public.rdos;
begin
  if public.meu_papel() not in ('analista', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o analista pré-valida' using errcode = '42501';
  end if;
  select * into r from public.rdos where id = p_id for update;
  if not found then raise exception 'RDO não encontrado'; end if;
  if r.status <> 'enviado' then
    raise exception 'Só dá para pré-validar um RDO enviado (situação atual: %)', r.status using errcode = '22023';
  end if;
  update public.rdos set
    status = 'prevalidado', prevalidado_por = auth.uid(), prevalidado_por_nome = public.meu_nome(), prevalidado_em = now()
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.rdo_validar(p_id uuid)
returns public.rdos
language plpgsql security definer set search_path = public
as $$
declare r public.rdos;
begin
  if public.meu_papel() not in ('engenheiro', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o engenheiro valida' using errcode = '42501';
  end if;
  select * into r from public.rdos where id = p_id for update;
  if not found then raise exception 'RDO não encontrado'; end if;
  if r.status <> 'prevalidado' then
    raise exception 'O RDO precisa ser pré-validado pelo analista antes (situação atual: %)', r.status using errcode = '22023';
  end if;
  if exists (select 1 from public.ncs where rdo_id = p_id and status = 'aberta') then
    raise exception 'Este RDO tem NC aberta: coloque em tratativa ou marque como não procede antes de validar' using errcode = '22023';
  end if;
  update public.rdos set
    status = 'validado', validado_por = auth.uid(), validado_por_nome = public.meu_nome(), validado_em = now(),
    codigo = coalesce(codigo, 'RDO-' || lpad(nextval('public.rdo_codigo_seq')::text, 5, '0'))
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.rdo_devolver(p_id uuid, p_motivo text)
returns public.rdos
language plpgsql security definer set search_path = public
as $$
declare r public.rdos; v_papel public.papel := public.meu_papel();
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo da devolução' using errcode = '22023';
  end if;
  select * into r from public.rdos where id = p_id for update;
  if not found then raise exception 'RDO não encontrado'; end if;
  if not (
       (v_papel = 'analista' and r.status = 'enviado')
    or (v_papel in ('engenheiro', 'proprietario') and r.status in ('enviado', 'prevalidado'))
  ) then
    raise exception 'Você não pode devolver este RDO na situação atual (%)', r.status using errcode = '42501';
  end if;
  update public.rdos set
    status = 'devolvido', devolvido_por = auth.uid(), devolvido_por_nome = public.meu_nome(), devolvido_em = now(),
    devolvido_motivo = trim(p_motivo),
    prevalidado_por = null, prevalidado_por_nome = null, prevalidado_em = null
  where id = p_id returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Transições do Levantamento
-- ---------------------------------------------------------------------
create or replace function public.lev_enviar(p_id uuid)
returns public.levantamentos
language plpgsql security definer set search_path = public
as $$
declare r public.levantamentos;
begin
  select * into r from public.levantamentos where id = p_id for update;
  if not found or r.tecnico_id is distinct from auth.uid() or not public.e_ativo() then
    raise exception 'Levantamento não encontrado' using errcode = '42501';
  end if;
  if r.status not in ('rascunho', 'devolvido') then
    raise exception 'Este levantamento já foi enviado' using errcode = '22023';
  end if;
  if r.obra_id is null then
    raise exception 'Escolha a obra antes de enviar' using errcode = '22023';
  end if;
  if coalesce(r.assinante, '') = '' or r.assinado_em is null then
    raise exception 'Assine o levantamento antes de enviar' using errcode = '22023';
  end if;
  update public.levantamentos set
    status = 'enviado', enviado_em = now(),
    devolvido_por = null, devolvido_por_nome = null, devolvido_em = null, devolvido_motivo = null
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.lev_preaprovar(p_id uuid)
returns public.levantamentos
language plpgsql security definer set search_path = public
as $$
declare r public.levantamentos;
begin
  if public.meu_papel() not in ('analista', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o analista pré-aprova' using errcode = '42501';
  end if;
  select * into r from public.levantamentos where id = p_id for update;
  if not found then raise exception 'Levantamento não encontrado'; end if;
  if r.status <> 'enviado' then
    raise exception 'Só dá para pré-aprovar um levantamento enviado (situação atual: %)', r.status using errcode = '22023';
  end if;
  update public.levantamentos set
    status = 'preaprovado', preaprovado_por = auth.uid(), preaprovado_por_nome = public.meu_nome(), preaprovado_em = now()
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.lev_aprovar(p_id uuid)
returns public.levantamentos
language plpgsql security definer set search_path = public
as $$
declare r public.levantamentos;
begin
  if public.meu_papel() not in ('engenheiro', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o engenheiro aprova' using errcode = '42501';
  end if;
  select * into r from public.levantamentos where id = p_id for update;
  if not found then raise exception 'Levantamento não encontrado'; end if;
  if r.status <> 'preaprovado' then
    raise exception 'O levantamento precisa ser pré-aprovado pelo analista antes (situação atual: %)', r.status using errcode = '22023';
  end if;
  update public.levantamentos set
    status = 'aprovado', aprovado_por = auth.uid(), aprovado_por_nome = public.meu_nome(), aprovado_em = now(),
    codigo = coalesce(codigo, 'LEV-' || lpad(nextval('public.lev_codigo_seq')::text, 5, '0'))
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.lev_devolver(p_id uuid, p_motivo text)
returns public.levantamentos
language plpgsql security definer set search_path = public
as $$
declare r public.levantamentos; v_papel public.papel := public.meu_papel();
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo da devolução' using errcode = '22023';
  end if;
  select * into r from public.levantamentos where id = p_id for update;
  if not found then raise exception 'Levantamento não encontrado'; end if;
  if not (
       (v_papel = 'analista' and r.status = 'enviado')
    or (v_papel in ('engenheiro', 'proprietario') and r.status in ('enviado', 'preaprovado'))
  ) then
    raise exception 'Você não pode devolver este levantamento na situação atual (%)', r.status using errcode = '42501';
  end if;
  update public.levantamentos set
    status = 'devolvido', devolvido_por = auth.uid(), devolvido_por_nome = public.meu_nome(), devolvido_em = now(),
    devolvido_motivo = trim(p_motivo),
    preaprovado_por = null, preaprovado_por_nome = null, preaprovado_em = null
  where id = p_id returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Transições da NC
--   aberta → tratativa (engenheiro) → encerrada (engenheiro)
--   aberta → improcedente (analista ou engenheiro), com motivo
-- A NC só é tratada depois que o RDO dela foi enviado.
-- ---------------------------------------------------------------------
create or replace function public.nc_tratar(p_id uuid, p_texto text)
returns public.ncs
language plpgsql security definer set search_path = public
as $$
declare n public.ncs; v_rdo public.rdo_status;
begin
  if public.meu_papel() not in ('engenheiro', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o engenheiro coloca a NC em tratativa' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_texto, ''))) < 3 then
    raise exception 'Descreva a tratativa' using errcode = '22023';
  end if;
  select * into n from public.ncs where id = p_id for update;
  if not found then raise exception 'NC não encontrada'; end if;
  select status into v_rdo from public.rdos where id = n.rdo_id;
  if v_rdo in ('rascunho', 'devolvido') then
    raise exception 'O RDO desta NC ainda não foi enviado' using errcode = '22023';
  end if;
  if n.status <> 'aberta' then
    raise exception 'Só uma NC aberta entra em tratativa (situação atual: %)', n.status using errcode = '22023';
  end if;
  update public.ncs set
    status = 'tratativa', tratativa = trim(p_texto), tratativa_por = auth.uid(), tratativa_por_nome = public.meu_nome(), tratativa_em = now(),
    codigo = coalesce(codigo, 'NC-' || lpad(nextval('public.nc_codigo_seq')::text, 5, '0'))
  where id = p_id returning * into n;
  return n;
end $$;

create or replace function public.nc_encerrar(p_id uuid, p_texto text)
returns public.ncs
language plpgsql security definer set search_path = public
as $$
declare n public.ncs;
begin
  if public.meu_papel() not in ('engenheiro', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só o engenheiro encerra a NC' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_texto, ''))) < 3 then
    raise exception 'Descreva como a NC foi resolvida' using errcode = '22023';
  end if;
  select * into n from public.ncs where id = p_id for update;
  if not found then raise exception 'NC não encontrada'; end if;
  if n.status <> 'tratativa' then
    raise exception 'Só uma NC em tratativa pode ser encerrada (situação atual: %)', n.status using errcode = '22023';
  end if;
  update public.ncs set
    status = 'encerrada', encerramento = trim(p_texto), encerrada_por = auth.uid(), encerrada_por_nome = public.meu_nome(), encerrada_em = now()
  where id = p_id returning * into n;
  return n;
end $$;

create or replace function public.nc_improcedente(p_id uuid, p_motivo text)
returns public.ncs
language plpgsql security definer set search_path = public
as $$
declare n public.ncs; v_rdo public.rdo_status;
begin
  if public.meu_papel() not in ('analista', 'engenheiro', 'proprietario') or public.meu_papel() is null then
    raise exception 'Só analista ou engenheiro classificam a NC' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva por que a NC não procede' using errcode = '22023';
  end if;
  select * into n from public.ncs where id = p_id for update;
  if not found then raise exception 'NC não encontrada'; end if;
  select status into v_rdo from public.rdos where id = n.rdo_id;
  if v_rdo in ('rascunho', 'devolvido') then
    raise exception 'O RDO desta NC ainda não foi enviado' using errcode = '22023';
  end if;
  if n.status <> 'aberta' then
    raise exception 'Só uma NC aberta pode ser marcada como não procede (situação atual: %)', n.status using errcode = '22023';
  end if;
  update public.ncs set status = 'improcedente', improcedente_motivo = trim(p_motivo)
  where id = p_id returning * into n;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Permissões de execução: nenhuma função pública para quem não fez login
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant execute on function
  public.meu_papel(), public.e_ativo(), public.e_gestao(), public.meu_nome(),
  public.definir_papel(uuid, public.papel), public.atualizar_meu_nome(text),
  public.pode_ver(text, uuid), public.pode_editar(text, uuid),
  public.pode_ver_arquivo(text), public.pode_editar_arquivo(text), public.caminho_entidade(text),
  public.chamada_do_app(), public.nome_de(uuid), public.diff_jsonb(jsonb, jsonb),
  public.rdo_enviar(uuid), public.rdo_prevalidar(uuid), public.rdo_validar(uuid), public.rdo_devolver(uuid, text),
  public.lev_enviar(uuid), public.lev_preaprovar(uuid), public.lev_aprovar(uuid), public.lev_devolver(uuid, text),
  public.nc_tratar(uuid, text), public.nc_encerrar(uuid, text), public.nc_improcedente(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------
-- Armazenamento privado de arquivos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy anexos_arquivo_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ver_arquivo(name));

create policy anexos_arquivo_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_editar_arquivo(name));

create policy anexos_arquivo_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.pode_editar_arquivo(name));
