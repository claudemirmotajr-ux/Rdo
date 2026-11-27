-- Testes das regras de permissão e dos fluxos de aprovação.
-- Rodar com:  supabase/tests/rodar_testes.sh
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Ferramentas de teste
-- ---------------------------------------------------------------------
create schema t;
grant usage on schema t to anon, authenticated;

create function t.deve_falhar(p_sql text, p_descr text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok   bloqueado: %  [%]', p_descr, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: deveria ter sido bloqueado: %', p_descr;
end $$;

create function t.afeta(p_sql text, p_esperado int, p_descr text) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_esperado then
    raise exception 'FALHOU: % (afetou % linhas, esperado %)', p_descr, n, p_esperado;
  end if;
  raise notice 'ok   %', p_descr;
end $$;

create function t.conta(p_sql text, p_esperado int, p_descr text) returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  if n <> p_esperado then
    raise exception 'FALHOU: % (achou %, esperado %)', p_descr, n, p_esperado;
  end if;
  raise notice 'ok   %', p_descr;
end $$;

create function t.igual(p_valor text, p_esperado text, p_descr text) returns void language plpgsql as $$
begin
  if p_valor is distinct from p_esperado then
    raise exception 'FALHOU: % (veio %, esperado %)', p_descr, coalesce(p_valor, 'NULL'), coalesce(p_esperado, 'NULL');
  end if;
  raise notice 'ok   %', p_descr;
end $$;

grant execute on all functions in schema t to anon, authenticated;

\set dono '00000000-0000-0000-0000-000000000001'
\set tec1 '00000000-0000-0000-0000-000000000002'
\set tec2 '00000000-0000-0000-0000-000000000003'
\set ana  '00000000-0000-0000-0000-000000000004'
\set eng  '00000000-0000-0000-0000-000000000005'
\set pend '00000000-0000-0000-0000-000000000006'

-- ---------------------------------------------------------------------
\warn '== Cadastro de contas'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'dono', 'dono@obra.test', '{"nome":"Dona da Obra"}'),
  (:'tec1', 'tec1@obra.test', '{"nome":"Técnico Um"}'),
  (:'tec2', 'tec2@obra.test', '{"nome":"Técnico Dois"}'),
  (:'ana',  'ana@obra.test',  '{"nome":"Analista"}'),
  (:'eng',  'eng@obra.test',  '{"nome":"Engenheiro"}'),
  (:'pend', 'pend@obra.test', '{"nome":"Sem papel"}');

select t.igual((select papel::text from public.profiles where id = :'dono'), 'proprietario', 'primeira conta vira proprietário');
select t.igual((select papel::text from public.profiles where id = :'tec1'), 'pendente', 'contas seguintes entram como pendente');

-- ---------------------------------------------------------------------
\warn '== Conta pendente não acessa nada'
set role authenticated;
select set_config('request.jwt.claim.sub', :'tec1', false);
select t.deve_falhar($$select public.definir_papel(auth.uid(), 'proprietario')$$, 'pendente não se promove');
select t.afeta($$update public.profiles set papel = 'proprietario' where id = auth.uid()$$, 0, 'pendente não altera o próprio papel direto na tabela');

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :'dono', false);
select public.definir_papel(:'tec1', 'tecnico');
select public.definir_papel(:'tec2', 'tecnico');
select public.definir_papel(:'ana', 'analista');
select public.definir_papel(:'eng', 'engenheiro');
select t.deve_falhar(format('select public.definir_papel(%L, %L)', :'dono', 'engenheiro'), 'último proprietário não pode se rebaixar');
insert into public.obras (nome, rodovia) values ('Reabilitação SP-310', 'SP 310') returning id as obra \gset
insert into public.cadastros (tipo, nome) values ('usina', 'Usina Teste');

select set_config('request.jwt.claim.sub', :'pend', false);
select t.conta('select * from public.obras', 0, 'pendente não vê obras');
select t.deve_falhar($$insert into public.rdos (data) values (current_date)$$, 'pendente não cria RDO');
select t.conta('select * from public.profiles', 1, 'pendente só vê o próprio cadastro');

-- ---------------------------------------------------------------------
\warn '== Técnico: cadastros e papéis'
select set_config('request.jwt.claim.sub', :'tec1', false);
select t.conta('select * from public.obras', 1, 'técnico vê as obras');
select t.deve_falhar($$insert into public.obras (nome) values ('Obra falsa')$$, 'técnico não cria obra');
select t.deve_falhar(format('select public.definir_papel(%L, %L)', :'tec1', 'engenheiro'), 'técnico não define papel');
select t.conta('select * from public.profiles', 1, 'técnico só vê o próprio cadastro');

-- ---------------------------------------------------------------------
\warn '== Técnico cria RDO tentando burlar situação e dono'
insert into public.rdos (obra_id, data, status, codigo, tecnico_id, validado_por, dados)
values (:'obra', current_date, 'validado', 'RDO-99999', :'tec2', :'eng', '{"panos":[]}')
returning id as rdo_a \gset
select t.igual((select status::text from public.rdos where id = :'rdo_a'), 'rascunho', 'RDO novo sempre nasce rascunho');
select t.igual((select tecnico_id::text from public.rdos where id = :'rdo_a'), :'tec1', 'RDO novo sempre é de quem criou');
select t.igual((select coalesce(codigo, 'sem') from public.rdos where id = :'rdo_a'), 'sem', 'código não pode ser inventado');
select t.igual((select tecnico_nome from public.rdos where id = :'rdo_a'), 'Técnico Um', 'nome do técnico gravado');

select t.deve_falhar(format($$update public.rdos set status = 'validado' where id = %L$$, :'rdo_a'), 'técnico não muda situação direto');
select t.deve_falhar(format($$update public.rdos set validado_por = auth.uid() where id = %L$$, :'rdo_a'), 'técnico não grava aprovação direto');
select t.deve_falhar(format('select public.rdo_prevalidar(%L)', :'rdo_a'), 'técnico não pré-valida');
select t.deve_falhar(format('select public.rdo_validar(%L)', :'rdo_a'), 'técnico não valida');
select t.deve_falhar(format('select public.rdo_enviar(%L)', :'rdo_a'), 'não envia sem assinatura');
select t.afeta(format($$update public.rdos set dados = '{"panos":[1]}', assinante = 'Técnico Um', assinado_em = now() where id = %L$$, :'rdo_a'), 1, 'técnico edita e assina o próprio rascunho');
select public.rdo_enviar(:'rdo_a');
select t.igual((select status::text from public.rdos where id = :'rdo_a'), 'enviado', 'técnico envia');
select t.afeta(format($$update public.rdos set dados = '{}' where id = %L$$, :'rdo_a'), 0, 'técnico não edita depois de enviar');
select t.afeta(format($$delete from public.rdos where id = %L$$, :'rdo_a'), 0, 'técnico não apaga RDO enviado');
select t.deve_falhar(format('select public.rdo_enviar(%L)', :'rdo_a'), 'não envia duas vezes');

-- RDO B com NC indicada pelo técnico
insert into public.rdos (obra_id, data) values (:'obra', current_date) returning id as rdo_b \gset
insert into public.ncs (rdo_id, tipo, gravidade, descricao, status, codigo)
values (:'rdo_b', 'Temperatura da massa fora da faixa', 'Alta', 'Massa chegou fria', 'encerrada', 'NC-99999')
returning id as nc_b \gset
select t.igual((select status::text || '/' || coalesce(codigo, 'sem') from public.ncs where id = :'nc_b'), 'aberta/sem', 'NC nova sempre nasce aberta e sem código');
select t.afeta(format($$update public.ncs set descricao = 'Massa chegou a 120 °C' where id = %L$$, :'nc_b'), 1, 'técnico corrige a NC enquanto o RDO é rascunho');
select t.deve_falhar(format($$update public.ncs set status = 'encerrada' where id = %L$$, :'nc_b'), 'técnico não muda situação da NC');
select t.deve_falhar(format('select public.nc_tratar(%L, %L)', :'nc_b', 'tratar'), 'técnico não trata NC');
update public.rdos set assinante = 'Técnico Um', assinado_em = now() where id = :'rdo_b';

-- anexos e arquivos do RDO B
select t.afeta(format($$insert into public.anexos (entidade, entidade_id, path) values ('rdo', %L, %L)$$, :'rdo_b', 'rdo/' || :'rdo_b' || '/foto1.jpg'), 1, 'técnico anexa foto no próprio rascunho');
select t.deve_falhar(format($$insert into public.anexos (entidade, entidade_id, path) values ('rdo', %L, %L)$$, :'rdo_b', 'rdo/' || :'rdo_a' || '/foto1.jpg'), 'anexo não pode apontar para pasta de outro registro');
select t.afeta(format($$insert into storage.objects (bucket_id, name) values ('anexos', %L)$$, 'rdo/' || :'rdo_b' || '/foto1.jpg'), 1, 'técnico sobe arquivo no próprio rascunho');
select t.deve_falhar(format($$insert into storage.objects (bucket_id, name) values ('anexos', %L)$$, 'rdo/' || :'rdo_a' || '/x.jpg'), 'técnico não sobe arquivo em RDO já enviado');
select t.deve_falhar($$insert into storage.objects (bucket_id, name) values ('anexos', 'rdo/nao-e-uuid/x.jpg')$$, 'caminho inválido é recusado');

select public.rdo_enviar(:'rdo_b');
select t.deve_falhar(format($$insert into public.ncs (rdo_id, tipo) values (%L, 'x')$$, :'rdo_b'), 'técnico não inclui NC depois de enviar o RDO');
select t.afeta(format($$update public.ncs set descricao = 'outra' where id = %L$$, :'nc_b'), 0, 'técnico não edita NC depois de enviar o RDO');
select t.deve_falhar(format($$insert into storage.objects (bucket_id, name) values ('anexos', %L)$$, 'rdo/' || :'rdo_b' || '/foto2.jpg'), 'técnico não sobe foto depois de enviar');
select t.afeta(format($$delete from storage.objects where name = %L$$, 'rdo/' || :'rdo_b' || '/foto1.jpg'), 0, 'técnico não apaga foto depois de enviar');

-- ---------------------------------------------------------------------
\warn '== Outro técnico não enxerga nem mexe'
select set_config('request.jwt.claim.sub', :'tec2', false);
select t.conta('select * from public.rdos', 0, 'técnico 2 não vê RDOs do técnico 1');
select t.conta('select * from public.ncs', 0, 'técnico 2 não vê NCs do técnico 1');
select t.conta('select * from public.anexos', 0, 'técnico 2 não vê anexos do técnico 1');
select t.conta('select * from storage.objects', 0, 'técnico 2 não abre fotos do técnico 1');
select t.conta($$select * from public.historico where entidade <> 'usuario'$$, 0, 'técnico 2 não vê histórico do técnico 1');
select t.conta($$select * from public.historico where entidade = 'usuario'$$, 1, 'técnico 2 vê só a definição do próprio papel');
select t.deve_falhar(format('select public.rdo_enviar(%L)', :'rdo_a'), 'técnico 2 não envia RDO alheio');
select t.deve_falhar(format($$insert into public.ncs (rdo_id, tipo) values (%L, 'x')$$, :'rdo_b'), 'técnico 2 não cria NC em RDO alheio');

-- ---------------------------------------------------------------------
\warn '== Ordem das aprovações'
select set_config('request.jwt.claim.sub', :'eng', false);
select t.conta('select * from public.rdos', 2, 'engenheiro vê todos os RDOs');
select t.conta('select * from storage.objects', 1, 'engenheiro abre as fotos');
select t.deve_falhar(format('select public.rdo_validar(%L)', :'rdo_b'), 'engenheiro não pula a pré-validação');

select set_config('request.jwt.claim.sub', :'ana', false);
select t.deve_falhar(format('select public.rdo_validar(%L)', :'rdo_b'), 'analista não dá a validação final');
select t.deve_falhar(format('select public.nc_tratar(%L, %L)', :'nc_b', 'x'), 'analista não coloca NC em tratativa');
select t.deve_falhar(format('select public.rdo_devolver(%L, %L)', :'rdo_b', ''), 'devolução exige motivo');
select public.rdo_prevalidar(:'rdo_b');
select t.igual((select status::text || '/' || prevalidado_por_nome from public.rdos where id = :'rdo_b'), 'prevalidado/Analista', 'analista pré-valida e fica registrado');
select t.deve_falhar(format('select public.rdo_devolver(%L, %L)', :'rdo_b', 'motivo qualquer'), 'analista não devolve o que já está com o engenheiro');
select t.afeta(format($$update public.rdos set dados = '{}' where id = %L$$, :'rdo_b'), 0, 'analista não edita o que já está com o engenheiro');

select set_config('request.jwt.claim.sub', :'eng', false);
select t.afeta(format($$update public.rdos set dados = jsonb_set(dados, '{observacoes}', '"corrigido pelo eng"') where id = %L$$, :'rdo_b'), 1, 'engenheiro corrige conteúdo pré-validado');
select t.deve_falhar(format($$update public.rdos set assinante = 'Engenheiro' where id = %L$$, :'rdo_b'), 'engenheiro não troca a assinatura do técnico');
select t.conta(format($$select * from public.historico where entidade_id = %L and acao = 'correcao' and detalhe ? 'observacoes'$$, :'rdo_b'), 1, 'correção fica no histórico com o campo alterado');
select t.deve_falhar(format('select public.rdo_validar(%L)', :'rdo_b'), 'não valida com NC aberta');
select t.deve_falhar(format('select public.nc_encerrar(%L, %L)', :'nc_b', 'resolvido'), 'não encerra NC que não está em tratativa');
select public.nc_tratar(:'nc_b', 'Remover e refazer o trecho');
select t.igual((select status::text || '/' || codigo from public.ncs where id = :'nc_b'), 'tratativa/NC-00001', 'NC em tratativa recebe código');
select public.rdo_validar(:'rdo_b');
select t.igual((select status::text || '/' || codigo || '/' || validado_por_nome from public.rdos where id = :'rdo_b'), 'validado/RDO-00001/Engenheiro', 'engenheiro valida, código e nome registrados');
select t.afeta(format($$update public.rdos set dados = '{}' where id = %L$$, :'rdo_b'), 0, 'RDO validado fica travado (nem o engenheiro edita)');
select t.deve_falhar(format('select public.rdo_devolver(%L, %L)', :'rdo_b', 'mudei de ideia'), 'RDO validado não pode ser devolvido');
select public.nc_encerrar(:'nc_b', 'Trecho refeito em 28/11');
select t.igual((select status::text from public.ncs where id = :'nc_b'), 'encerrada', 'engenheiro encerra a NC');

-- ---------------------------------------------------------------------
\warn '== Devolução e reenvio'
select set_config('request.jwt.claim.sub', :'ana', false);
select public.rdo_devolver(:'rdo_a', 'Faltou a foto da compactação');
select set_config('request.jwt.claim.sub', :'tec1', false);
select t.igual((select status::text || '/' || devolvido_motivo from public.rdos where id = :'rdo_a'), 'devolvido/Faltou a foto da compactação', 'técnico vê o motivo da devolução');
select t.afeta(format($$update public.rdos set dados = '{"panos":[1,2]}' where id = %L$$, :'rdo_a'), 1, 'técnico corrige o devolvido');
select public.rdo_enviar(:'rdo_a');
select t.igual((select status::text || '/' || coalesce(devolvido_motivo, 'limpo') from public.rdos where id = :'rdo_a'), 'enviado/limpo', 'reenvio limpa a devolução');
select t.conta(format($$select * from public.historico where entidade_id = %L$$, :'rdo_a'), 4, 'histórico guarda criado, enviado, devolvido, enviado');
select t.conta(format($$select * from public.historico where entidade_id = %L and acao = 'devolvido' and motivo = 'Faltou a foto da compactação'$$, :'rdo_a'), 1, 'motivo da devolução fica no histórico');
select t.afeta(format($$delete from public.rdos where id = %L$$, :'rdo_b'), 0, 'técnico não apaga RDO validado');

\warn '== Histórico é só leitura'
select t.deve_falhar($$insert into public.historico (entidade, entidade_id, acao) values ('rdo', gen_random_uuid(), 'validado')$$, 'ninguém grava histórico à mão');
select set_config('request.jwt.claim.sub', :'eng', false);
select t.afeta($$delete from public.historico$$, 0, 'nem o engenheiro apaga histórico');
select t.afeta($$update public.historico set motivo = 'x'$$, 0, 'nem o engenheiro altera histórico');
select set_config('request.jwt.claim.sub', :'dono', false);
select t.afeta($$delete from public.historico$$, 0, 'nem o proprietário apaga histórico');

-- ---------------------------------------------------------------------
\warn '== Levantamento'
select set_config('request.jwt.claim.sub', :'tec1', false);
insert into public.levantamentos (obra_id, data, status, codigo) values (:'obra', current_date, 'aprovado', 'LEV-99999') returning id as lev \gset
select t.igual((select status::text || '/' || coalesce(codigo, 'sem') from public.levantamentos where id = :'lev'), 'rascunho/sem', 'levantamento novo nasce rascunho');
select t.deve_falhar(format($$update public.levantamentos set status = 'aprovado' where id = %L$$, :'lev'), 'técnico não aprova levantamento direto');
update public.levantamentos set assinante = 'Técnico Um', assinado_em = now() where id = :'lev';
select public.lev_enviar(:'lev');
select set_config('request.jwt.claim.sub', :'eng', false);
select t.deve_falhar(format('select public.lev_aprovar(%L)', :'lev'), 'engenheiro não pula a pré-aprovação');
select set_config('request.jwt.claim.sub', :'ana', false);
select t.deve_falhar(format('select public.lev_aprovar(%L)', :'lev'), 'analista não dá a aprovação final');
select public.lev_preaprovar(:'lev');
select set_config('request.jwt.claim.sub', :'eng', false);
select public.lev_aprovar(:'lev');
select t.igual((select status::text || '/' || codigo from public.levantamentos where id = :'lev'), 'aprovado/LEV-00001', 'engenheiro aprova levantamento');
select set_config('request.jwt.claim.sub', :'tec2', false);
select t.conta('select * from public.levantamentos', 0, 'técnico 2 não vê levantamento do técnico 1');

-- ---------------------------------------------------------------------
\warn '== Gestão vê pessoas; quem não fez login não vê nada'
select set_config('request.jwt.claim.sub', :'ana', false);
select t.conta('select * from public.profiles', 6, 'analista vê a equipe');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select t.deve_falhar('select * from public.rdos', 'sem login não lê RDO');
select t.deve_falhar('select * from public.obras', 'sem login não lê obras');
select t.deve_falhar(format('select public.rdo_validar(%L)', :'rdo_a'), 'sem login não chama transição');
reset role;

\warn ''
\warn 'TODOS OS TESTES PASSARAM'
