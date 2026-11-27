import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  type DadosLev, type DadosRdo, type Rascunho, type Tipo,
  PAPEIS, brData, novaNc, novoRascunho, novosDadosLev, novosDadosRdo, totais,
} from "./dominio";
import { AppCtx, type Cadastro, type Ctx, type Obra, type Perfil, eGestao, nomeObra } from "./contexto";
import { apagarArquivosDoRascunho, gravarRascunhos, lerRascunhos } from "./locais";
import { configurado, msgErro, sb } from "./supabase";
import { Login, NovaSenha } from "./paginas/Login";
import { Formulario } from "./paginas/Formulario";
import { type NcReg, type Registro, Painel } from "./paginas/Painel";
import { Configuracoes } from "./paginas/Configuracoes";
import { Aviso, Icone } from "./componentes/ui";

type Tela = { t: "inicio" } | { t: "form"; lid: string } | { t: "painel"; tipo: Tipo } | { t: "config" } | { t: "enviado"; tipo: Tipo; numero?: string };

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") setRecuperando(true);
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configurado) {
    return <div className="tela-login"><div className="cartao login"><h2>Falta configurar</h2><p>O app ainda não está ligado ao banco de dados (Supabase).</p><p>Na Netlify, em <b>Site configuration → Environment variables</b>, crie <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> com os dados do Supabase (<b>Project Settings → API</b>) e publique de novo em <b>Deploys → Trigger deploy</b>.</p></div></div>;
  }
  if (sessao === undefined) return <div className="carregando-app"><span className="giro" /> Carregando…</div>;
  if (recuperando && sessao) return <NovaSenha aoConcluir={() => setRecuperando(false)} />;
  if (!sessao) return <Login />;
  return <Logado sessao={sessao} />;
}

function Logado({ sessao }: { sessao: Session }) {
  const uidUsuario = sessao.user.id;
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erroPerfil, setErroPerfil] = useState("");
  const [obras, setObras] = useState<Obra[]>([]);
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [rascunhos, setRascunhos] = useState<Rascunho[]>(() => lerRascunhos(uidUsuario));
  const [tela, setTela] = useState<Tela>({ t: "inicio" });
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [filas, setFilas] = useState<{ rdo: number; lev: number; devolvidos: number }>({ rdo: 0, lev: 0, devolvidos: 0 });
  const toastT = useRef<number>(undefined);

  const aviso = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(""), 3500);
  }, []);

  const carregarPerfil = useCallback(async () => {
    const { data, error } = await sb.from("profiles").select("id,nome,email,papel").eq("id", uidUsuario).single();
    if (error) setErroPerfil(msgErro(error)); else setPerfil(data as Perfil);
  }, [uidUsuario]);

  const recarregarCadastros = useCallback(async () => {
    const [o, c] = await Promise.all([
      sb.from("obras").select("*").order("nome"),
      sb.from("cadastros").select("*").order("nome"),
    ]);
    setObras((o.data ?? []) as Obra[]);
    setCadastros((c.data ?? []) as Cadastro[]);
  }, []);

  const carregarFilas = useCallback(async (p: Perfil) => {
    const conta = async (tabela: string, status: string, meu = false) => {
      let q = sb.from(tabela).select("id", { count: "exact", head: true }).eq("status", status);
      if (meu) q = q.eq("tecnico_id", p.id);
      const { count } = await q;
      return count ?? 0;
    };
    if (p.papel === "analista") setFilas({ rdo: await conta("rdos", "enviado"), lev: await conta("levantamentos", "enviado"), devolvidos: 0 });
    else if (p.papel === "engenheiro") setFilas({ rdo: await conta("rdos", "prevalidado"), lev: await conta("levantamentos", "preaprovado"), devolvidos: 0 });
    else if (p.papel === "proprietario") setFilas({ rdo: (await conta("rdos", "enviado")) + (await conta("rdos", "prevalidado")), lev: (await conta("levantamentos", "enviado")) + (await conta("levantamentos", "preaprovado")), devolvidos: 0 });
    else setFilas({ rdo: 0, lev: 0, devolvidos: (await conta("rdos", "devolvido", true)) + (await conta("levantamentos", "devolvido", true)) });
  }, []);

  useEffect(() => { carregarPerfil(); }, [carregarPerfil]);
  useEffect(() => { if (perfil && perfil.papel !== "pendente") { recarregarCadastros(); carregarFilas(perfil); } }, [perfil, recarregarCadastros, carregarFilas]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const salvarLista = useCallback((lista: Rascunho[]) => {
    setRascunhos(lista);
    if (!gravarRascunhos(uidUsuario, lista)) aviso("Memória do celular cheia: envie ou descarte algum rascunho");
  }, [uidUsuario, aviso]);

  const mudarRascunho = useCallback((r: Rascunho) => {
    setRascunhos((atual) => {
      const lista = atual.map((x) => (x.lid === r.lid ? { ...r, atualizado: new Date().toISOString() } : x));
      if (!gravarRascunhos(uidUsuario, lista)) aviso("Memória do celular cheia: envie ou descarte algum rascunho");
      return lista;
    });
  }, [uidUsuario, aviso]);

  function novo(tipo: Tipo) {
    let ultima = "";
    try { ultima = localStorage.getItem("rdo-ultima-obra") ?? ""; } catch { /* nada */ }
    const r = novoRascunho(tipo, obras.some((o) => o.id === ultima && o.ativa) ? ultima : obras.filter((o) => o.ativa).length === 1 ? obras.find((o) => o.ativa)!.id : "");
    salvarLista([...rascunhos, r]);
    setTela({ t: "form", lid: r.lid });
  }

  function corrigir(tipo: Tipo, reg: Registro, ncs: NcReg[]) {
    const ja = rascunhos.find((x) => x.servidorId === reg.id);
    if (ja) { setTela({ t: "form", lid: ja.lid }); return; }
    const base = novoRascunho(tipo, reg.obra_id ?? "");
    const r: Rascunho = {
      ...base,
      servidorId: reg.id,
      devolvidoMotivo: reg.devolvido_motivo ?? "Correção solicitada",
      data: reg.data,
      dados: { ...(tipo === "rdo" ? novosDadosRdo() : novosDadosLev()), ...reg.dados } as DadosRdo | DadosLev,
      ncs: ncs.filter((n) => n.status === "aberta").map((n) => novaNc({
        servidorId: n.id, tipo: n.tipo, gravidade: n.gravidade, descricao: n.descricao, acao_sugerida: n.acao_sugerida,
        local: { rodovia: n.local?.rodovia ?? "", sentido: n.local?.sentido ?? "", faixa: n.local?.faixa ?? "", km_inicial: n.local?.km_inicial ?? null, km_final: n.local?.km_final ?? null, hora: n.local?.hora ?? "" },
      })),
    };
    salvarLista([...rascunhos, r]);
    setTela({ t: "form", lid: r.lid });
  }

  async function descartar(r: Rascunho) {
    if (r.servidorId && !r.devolvidoMotivo) {
      // rascunho que chegou a ser gravado no servidor num envio interrompido
      await sb.from(r.tipo === "rdo" ? "rdos" : "levantamentos").delete().eq("id", r.servidorId);
    }
    await apagarArquivosDoRascunho(r);
    salvarLista(rascunhos.filter((x) => x.lid !== r.lid));
    setTela({ t: "inicio" });
    aviso("Rascunho descartado");
  }

  const ctx: Ctx | null = useMemo(() => (perfil ? { perfil, obras, cadastros, recarregarCadastros, aviso } : null), [perfil, obras, cadastros, recarregarCadastros, aviso]);

  if (erroPerfil) return <div className="tela-login"><div className="cartao login"><Aviso tipo="erro">{erroPerfil}</Aviso><button className="btn" onClick={() => location.reload()}>Tentar de novo</button></div></div>;
  if (!perfil || !ctx) return <div className="carregando-app"><span className="giro" /> Carregando…</div>;
  if (perfil.papel === "pendente") {
    return (
      <div className="tela-login"><div className="cartao login">
        <h2>Conta aguardando liberação</h2>
        <p>Olá{perfil.nome ? `, ${perfil.nome}` : ""}. Sua conta foi criada, mas o proprietário ainda precisa definir o seu papel (técnico, analista ou engenheiro).</p>
        <div className="linha-botoes"><button className="btn" onClick={() => carregarPerfil()}>Verificar de novo</button><button className="btn" onClick={() => sb.auth.signOut()}>Sair</button></div>
      </div></div>
    );
  }

  const atual = tela.t === "form" ? rascunhos.find((r) => r.lid === tela.lid) : undefined;
  const gestao = eGestao(perfil.papel);

  return (
    <AppCtx.Provider value={ctx}>
      <header className="topo">
        <button className="marca" onClick={() => setTela({ t: "inicio" })}><span className="placa">RDO</span><span className="titulo">Diário de obra<small>{PAPEIS[perfil.papel]} · {perfil.nome || perfil.email}</small></span></button>
        <span className={`status-rede ${online ? "ok" : "off"}`}>{online ? "Online" : "Sem internet"}</span>
      </header>
      <nav className="menu">
        <button aria-current={tela.t === "inicio" || tela.t === "form" || tela.t === "enviado" ? "page" : undefined} onClick={() => setTela({ t: "inicio" })}><Icone nome="casa" /><span>Início</span></button>
        <button aria-current={tela.t === "painel" && tela.tipo === "rdo" ? "page" : undefined} onClick={() => setTela({ t: "painel", tipo: "rdo" })}><Icone nome="lista" /><span>Painel RDO</span>{gestao && filas.rdo > 0 && <i className="contagem">{filas.rdo}</i>}</button>
        <button aria-current={tela.t === "painel" && tela.tipo === "lev" ? "page" : undefined} onClick={() => setTela({ t: "painel", tipo: "lev" })}><Icone nome="doc" /><span>Levantamentos</span>{gestao && filas.lev > 0 && <i className="contagem">{filas.lev}</i>}</button>
        <button aria-current={tela.t === "config" ? "page" : undefined} onClick={() => setTela({ t: "config" })}><Icone nome="config" /><span>Config.</span></button>
        <button onClick={() => sb.auth.signOut()}><Icone nome="sair" /><span>Sair</span></button>
      </nav>
      <main>
        {!online && <Aviso tipo="alerta">Sem internet. Você pode continuar preenchendo: tudo fica salvo no celular. O envio e a leitura automática voltam quando tiver sinal.</Aviso>}
        {tela.t === "inicio" && (
          <Inicio perfil={perfil} rascunhos={rascunhos} obras={obras} filas={filas}
            aoNovo={novo} aoAbrir={(lid) => setTela({ t: "form", lid })} aoPainel={(tipo) => setTela({ t: "painel", tipo })} />
        )}
        {tela.t === "form" && atual && (
          <Formulario key={atual.lid} r={atual} mudar={mudarRascunho} aoDescartar={() => descartar(atual)}
            aoEnviado={(final) => {
              salvarLista(rascunhos.filter((x) => x.lid !== final.lid));
              setTela({ t: "enviado", tipo: final.tipo });
              carregarFilas(perfil);
            }} />
        )}
        {tela.t === "form" && !atual && <Aviso tipo="erro">Rascunho não encontrado. <button className="link" onClick={() => setTela({ t: "inicio" })}>Voltar</button></Aviso>}
        {tela.t === "enviado" && (
          <div className="cartao enviado">
            <span className="placa grande">Enviado</span>
            <h2>{tela.tipo === "rdo" ? "RDO enviado" : "Levantamento enviado"}</h2>
            <p>Agora ele vai para a {tela.tipo === "rdo" ? "pré-validação" : "pré-aprovação"} do analista e depois para o engenheiro. Se precisar de correção, ele volta para você com o motivo.</p>
            <div className="linha-botoes centro">
              <button className="btn pri" onClick={() => novo(tela.tipo)}>{tela.tipo === "rdo" ? "Novo RDO" : "Novo levantamento"}</button>
              <button className="btn" onClick={() => setTela({ t: "painel", tipo: tela.tipo })}>Ver no painel</button>
            </div>
          </div>
        )}
        {tela.t === "painel" && <Painel key={tela.tipo} tipo={tela.tipo} aoCorrigir={(reg, ncs) => corrigir(tela.tipo, reg, ncs)} />}
        {tela.t === "config" && <Configuracoes />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </AppCtx.Provider>
  );
}

function Inicio(p: {
  perfil: Perfil; rascunhos: Rascunho[]; obras: Obra[]; filas: { rdo: number; lev: number; devolvidos: number };
  aoNovo: (t: Tipo) => void; aoAbrir: (lid: string) => void; aoPainel: (t: Tipo) => void;
}) {
  const gestao = eGestao(p.perfil.papel);
  const ord = [...p.rascunhos].sort((a, b) => b.atualizado.localeCompare(a.atualizado));
  return (
    <div className="inicio">
      <h2 className="ola">Olá{p.perfil.nome ? `, ${p.perfil.nome.split(" ")[0]}` : ""}</h2>
      {p.filas.devolvidos > 0 && (
        <Aviso tipo="erro">Você tem {p.filas.devolvidos} {p.filas.devolvidos > 1 ? "registros devolvidos" : "registro devolvido"} para corrigir. <button className="link" onClick={() => p.aoPainel("rdo")}>Ver</button></Aviso>
      )}
      {gestao && (p.filas.rdo > 0 || p.filas.lev > 0) && (
        <div className="filas">
          {p.filas.rdo > 0 && <button className="cartao fila" onClick={() => p.aoPainel("rdo")}><b>{p.filas.rdo}</b> {p.filas.rdo > 1 ? "RDOs aguardam" : "RDO aguarda"} você</button>}
          {p.filas.lev > 0 && <button className="cartao fila" onClick={() => p.aoPainel("lev")}><b>{p.filas.lev}</b> {p.filas.lev > 1 ? "levantamentos aguardam" : "levantamento aguarda"} você</button>}
        </div>
      )}
      <div className="atalhos">
        <button className="atalho" onClick={() => p.aoNovo("rdo")}>
          <span className="ico"><Icone nome="doc" /></span>
          <span><b>Novo RDO</b><span>Diário do dia: fale, fotografe a ficha ou digite. Indique NC na hora.</span></span>
        </button>
        <button className="atalho lev" onClick={() => p.aoNovo("lev")}>
          <span className="ico"><Icone nome="lista" /></span>
          <span><b>Novo levantamento</b><span>Medição de panos com km, medidas e fotos.</span></span>
        </button>
      </div>
      {ord.length > 0 && (
        <section>
          <h3 className="sub">Rascunhos neste celular</h3>
          <div className="lista-registros">
            {ord.map((r) => {
              const t = totais((r.dados as DadosRdo | DadosLev).panos);
              return (
                <button key={r.lid} className="registro" onClick={() => p.aoAbrir(r.lid)}>
                  <span className="data-bloco"><b>{r.data.slice(8, 10)}</b><span>{r.data.slice(5, 7)}/{r.data.slice(2, 4)}</span></span>
                  <span className="meio">
                    <b>{r.tipo === "rdo" ? "RDO" : "Levantamento"} · {nomeObra(p.obras, r.obra_id)}</b>
                    <span>{t.n} panos · {r.fotos.length} fotos{r.ncs.length ? ` · ${r.ncs.length} NC` : ""} · editado {brData(r.atualizado)}</span>
                    {r.devolvidoMotivo && <span className="selo st-devolvido">Correção pedida</span>}
                  </span>
                  <span className="num">›</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
