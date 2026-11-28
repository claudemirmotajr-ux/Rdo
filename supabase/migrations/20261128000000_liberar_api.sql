-- Libera as tabelas para o app (papel "authenticated").
-- Projetos novos do Supabase não fazem mais isso sozinhos para tabelas
-- criadas por SQL. É seguro: quem decide o que cada pessoa vê ou altera
-- continuam sendo as regras de RLS e as funções de transição.
-- Quem não fez login (anon) continua sem acesso a nada.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function
  public.meu_papel(), public.e_ativo(), public.e_gestao(), public.meu_nome(), public.nome_de(uuid),
  public.definir_papel(uuid, public.papel), public.atualizar_meu_nome(text),
  public.pode_ver(text, uuid), public.pode_editar(text, uuid),
  public.pode_ver_arquivo(text), public.pode_editar_arquivo(text), public.caminho_entidade(text),
  public.chamada_do_app(), public.diff_jsonb(jsonb, jsonb),
  public.rdo_enviar(uuid), public.rdo_prevalidar(uuid), public.rdo_validar(uuid), public.rdo_devolver(uuid, text),
  public.lev_enviar(uuid), public.lev_preaprovar(uuid), public.lev_aprovar(uuid), public.lev_devolver(uuid, text),
  public.nc_tratar(uuid, text), public.nc_encerrar(uuid, text), public.nc_improcedente(uuid, text)
to authenticated;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
