import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DadosLev, type DadosRdo, type NcStatus, type Pano, type Tipo,
  STATUS_LEV, STATUS_NC, STATUS_RDO, brData, brDataHora, fkm, fmt, totais,
} from "../dominio";
import { eGestao, nomeObra, useApp } from "../contexto";
import { msgErro, sb, urlArquivo } from "../supabase";
import { Panos } from "../componentes/Panos";
import { AreaTexto, Aviso, Folha, Icone, Selecao } from "../componentes/ui";

export interface Registro {
  id: string; numero: number; codigo: string | null; obra_id: string | null; data: string; tecnico_id: string; tecnico_nome: string;
  status: string; dados: DadosRdo | DadosLev; assinante: string | null; assinado_em: string | null; enviado_em: string | null;
  devolvido_motivo: string | null; devolvido_por_nome: string | null; devolvido_em: string | null;
  prevalidado_por_nome?: string | null; prevalidado_em?: string | null; validado_por_nome?: string | null; validado_em?: string | null;
  preaprovado_por_nome?: string | null; preaprovado_em?: string | null; aprovado_por_nome?: string | null; aprovado_em?: string | null;
  atualizado_em: string;
}
export interface NcReg {
  id: string; numero: number; codigo: string | null; rdo_id: string; status: NcStatus; tipo: string; gravidade: string; descricao: string;
  acao_sugerida: string; local: { rodovia?: string; sentido?: string; faixa?: string; km_inicial?: number | null; km_final?: number | null; hora?: string };
  tratativa: string | null; tratativa_por_nome: string | null; encerramento: string | null; encerrada_por_nome: string | null; improcedente_motivo: string | null;
}

const cfg = {
  rdo: {
    tabela: "rdos", nome: "RDO", nomes: "RDOs", rotulos: STATUS_RDO as Record<string, string>,
    pre: "prevalidado", fim: "validado", rpcPre: "rdo_prevalidar", rpcFim: "rdo_validar", rpcDev: "rdo_devolver",
    verboPre: "Pré-validar", verboFim: "Validar", msgPre: "RDO pré-validado. Agora vai para o engenheiro",
  },
  lev: {
    tabela: "levantamentos", nome: "Levantamento", nomes: "Levantamentos", rotulos: STATUS_LEV as Record<string, string>,
    pre: "preaprovado", fim: "aprovado", rpcPre: "lev_preaprovar", rpcFim: "lev_aprovar", rpcDev: "lev_devolver",
    verboPre: "Pré-aprovar", verboFim: "Aprovar", msgPre: "Levantamento pré-aprovado. Agora vai para o engenheiro",
  },
};

export function Painel({ tipo, aoCorrigir }: { tipo: Tipo; aoCorrigir: (r: Registro, ncs: NcReg[]) => void }) {
  const C = cfg[tipo];
  const { perfil, obras, aviso } = useApp();
  const gestao = eGestao(perfil.papel);
  const [lista, setLista] = useState<Registro[]>([]);
  const [ncsAbertas, setNcsAbertas] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Registro | null>(null);
  const filtroInicial = perfil.papel === "analista" ? "enviado" : perfil.papel === "engenheiro" ? C.pre : "";
  const [f, setF] = useState({ status: filtroInicial, obra: "", de: "", ate: "", busca: "", soNc: false });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    let q = sb.from(C.tabela).select("*").neq("status", "rascunho").order("data", { ascending: false }).order("numero", { ascending: false }).limit(500);
    if (f.obra) q = q.eq("obra_id", f.obra);
    if (f.de) q = q.gte("data", f.de);
    if (f.ate) q = q.lte("data", f.ate);
    const { data, error } = await q;
    if (error) setErro(msgErro(error));
    else setLista((data ?? []) as Registro[]);
    if (tipo === "rdo") {
      const { data: n } = await sb.from("ncs").select("rdo_id,status").in("status", ["aberta", "tratativa"]);
      const m: Record<string, number> = {};
      for (const x of n ?? []) m[x.rdo_id as string] = (m[x.rdo_id as string] ?? 0) + 1;
      setNcsAbertas(m);
    }
    setCarregando(false);
  }, [C.tabela, f.obra, f.de, f.ate, tipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = useMemo(() => {
    const b = f.busca.trim().toLowerCase();
    return lista.filter((r) =>
      (!f.status || r.status === f.status) &&
      (!f.soNc || ncsAbertas[r.id]) &&
      (!b || `${r.tecnico_nome} ${r.codigo ?? ""} ${r.numero} ${(r.dados as DadosRdo).equipe ?? ""}`.toLowerCase().includes(b)));
  }, [lista, f.status, f.busca, f.soNc, ncsAbertas]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of lista) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [lista]);
  const tot = useMemo(() => totais(filtrada.flatMap((r) => r.dados.panos ?? [])), [filtrada]);

  function exportar() {
    const linhas: (string | number)[][] = [["Código", "Nº", "Data", "Obra", "Técnico", "Situação", "Pano", "Rodovia", "Sentido", "Faixa", "km inicial", "km final", "Serviço", "Comprimento (m)", "Largura (m)", "Espessura (cm)", "Área (m²)", "Toneladas", "Validado/aprovado por", "Em"]];
    for (const r of filtrada) {
      const quem = tipo === "rdo" ? r.validado_por_nome : r.aprovado_por_nome;
      const em = tipo === "rdo" ? r.validado_em : r.aprovado_em;
      const base = [r.codigo ?? "", r.numero, brData(r.data), nomeObra(obras, r.obra_id), r.tecnico_nome, C.rotulos[r.status] ?? r.status];
      const ps: Pano[] = r.dados.panos ?? [];
      if (!ps.length) linhas.push([...base, "", "", "", "", "", "", "", "", "", "", "", "", quem ?? "", brDataHora(em)]);
      ps.forEach((p, i) => linhas.push([...base, p.numero ?? i + 1, p.rodovia, p.sentido, p.faixa, fkm(p.km_inicial), fkm(p.km_final), p.servico,
        fmt(p.comprimento_m, 2), fmt(p.largura_m, 2), fmt(p.espessura_cm, 1), fmt((p.comprimento_m ?? 0) * (p.largura_m ?? 0), 2), fmt(p.toneladas, 2), quem ?? "", brDataHora(em)]));
    }
    const csv = "﻿" + linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${C.nomes.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="painel">
      <div className="titulo-painel">
        <h2>Painel de {C.nomes}</h2>
        <button className="btn pequeno" onClick={exportar} disabled={!filtrada.length}>Exportar (Excel)</button>
      </div>
      <div className="chips-status">
        <button className="chip" aria-pressed={!f.status} onClick={() => setF({ ...f, status: "" })}>Todos ({lista.length})</button>
        {Object.entries(C.rotulos).filter(([k]) => k !== "rascunho").map(([k, t]) => (
          <button key={k} className={`chip st-${k}`} aria-pressed={f.status === k} onClick={() => setF({ ...f, status: f.status === k ? "" : k })}>
            {t} ({contagem[k] ?? 0})
          </button>
        ))}
        {tipo === "rdo" && <button className="chip alerta" aria-pressed={f.soNc} onClick={() => setF({ ...f, soNc: !f.soNc })}>Com NC em aberto</button>}
      </div>
      <div className="filtros">
        <label className="campo"><span className="rotulo">Obra</span><Selecao valor={f.obra} vazio="Todas" opcoes={obras.map((o) => ({ v: o.id, t: o.nome }))} onChange={(v) => setF({ ...f, obra: v })} /></label>
        <label className="campo"><span className="rotulo">De</span><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></label>
        <label className="campo"><span className="rotulo">Até</span><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></label>
        {gestao && <label className="campo"><span className="rotulo">Buscar</span><input type="search" value={f.busca} placeholder="Técnico, código, equipe" onChange={(e) => setF({ ...f, busca: e.target.value })} /></label>}
      </div>
      <div className="kpis">
        <div className="kpi"><b>{filtrada.length}</b><span>{C.nomes.toLowerCase()} na lista</span></div>
        <div className="kpi"><b>{fmt(tot.area)}</b><span>m² de panos</span></div>
        <div className="kpi"><b>{fmt(tot.ext)}</b><span>metros</span></div>
        {tipo === "rdo" && <div className="kpi"><b>{fmt(tot.ton, 1)}</b><span>toneladas</span></div>}
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando ? <p className="vazio"><span className="giro" /> Carregando…</p> : !filtrada.length ? (
        <p className="vazio">{f.status === filtroInicial && filtroInicial ? "Nada aguardando você agora." : "Nenhum registro com esses filtros."}</p>
      ) : (
        <div className="lista-registros">
          {filtrada.map((r) => {
            const d = new Date(r.data + "T12:00:00");
            const t = totais(r.dados.panos ?? []);
            return (
              <button key={r.id} className="registro" onClick={() => setAberto(r)}>
                <span className="data-bloco"><b>{d.getDate()}</b><span>{d.toLocaleDateString("pt-BR", { month: "short" })}</span></span>
                <span className="meio">
                  <b>{r.codigo ?? `${C.nome} nº ${r.numero}`} · {nomeObra(obras, r.obra_id)}</b>
                  <span>{r.tecnico_nome}{(r.dados as DadosRdo).equipe ? ` · ${(r.dados as DadosRdo).equipe}` : ""} · {t.n} panos</span>
                  <span className={`selo st-${r.status}`}>{C.rotulos[r.status]}</span>
                  {ncsAbertas[r.id] ? <span className="selo alerta"><Icone nome="alerta" /> {ncsAbertas[r.id]} NC</span> : null}
                </span>
                <span className="num">{fmt(t.area)}<small>m²</small></span>
              </button>
            );
          })}
        </div>
      )}
      {aberto && (
        <Detalhe tipo={tipo} reg={aberto} aoFechar={() => setAberto(null)}
          aoMudou={(msg) => { aviso(msg); setAberto(null); carregar(); }}
          aoCorrigir={(ncs) => { setAberto(null); aoCorrigir(aberto, ncs); }} />
      )}
    </div>
  );
}

function Detalhe(p: { tipo: Tipo; reg: Registro; aoFechar: () => void; aoMudou: (msg: string) => void; aoCorrigir: (ncs: NcReg[]) => void }) {
  const C = cfg[p.tipo];
  const { perfil, obras } = useApp();
  const r = p.reg;
  const papel = perfil.papel;
  const [anexos, setAnexos] = useState<{ id: string; tipo: string; categoria: string; legenda: string; path: string; lat: number | null; lon: number | null; url?: string }[]>([]);
  const [ncs, setNcs] = useState<NcReg[]>([]);
  const [hist, setHist] = useState<{ id: number; acao: string; motivo: string | null; por_nome: string | null; em: string; detalhe: Record<string, { de: unknown; para: unknown }> | null }[]>([]);
  const [acao, setAcao] = useState<{ tipo: "devolver" | "nc-tratar" | "nc-encerrar" | "nc-improcedente"; ncId?: string } | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [corrigindo, setCorrigindo] = useState<{ panos: Pano[]; observacoes: string } | null>(null);

  const carregar = useCallback(async () => {
    const [a, n, h] = await Promise.all([
      sb.from("anexos").select("*").eq("entidade", p.tipo).eq("entidade_id", r.id).order("criado_em"),
      p.tipo === "rdo" ? sb.from("ncs").select("*").eq("rdo_id", r.id).order("numero") : Promise.resolve({ data: [] as NcReg[] }),
      sb.from("historico").select("*").eq("entidade", p.tipo).eq("entidade_id", r.id).order("em"),
    ]);
    const lista = (a.data ?? []) as typeof anexos;
    const comUrl = await Promise.all(lista.map(async (x) => ({ ...x, url: (await urlArquivo(x.path)) ?? undefined })));
    setAnexos(comUrl);
    setNcs((n.data ?? []) as NcReg[]);
    setHist((h.data ?? []) as typeof hist);
  }, [p.tipo, r.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const st = r.status;
  const podePre = st === "enviado" && (papel === "analista" || papel === "proprietario");
  const podeFim = st === C.pre && (papel === "engenheiro" || papel === "proprietario");
  const podeDev = (papel === "analista" && st === "enviado") || ((papel === "engenheiro" || papel === "proprietario") && (st === "enviado" || st === C.pre));
  const podeCorrigirGestao = podeDev;
  const ncAberta = ncs.some((n) => n.status === "aberta");
  const meuDevolvido = st === "devolvido" && r.tecnico_id === perfil.id;

  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    setOcupado(true);
    setErro("");
    const { error } = await sb.rpc(nome, args);
    setOcupado(false);
    if (error) { setErro(msgErro(error)); return false; }
    p.aoMudou(ok);
    return true;
  }
  async function rpcNc(nome: string, args: Record<string, unknown>) {
    setOcupado(true);
    setErro("");
    const { error } = await sb.rpc(nome, args);
    setOcupado(false);
    if (error) { setErro(msgErro(error)); return; }
    setAcao(null);
    setTexto("");
    carregar();
  }
  async function salvarCorrecao() {
    if (!corrigindo) return;
    setOcupado(true);
    setErro("");
    const dados = { ...r.dados, panos: corrigindo.panos, observacoes: corrigindo.observacoes };
    const { error } = await sb.from(C.tabela).update({ dados }).eq("id", r.id);
    setOcupado(false);
    if (error) { setErro(msgErro(error)); return; }
    p.aoMudou("Correção salva e registrada no histórico");
  }

  const d = r.dados as DadosRdo & DadosLev;
  const t = totais(d.panos ?? []);
  const fotos = anexos.filter((a) => a.tipo !== "assinatura");
  const assinatura = anexos.filter((a) => a.tipo === "assinatura").at(-1); // a mais recente (após correção)
  const ROT_HIST: Record<string, string> = {
    criado: "Criado", enviado: "Enviado", prevalidado: "Pré-validado", validado: "Validado", preaprovado: "Pré-aprovado", aprovado: "Aprovado",
    devolvido: "Devolvido", correcao: "Corrigido pela gestão", aberta: "NC aberta", tratativa: "NC em tratativa", encerrada: "NC encerrada", improcedente: "NC não procede",
  };

  return (
    <Folha titulo={`${r.codigo ?? `${C.nome} nº ${r.numero}`} · ${brData(r.data)}`} aoFechar={p.aoFechar}
      rodape={
        <>
          {meuDevolvido && <button className="btn pri" onClick={() => p.aoCorrigir(ncs)}>Corrigir e reenviar</button>}
          {podeDev && !acao && !corrigindo && <button className="btn perigo" onClick={() => { setAcao({ tipo: "devolver" }); setTexto(""); }}>Devolver</button>}
          {podeCorrigirGestao && !corrigindo && !acao && (
            <button className="btn" onClick={() => setCorrigindo({ panos: structuredClone(d.panos ?? []), observacoes: d.observacoes ?? "" })}>Corrigir dados</button>
          )}
          {podePre && !acao && !corrigindo && <button className="btn pri" disabled={ocupado} onClick={() => rpc(C.rpcPre, { p_id: r.id }, C.msgPre)}>{C.verboPre}</button>}
          {podeFim && !acao && !corrigindo && (
            <button className="btn pri" disabled={ocupado || ncAberta} title={ncAberta ? "Trate as NCs abertas antes" : undefined}
              onClick={() => rpc(C.rpcFim, { p_id: r.id }, `${C.nome} ${p.tipo === "rdo" ? "validado" : "aprovado"}`)}>{C.verboFim}</button>
          )}
          {!podePre && !podeFim && !podeDev && !meuDevolvido && <button className="btn" onClick={p.aoFechar}>Fechar</button>}
        </>
      }>
      <span className={`selo st-${st}`}>{C.rotulos[st]}</span>
      {st === "devolvido" && r.devolvido_motivo && <Aviso tipo="erro"><b>Motivo da devolução</b> ({r.devolvido_por_nome}): {r.devolvido_motivo}</Aviso>}
      {podeFim && ncAberta && <Aviso tipo="alerta">Há NC aberta neste RDO. Coloque em tratativa ou marque "não procede" antes de validar.</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {acao?.tipo === "devolver" && (
        <div className="cartao destaque">
          <h3>Devolver ao técnico</h3>
          <AreaTexto valor={texto} onChange={setTexto} placeholder="O que precisa ser corrigido" />
          <div className="linha-botoes">
            <button className="btn" onClick={() => setAcao(null)}>Cancelar</button>
            <button className="btn perigo" disabled={texto.trim().length < 3 || ocupado} onClick={() => rpc(C.rpcDev, { p_id: r.id, p_motivo: texto }, `${C.nome} devolvido ao técnico`)}>Confirmar devolução</button>
          </div>
        </div>
      )}

      {corrigindo && (
        <div className="cartao destaque">
          <h3>Corrigir dados</h3>
          <p className="dica">A correção fica registrada no histórico com o que mudou e quem mudou. A assinatura do técnico continua a original.</p>
          <Panos panos={corrigindo.panos} mudar={(v) => setCorrigindo({ ...corrigindo, panos: v })} auto={{}} comToneladas={p.tipo === "rdo"} />
          <label className="campo"><span className="rotulo">Observações</span><AreaTexto valor={corrigindo.observacoes} onChange={(v) => setCorrigindo({ ...corrigindo, observacoes: v })} /></label>
          <div className="linha-botoes">
            <button className="btn" onClick={() => setCorrigindo(null)}>Cancelar</button>
            <button className="btn pri" disabled={ocupado} onClick={salvarCorrecao}>Salvar correção</button>
          </div>
        </div>
      )}

      <dl className="kv">
        <dt>Obra</dt><dd>{nomeObra(obras, r.obra_id)}</dd>
        <dt>Técnico</dt><dd>{r.tecnico_nome}</dd>
        {p.tipo === "rdo" ? (
          <>
            <dt>Turno / equipe</dt><dd>{d.turno} · {d.equipe || "–"}{d.efetivo ? ` · ${d.efetivo} pessoas` : ""}</dd>
            <dt>Clima</dt><dd>{[d.clima_manha, d.clima_tarde, d.clima_noite].filter(Boolean).join(" / ")}{d.chuva_paralisou ? ` · chuva parou ${fmt(d.horas_paradas, 1)} h` : ""}</dd>
            <dt>Equipamentos</dt><dd>{d.equipamentos?.length ? d.equipamentos.map((e) => `${e.quantidade} ${e.nome}`).join(", ") : "–"}</dd>
            <dt>Produção</dt><dd>{d.sem_producao ? "Sem produção" : `${t.n} panos · ${fmt(t.ext)} m · ${fmt(t.area)} m² · ${fmt(t.ton, 1)} t`}</dd>
            <dt>Massa recebida</dt><dd>{d.cargas?.length ? d.cargas.map((c) => `${c.usina || "?"} ${c.mistura} ${fmt(c.toneladas, 1)} t`).join("; ") : "–"}</dd>
            <dt>Pintura</dt><dd>{d.equipe_pintura || "–"}{d.pintura_m2 ? ` · ${fmt(d.pintura_m2)} m²` : ""}</dd>
            <dt>Liberações</dt><dd>massa {d.sem_massa ? "não houve" : d.liberacao_massa || "–"} · pista {d.liberacao_pista || "–"}</dd>
          </>
        ) : (
          <>
            <dt>Motivo</dt><dd>{d.motivo}</dd>
            <dt>Empresa / equipe</dt><dd>{d.empresa || "–"}</dd>
            <dt>Panos</dt><dd>{t.n} · {fmt(t.ext)} m · {fmt(t.area)} m²</dd>
          </>
        )}
      </dl>

      {(d.panos ?? []).length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>#</th><th>Rodovia</th><th>Sentido</th><th>Faixa</th><th>km</th><th>Serviço</th><th>C × L × E</th><th>m²</th>{p.tipo === "rdo" && <th>t</th>}</tr></thead>
            <tbody>{d.panos.map((x, i) => (
              <tr key={x.id ?? i}><td>{x.numero ?? i + 1}</td><td>{x.rodovia}</td><td>{x.sentido}</td><td>{x.faixa}</td><td>{fkm(x.km_inicial)} a {fkm(x.km_final)}</td><td>{x.servico}</td>
                <td>{fmt(x.comprimento_m, 1)} × {fmt(x.largura_m, 2)} × {fmt(x.espessura_cm, 1)}</td><td>{fmt((x.comprimento_m ?? 0) * (x.largura_m ?? 0))}</td>{p.tipo === "rdo" && <td>{fmt(x.toneladas, 1)}</td>}</tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {p.tipo === "rdo" && d.ocorrencias?.length > 0 && (
        <><h3 className="sub">Ocorrências</h3><ul>{d.ocorrencias.map((o) => <li key={o.id}>{o.hora && <b>{o.hora} </b>}{o.descricao}</li>)}</ul></>
      )}
      {d.observacoes && <><h3 className="sub">Observações</h3><p className="pre">{d.observacoes}</p></>}
      {d.falas?.length > 0 && (
        <details className="falas"><summary>Falas do técnico ({d.falas.length})</summary>
          <ul>{d.falas.map((f) => <li key={f.id}><small>{brDataHora(f.em)}</small><br />{f.texto}</li>)}</ul>
        </details>
      )}

      {p.tipo === "rdo" && (
        <>
          <h3 className="sub">Não conformidades ({ncs.length})</h3>
          {!ncs.length && <p className="dica">Nenhuma NC indicada neste RDO.</p>}
          {ncs.map((n) => {
            const podeTratar = n.status === "aberta" && st !== "devolvido" && (papel === "engenheiro" || papel === "proprietario");
            const podeImproc = n.status === "aberta" && st !== "devolvido" && gestaoAnalisa(papel);
            const podeEncerrar = n.status === "tratativa" && (papel === "engenheiro" || papel === "proprietario");
            return (
              <div key={n.id} className={`cartao nc nc-${n.status}`}>
                <div className="topo-nc">
                  <b><Icone nome="alerta" /> {n.codigo ?? `NC nº ${n.numero}`} · {n.tipo}</b>
                  <span className={`selo nc-${n.status}`}>{STATUS_NC[n.status]}</span>
                </div>
                <p>{n.gravidade && <b>Gravidade {n.gravidade}. </b>}{n.descricao}</p>
                <p className="dica">{[n.local?.rodovia, n.local?.sentido, n.local?.faixa && `faixa ${n.local.faixa}`, n.local?.km_inicial != null && `km ${fkm(n.local.km_inicial)}${n.local.km_final != null ? ` a ${fkm(n.local.km_final)}` : ""}`, n.local?.hora].filter(Boolean).join(" · ")}</p>
                {n.acao_sugerida && <p><b>Ação sugerida:</b> {n.acao_sugerida}</p>}
                {n.tratativa && <p><b>Tratativa</b> ({n.tratativa_por_nome}): {n.tratativa}</p>}
                {n.encerramento && <p><b>Encerramento</b> ({n.encerrada_por_nome}): {n.encerramento}</p>}
                {n.improcedente_motivo && <p><b>Não procede:</b> {n.improcedente_motivo}</p>}
                {acao?.ncId === n.id ? (
                  <div>
                    <AreaTexto valor={texto} onChange={setTexto} placeholder={acao.tipo === "nc-tratar" ? "O que será feito" : acao.tipo === "nc-encerrar" ? "Como foi resolvido" : "Por que não procede"} />
                    <div className="linha-botoes">
                      <button className="btn" onClick={() => setAcao(null)}>Cancelar</button>
                      <button className="btn pri" disabled={texto.trim().length < 3 || ocupado}
                        onClick={() => rpcNc(acao.tipo === "nc-tratar" ? "nc_tratar" : acao.tipo === "nc-encerrar" ? "nc_encerrar" : "nc_improcedente",
                          acao.tipo === "nc-improcedente" ? { p_id: n.id, p_motivo: texto } : { p_id: n.id, p_texto: texto })}>Confirmar</button>
                    </div>
                  </div>
                ) : (
                  <div className="linha-botoes">
                    {podeTratar && <button className="btn pequeno pri" onClick={() => { setAcao({ tipo: "nc-tratar", ncId: n.id }); setTexto(""); }}>Colocar em tratativa</button>}
                    {podeImproc && <button className="btn pequeno" onClick={() => { setAcao({ tipo: "nc-improcedente", ncId: n.id }); setTexto(""); }}>Não procede</button>}
                    {podeEncerrar && <button className="btn pequeno pri" onClick={() => { setAcao({ tipo: "nc-encerrar", ncId: n.id }); setTexto(""); }}>Encerrar NC</button>}
                  </div>
                )}
                <FotosNc ncId={n.id} />
              </div>
            );
          })}
        </>
      )}

      <h3 className="sub">Fotos ({fotos.length})</h3>
      <div className="grade-fotos">
        {fotos.map((a) => (
          <button key={a.id} className="foto" onClick={() => a.url && setFoto(a.url)}>
            <div className="img">{a.url ? <img src={a.url} alt={a.categoria} loading="lazy" /> : <span className="sem-img">…</span>}
              <span className={`etiqueta ${a.tipo === "ficha" ? "ficha" : ""}`}>{a.categoria || a.tipo}</span></div>
            {a.legenda && <span className="legenda-txt">{a.legenda}</span>}
          </button>
        ))}
      </div>

      {r.assinante && (
        <div className="assinado">
          {assinatura?.url && <div className="assinatura-img"><img src={assinatura.url} alt="Assinatura" /></div>}
          <p>Assinado por <b>{r.assinante}</b> em {brDataHora(r.assinado_em)}</p>
        </div>
      )}

      <h3 className="sub">Histórico</h3>
      <ol className="historico">
        {hist.map((h) => (
          <li key={h.id}>
            <b>{ROT_HIST[h.acao] ?? h.acao}</b> por {h.por_nome ?? "–"} em {brDataHora(h.em)}
            {h.motivo && <> — “{h.motivo}”</>}
            {h.acao === "correcao" && h.detalhe && <span className="dica"> (campos alterados: {Object.keys(h.detalhe).join(", ")})</span>}
          </li>
        ))}
      </ol>
      {foto && <div className="foto-cheia" onClick={() => setFoto(null)}><img src={foto} alt="Foto ampliada" /></div>}
    </Folha>
  );
}

const gestaoAnalisa = (papel: string) => papel === "analista" || papel === "engenheiro" || papel === "proprietario";

function FotosNc({ ncId }: { ncId: string }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let vivo = true;
    sb.from("anexos").select("path").eq("entidade", "nc").eq("entidade_id", ncId).then(async ({ data }) => {
      const u = await Promise.all((data ?? []).map((x) => urlArquivo(x.path as string)));
      if (vivo) setUrls(u.filter(Boolean) as string[]);
    });
    return () => { vivo = false; };
  }, [ncId]);
  if (!urls.length) return null;
  return <div className="mini-fotos">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Foto da NC" /></a>)}</div>;
}
