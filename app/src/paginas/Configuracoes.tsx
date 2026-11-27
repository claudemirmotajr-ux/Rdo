import { useCallback, useEffect, useState } from "react";
import { type Papel, PAPEIS, brDataHora } from "../dominio";
import { type Cadastro, type Perfil, useApp } from "../contexto";
import { msgErro, sb } from "../supabase";
import { Aviso, Icone } from "../componentes/ui";

type Pessoa = Perfil & { criado_em: string };
const TIPOS: { tipo: Cadastro["tipo"]; titulo: string }[] = [
  { tipo: "usina", titulo: "Usinas" },
  { tipo: "equipe", titulo: "Equipes" },
  { tipo: "equipe_pintura", titulo: "Equipes de pintura" },
  { tipo: "deposito", titulo: "Depósitos de fresado" },
];

export function Configuracoes() {
  const { perfil, obras, cadastros, recarregarCadastros, aviso } = useApp();
  const dono = perfil.papel === "proprietario";
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [erro, setErro] = useState("");
  const [novaObra, setNovaObra] = useState({ nome: "", contrato: "", rodovia: "" });
  const [novo, setNovo] = useState<Record<string, string>>({});
  const [meuNome, setMeuNome] = useState(perfil.nome);

  const carregarPessoas = useCallback(async () => {
    const { data, error } = await sb.from("profiles").select("*").order("criado_em");
    if (error) setErro(msgErro(error)); else setPessoas((data ?? []) as Pessoa[]);
  }, []);
  useEffect(() => { if (dono) carregarPessoas(); }, [dono, carregarPessoas]);

  async function exec(p: PromiseLike<{ error: unknown }>, ok: string) {
    setErro("");
    const { error } = await p;
    if (error) { setErro(msgErro(error)); return false; }
    aviso(ok);
    return true;
  }

  const pendentes = pessoas.filter((p) => p.papel === "pendente");
  return (
    <div className="config">
      <h2>Configurações</h2>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section className="cartao">
        <h3>Meu cadastro</h3>
        <p className="dica">Papel: <b>{PAPEIS[perfil.papel]}</b> · {perfil.email}</p>
        <div className="linha-form">
          <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} aria-label="Meu nome" />
          <button className="btn" onClick={async () => { if (await exec(sb.rpc("atualizar_meu_nome", { p_nome: meuNome }), "Nome atualizado")) location.reload(); }}>Salvar nome</button>
        </div>
      </section>

      {!dono && <Aviso>Cadastros de obras, usinas, equipes e permissões são feitos pelo proprietário.</Aviso>}

      {dono && (
        <>
          <section className="cartao">
            <h3>Pessoas e permissões</h3>
            {pendentes.length > 0 && <Aviso tipo="alerta">{pendentes.length} {pendentes.length > 1 ? "contas aguardam" : "conta aguarda"} liberação. Escolha o papel de cada uma.</Aviso>}
            <p className="dica">
              <b>Técnico</b> preenche e envia RDO e levantamento. <b>Analista</b> pré-valida (ou devolve). <b>Engenheiro</b> dá a validação final,
              trata as NCs e pode corrigir dados. <b>Proprietário</b> faz tudo e cuida dos cadastros. <b>Pendente</b> não vê nada.
            </p>
            <div className="lista-pessoas">
              {pessoas.map((p) => (
                <div key={p.id} className={`pessoa ${p.papel === "pendente" ? "pendente" : ""}`}>
                  <div><b>{p.nome || "–"}</b><span>{p.email} · desde {brDataHora(p.criado_em)}</span></div>
                  <select aria-label={`Papel de ${p.nome || p.email}`} value={p.papel} onChange={async (e) => {
                    if (await exec(sb.rpc("definir_papel", { p_usuario: p.id, p_papel: e.target.value as Papel }), "Papel atualizado")) carregarPessoas();
                  }}>
                    {(Object.keys(PAPEIS) as Papel[]).map((k) => <option key={k} value={k}>{PAPEIS[k]}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="cartao">
            <h3>Obras</h3>
            {obras.map((o) => (
              <div key={o.id} className="linha-cad">
                <span><b>{o.nome}</b> {o.contrato && `· ${o.contrato}`} {o.rodovia && `· ${o.rodovia}`} {!o.ativa && <em>(encerrada)</em>}</span>
                <button className="btn pequeno" onClick={async () => { if (await exec(sb.from("obras").update({ ativa: !o.ativa }).eq("id", o.id), o.ativa ? "Obra encerrada" : "Obra reativada")) recarregarCadastros(); }}>
                  {o.ativa ? "Encerrar" : "Reativar"}
                </button>
              </div>
            ))}
            <div className="linha-form">
              <input placeholder="Nome da obra" value={novaObra.nome} onChange={(e) => setNovaObra({ ...novaObra, nome: e.target.value })} />
              <input placeholder="Contrato" value={novaObra.contrato} onChange={(e) => setNovaObra({ ...novaObra, contrato: e.target.value })} />
              <input placeholder="Rodovia (ex.: SP 310)" value={novaObra.rodovia} onChange={(e) => setNovaObra({ ...novaObra, rodovia: e.target.value })} />
              <button className="btn pri" disabled={!novaObra.nome.trim()} onClick={async () => {
                if (await exec(sb.from("obras").insert({ nome: novaObra.nome.trim(), contrato: novaObra.contrato.trim(), rodovia: novaObra.rodovia.trim() }), "Obra cadastrada")) {
                  setNovaObra({ nome: "", contrato: "", rodovia: "" });
                  recarregarCadastros();
                }
              }}><Icone nome="mais" /> Adicionar</button>
            </div>
          </section>

          {TIPOS.map(({ tipo, titulo }) => (
            <section key={tipo} className="cartao">
              <h3>{titulo}</h3>
              <div className="chips">
                {cadastros.filter((c) => c.tipo === tipo).map((c) => (
                  <span key={c.id} className={`chip ${c.ativo ? "" : "inativo"}`}>
                    {c.nome}
                    <button className="link" aria-label={c.ativo ? `Desativar ${c.nome}` : `Reativar ${c.nome}`}
                      onClick={async () => { if (await exec(sb.from("cadastros").update({ ativo: !c.ativo }).eq("id", c.id), "Atualizado")) recarregarCadastros(); }}>
                      {c.ativo ? "×" : "↺"}
                    </button>
                  </span>
                ))}
              </div>
              <div className="linha-form">
                <input placeholder={`Novo nome (${titulo.toLowerCase()})`} value={novo[tipo] ?? ""} onChange={(e) => setNovo({ ...novo, [tipo]: e.target.value })} />
                <button className="btn" disabled={!(novo[tipo] ?? "").trim()} onClick={async () => {
                  if (await exec(sb.from("cadastros").insert({ tipo, nome: (novo[tipo] ?? "").trim() }), "Cadastrado")) {
                    setNovo({ ...novo, [tipo]: "" });
                    recarregarCadastros();
                  }
                }}><Icone nome="mais" /> Adicionar</button>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
