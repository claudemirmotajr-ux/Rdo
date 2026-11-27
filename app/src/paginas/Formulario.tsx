import { useState } from "react";
import {
  type DadosLev, type DadosRdo, type NcRasc, type Rascunho,
  CLIMAS, CLIMAS_NOITE, EQUIPAMENTOS, brData, fkm, fmt, novaNc, pendencias, totais, uid,
} from "../dominio";
import { nomeObra, nomesDe, useApp } from "../contexto";
import { enviarRascunho } from "../envio";
import { apagarArquivosDoRascunho } from "../locais";
import { msgErro } from "../supabase";
import { BarraLeitura } from "../componentes/BarraLeitura";
import { Panos } from "../componentes/Panos";
import { Fotos } from "../componentes/Fotos";
import { Assinatura } from "../componentes/Assinatura";
import { NcFolha } from "../componentes/NcFolha";
import { AreaTexto, Aviso, Campo, Icone, Numero, Opcoes, Selecao, Texto } from "../componentes/ui";

const ETAPAS_RDO = ["Dia", "Clima e equipe", "Produção", "Checklist", "Fotos", "Revisão e envio"];
const ETAPAS_LEV = ["Identificação", "Panos", "Fotos", "Revisão e envio"];

export function Formulario(p: {
  r: Rascunho;
  mudar: (r: Rascunho) => void;
  aoEnviado: (r: Rascunho) => void;
  aoDescartar: () => void;
}) {
  const { r, mudar } = p;
  const { obras, cadastros, perfil, aviso } = useApp();
  const [nc, setNc] = useState<{ n: NcRasc; idx: number } | null>(null);
  const [enviando, setEnviando] = useState("");
  const [erroEnvio, setErroEnvio] = useState("");
  const etapas = r.tipo === "rdo" ? ETAPAS_RDO : ETAPAS_LEV;
  const etapa = Math.min(r.etapa, etapas.length - 1);
  const ir = (e: number) => { mudar({ ...r, etapa: e }); window.scrollTo(0, 0); };
  const A = (k: string) => !!r.auto[k];

  const d = r.dados as DadosRdo & DadosLev;
  const setD = (k: string, v: unknown) => mudar({ ...r, dados: { ...r.dados, [k]: v } as DadosRdo | DadosLev });
  const obraAtual = obras.find((o) => o.id === r.obra_id);
  const usinas = nomesDe(cadastros, "usina");

  async function enviar() {
    setErroEnvio("");
    setEnviando("Enviando…");
    try {
      const final = await enviarRascunho(r, (parcial, etapaTxt) => { mudar(parcial); setEnviando(etapaTxt); });
      await apagarArquivosDoRascunho(final);
      p.aoEnviado(final);
    } catch (e) {
      setErroEnvio(msgErro(e));
    } finally {
      setEnviando("");
    }
  }

  const salvarNc = (n: NcRasc, idx: number) => {
    const ncs = [...r.ncs];
    if (idx >= 0) ncs[idx] = n; else ncs.push(n);
    mudar({ ...r, ncs });
    setNc(null);
    aviso("NC salva no RDO");
  };

  return (
    <div className="formulario">
      <div className="cabecalho-form">
        <h2>{r.tipo === "rdo" ? "RDO" : "Levantamento"} de {brData(r.data)}{obraAtual ? ` · ${obraAtual.nome}` : ""}</h2>
        <nav className="etapas" aria-label="Etapas">
          {etapas.map((e, i) => (
            <button key={e} aria-current={i === etapa ? "step" : undefined} className={i < etapa ? "feita" : ""} onClick={() => ir(i)}>
              <span>{i + 1}</span>{e}
            </button>
          ))}
        </nav>
      </div>

      {r.devolvidoMotivo && (
        <Aviso tipo="erro"><b>Devolvido para correção:</b> {r.devolvidoMotivo}. Corrija, assine de novo e reenvie.</Aviso>
      )}

      <BarraLeitura r={r} mudar={mudar} />

      {r.duvidas.length > 0 && (
        <div className="duvidas">
          <h3>Para conferir ({r.duvidas.length})</h3>
          <ul>
            {r.duvidas.map((x, i) => (
              <li key={i}><b>{x.campo}:</b> {x.motivo}{" "}
                <button className="link" onClick={() => mudar({ ...r, duvidas: r.duvidas.filter((_, j) => j !== i) })}>Conferido</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.tipo === "rdo" && r.sugestoesNc.length > 0 && (
        <div className="sugestoes-nc">
          <h3><Icone nome="alerta" /> A leitura encontrou possíveis não conformidades</h3>
          {r.sugestoesNc.map((s, i) => (
            <div key={i} className="sugestao">
              <p><b>{s.tipo}</b>{s.gravidade ? ` (${s.gravidade})` : ""}: {s.descricao}</p>
              <div className="linha-botoes">
                <button className="btn pequeno pri" onClick={() => {
                  const resto = r.sugestoesNc.filter((_, j) => j !== i);
                  mudar({ ...r, sugestoesNc: resto });
                  setNc({ n: novaNc({ tipo: s.tipo, gravidade: s.gravidade, descricao: s.descricao, local: { rodovia: s.rodovia, sentido: "", faixa: "", km_inicial: s.km_inicial, km_final: null, hora: "" } }), idx: -1 });
                }}>Indicar como NC</button>
                <button className="btn pequeno" onClick={() => mudar({ ...r, sugestoesNc: r.sugestoesNc.filter((_, j) => j !== i) })}>Não é NC</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- etapas ---------------- */}
      {etapa === 0 && (
        <section className="cartao">
          <h2>{r.tipo === "rdo" ? "Dia de trabalho" : "Identificação"}</h2>
          <div className="grade g2">
            <Campo rotulo="Obra" obrigatorio>
              <Selecao valor={r.obra_id} opcoes={obras.filter((o) => o.ativa || o.id === r.obra_id).map((o) => ({ v: o.id, t: o.nome }))}
                onChange={(v) => { mudar({ ...r, obra_id: v }); try { localStorage.setItem("rdo-ultima-obra", v); } catch { /* sem espaço */ } }} />
            </Campo>
            <Campo rotulo="Data" obrigatorio><input type="date" value={r.data} onChange={(e) => mudar({ ...r, data: e.target.value })} /></Campo>
          </div>
          {!obras.length && <Aviso tipo="alerta">Nenhuma obra cadastrada ainda. Peça ao proprietário para cadastrar em Configurações.</Aviso>}
          {r.tipo === "rdo" ? (
            <div className="grade g2">
              <Campo rotulo="Turno" auto={A("turno")}><Opcoes valor={d.turno} opcoes={["Diurno", "Noturno"]} onChange={(v) => setD("turno", v)} /></Campo>
              <Campo rotulo="Equipe" auto={A("equipe")}><Texto valor={d.equipe} onChange={(v) => setD("equipe", v)} lista={nomesDe(cadastros, "equipe")} /></Campo>
            </div>
          ) : (
            <div className="grade g2">
              <Campo rotulo="Motivo do levantamento" obrigatorio auto={A("motivo")}>
                <Texto valor={d.motivo} onChange={(v) => setD("motivo", v)} lista={["Programação de serviço", "Medição de executado", "Solicitação da fiscalização", "Vistoria"]} />
              </Campo>
              <Campo rotulo="Empresa / equipe" auto={A("empresa")}><Texto valor={d.empresa} onChange={(v) => setD("empresa", v)} /></Campo>
            </div>
          )}
        </section>
      )}

      {r.tipo === "rdo" && etapa === 1 && (
        <section className="cartao">
          <h2>Clima e equipe</h2>
          <Campo rotulo="Clima da manhã" obrigatorio auto={A("clima_manha")}><Opcoes valor={d.clima_manha} opcoes={CLIMAS} onChange={(v) => setD("clima_manha", v)} /></Campo>
          <Campo rotulo="Clima da tarde" obrigatorio auto={A("clima_tarde")}><Opcoes valor={d.clima_tarde} opcoes={CLIMAS} onChange={(v) => setD("clima_tarde", v)} /></Campo>
          <Campo rotulo="Clima da noite" auto={A("clima_noite")}><Opcoes valor={d.clima_noite} opcoes={CLIMAS_NOITE} onChange={(v) => setD("clima_noite", v)} /></Campo>
          <div className="grade g2">
            <Campo rotulo="A chuva paralisou o serviço?" auto={A("chuva_paralisou")}>
              <Opcoes valor={d.chuva_paralisou == null ? "" : d.chuva_paralisou ? "Sim" : "Não"} opcoes={["Sim", "Não"]}
                onChange={(v) => setD("chuva_paralisou", v === "Sim" ? true : v === "Não" ? false : null)} />
            </Campo>
            {d.chuva_paralisou && <Campo rotulo="Horas paradas" auto={A("horas_paradas")}><Numero valor={d.horas_paradas} unidade="h" onChange={(v) => setD("horas_paradas", v)} /></Campo>}
            <Campo rotulo="Efetivo (pessoas)" auto={A("efetivo")}><Numero valor={d.efetivo} onChange={(v) => setD("efetivo", v == null ? null : Math.round(v))} /></Campo>
          </div>
          <h3 className="sub">Equipamentos {A("equipamentos") && <span className="selo-auto">lido automaticamente</span>}</h3>
          {EQUIPAMENTOS.map(([grupo, itens]) => (
            <fieldset key={grupo} className="grupo-equip">
              <legend>{grupo}</legend>
              {itens.map((nome) => {
                const q = d.equipamentos.find((e) => e.nome === nome)?.quantidade ?? 0;
                const setQ = (n: number) => setD("equipamentos", [...d.equipamentos.filter((e) => e.nome !== nome), ...(n > 0 ? [{ nome, quantidade: n }] : [])]);
                return (
                  <div key={nome} className="linha-equip">
                    <span>{nome}</span>
                    <div className="contador">
                      <button onClick={() => setQ(Math.max(0, q - 1))} aria-label={`Menos ${nome}`}>−</button>
                      <output>{q}</output>
                      <button onClick={() => setQ(q + 1)} aria-label={`Mais ${nome}`}>+</button>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
          {d.equipamentos.filter((e) => !EQUIPAMENTOS.some(([, it]) => it.includes(e.nome))).map((e) => (
            <p key={e.nome} className="dica">Também: {e.quantidade} {e.nome} <button className="link" onClick={() => setD("equipamentos", d.equipamentos.filter((x) => x.nome !== e.nome))}>remover</button></p>
          ))}
        </section>
      )}

      {((r.tipo === "rdo" && etapa === 2) || (r.tipo === "lev" && etapa === 1)) && (
        <section className="cartao">
          <h2>{r.tipo === "rdo" ? "Produção do dia" : "Panos levantados"}</h2>
          {r.tipo === "rdo" && (
            <label className="marcar">
              <input type="checkbox" checked={d.sem_producao} onChange={(e) => setD("sem_producao", e.target.checked)} /> Sem produção no dia
            </label>
          )}
          {!(r.tipo === "rdo" && d.sem_producao) && (
            <Panos panos={d.panos} mudar={(v) => setD("panos", v)} auto={r.auto} comToneladas={r.tipo === "rdo"} rodoviaPadrao={obraAtual?.rodovia} />
          )}
          {r.tipo === "rdo" && !d.sem_producao && (
            <>
              <h3 className="sub">Cargas de massa {A("cargas") && <span className="selo-auto">lido automaticamente</span>}</h3>
              {d.cargas.map((c, i) => (
                <div key={c.id} className="grade g4 carga">
                  <Campo rotulo="Usina"><Texto valor={c.usina} lista={usinas} onChange={(v) => setD("cargas", d.cargas.map((x, j) => (j === i ? { ...x, usina: v } : x)))} /></Campo>
                  <Campo rotulo="Mistura"><Texto valor={c.mistura} onChange={(v) => setD("cargas", d.cargas.map((x, j) => (j === i ? { ...x, mistura: v } : x)))} /></Campo>
                  <Campo rotulo="Toneladas"><Numero valor={c.toneladas} unidade="t" onChange={(v) => setD("cargas", d.cargas.map((x, j) => (j === i ? { ...x, toneladas: v } : x)))} /></Campo>
                  <Campo rotulo="Placa / nota"><Texto valor={c.placa_ou_nota} onChange={(v) => setD("cargas", d.cargas.map((x, j) => (j === i ? { ...x, placa_ou_nota: v } : x)))} /></Campo>
                  <button className="btn pequeno perigo" onClick={() => setD("cargas", d.cargas.filter((_, j) => j !== i))} aria-label="Remover carga"><Icone nome="lixo" /></button>
                </div>
              ))}
              <button className="btn tracejado" onClick={() => setD("cargas", [...d.cargas, { id: uid(), usina: d.cargas.at(-1)?.usina ?? "", mistura: d.cargas.at(-1)?.mistura ?? "", toneladas: null, placa_ou_nota: "" }])}>
                <Icone nome="mais" /> Adicionar carga
              </button>
              {d.cargas.length > 0 && <p className="dica">Total recebido: <b>{fmt(d.cargas.reduce((s, c) => s + (c.toneladas ?? 0), 0), 1)} t</b></p>}
            </>
          )}
        </section>
      )}

      {r.tipo === "rdo" && etapa === 3 && (
        <section className="cartao">
          <h2>Checklist do dia</h2>
          <div className="grade g2">
            <Campo rotulo="Equipe de pintura" auto={A("equipe_pintura")}><Texto valor={d.equipe_pintura} onChange={(v) => setD("equipe_pintura", v)} lista={[...nomesDe(cadastros, "equipe_pintura"), "Não houve pintura"]} /></Campo>
            <Campo rotulo="Metragem de pintura" auto={A("pintura_m2")}><Numero valor={d.pintura_m2} unidade="m²" onChange={(v) => setD("pintura_m2", v)} /></Campo>
            <Campo rotulo="Liberação da equipe de massa" obrigatorio={!d.sem_massa && d.panos.length > 0} auto={A("liberacao_massa")}>
              <input type="time" value={d.liberacao_massa} disabled={d.sem_massa} onChange={(e) => setD("liberacao_massa", e.target.value)} />
              <label className="marcar"><input type="checkbox" checked={d.sem_massa} onChange={(e) => setD("sem_massa", e.target.checked)} /> Não houve equipe de massa</label>
            </Campo>
            <Campo rotulo="Liberação da pista" obrigatorio auto={A("liberacao_pista")}><input type="time" value={d.liberacao_pista} onChange={(e) => setD("liberacao_pista", e.target.value)} /></Campo>
          </div>
          <h3 className="sub">Ocorrências do dia</h3>
          {d.ocorrencias.map((o, i) => (
            <div key={o.id} className="ocorrencia">
              <input type="time" value={o.hora} onChange={(e) => setD("ocorrencias", d.ocorrencias.map((x, j) => (j === i ? { ...x, hora: e.target.value } : x)))} />
              <input value={o.descricao} onChange={(e) => setD("ocorrencias", d.ocorrencias.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
              <button className="btn pequeno perigo" onClick={() => setD("ocorrencias", d.ocorrencias.filter((_, j) => j !== i))} aria-label="Remover ocorrência"><Icone nome="lixo" /></button>
            </div>
          ))}
          <button className="btn tracejado" onClick={() => setD("ocorrencias", [...d.ocorrencias, { id: uid(), hora: new Date().toTimeString().slice(0, 5), descricao: "" }])}><Icone nome="mais" /> Adicionar ocorrência</button>
          <Campo rotulo="Observações" auto={A("observacoes")}><AreaTexto valor={d.observacoes} onChange={(v) => setD("observacoes", v)} linhas={4} placeholder="Interferências, pedidos da fiscalização, tudo que fugiu do normal" /></Campo>
        </section>
      )}

      {((r.tipo === "rdo" && etapa === 4) || (r.tipo === "lev" && etapa === 2)) && (
        <section className="cartao">
          <h2>Fotos</h2>
          <Fotos fotos={r.fotos} mudar={(f) => mudar({ ...r, fotos: f })} aviso={aviso} />
          {r.tipo === "lev" && <Campo rotulo="Observações" auto={A("observacoes")}><AreaTexto valor={d.observacoes} onChange={(v) => setD("observacoes", v)} /></Campo>}
        </section>
      )}

      {etapa === etapas.length - 1 && (
        <Revisao r={r} nomeObra={nomeObra(obras, r.obra_id)} perfilNome={perfil.nome} mudar={mudar} enviando={enviando} erro={erroEnvio}
          aoEnviar={enviar} aoDescartar={p.aoDescartar} aoEditarNc={(i) => setNc({ n: r.ncs[i], idx: i })} irPara={ir} />
      )}

      {r.tipo === "rdo" && r.ncs.length > 0 && etapa !== etapas.length - 1 && (
        <div className="lista-nc-mini">
          {r.ncs.map((n, i) => (
            <button key={n.id} className="chip alerta" onClick={() => setNc({ n, idx: i })}><Icone nome="alerta" /> NC {i + 1}: {n.tipo || "sem tipo"}</button>
          ))}
        </div>
      )}

      <div className="barra-etapas">
        <button className="btn" disabled={etapa === 0} onClick={() => ir(etapa - 1)}>Voltar</button>
        {r.tipo === "rdo" && (
          <button className="btn nc" onClick={() => setNc({ n: novaNc({ local: { rodovia: d.panos.at(-1)?.rodovia ?? obraAtual?.rodovia ?? "", sentido: d.panos.at(-1)?.sentido ?? "", faixa: d.panos.at(-1)?.faixa ?? "", km_inicial: d.panos.at(-1)?.km_inicial ?? null, km_final: d.panos.at(-1)?.km_final ?? null, hora: new Date().toTimeString().slice(0, 5) } }), idx: -1 })}>
            <Icone nome="alerta" /> Indicar NC
          </button>
        )}
        {etapa < etapas.length - 1 && <button className="btn pri" onClick={() => ir(etapa + 1)}>Próximo</button>}
      </div>

      {nc && (
        <NcFolha nc={nc.n} data={r.data} aoFechar={() => setNc(null)} aoSalvar={(n) => salvarNc(n, nc.idx)}
          aoRemover={nc.idx >= 0 ? () => {
            const alvo = r.ncs[nc.idx];
            mudar({ ...r, ncs: r.ncs.filter((_, j) => j !== nc.idx), ncsRemovidas: alvo.servidorId ? [...r.ncsRemovidas, alvo.servidorId] : r.ncsRemovidas });
            setNc(null);
          } : undefined} />
      )}
    </div>
  );
}

function Revisao(p: {
  r: Rascunho; nomeObra: string; perfilNome: string; mudar: (r: Rascunho) => void; enviando: string; erro: string;
  aoEnviar: () => void; aoDescartar: () => void; aoEditarNc: (i: number) => void; irPara: (e: number) => void;
}) {
  const { r } = p;
  const d = r.dados as DadosRdo & DadosLev;
  const pend = pendencias(r);
  const t = totais(d.panos);
  const [confirmaDescarte, setConfirmaDescarte] = useState(false);
  return (
    <section className="cartao revisao">
      <h2>Revisão</h2>
      <dl className="kv">
        <dt>Obra</dt><dd>{p.nomeObra}</dd>
        <dt>Data</dt><dd>{brData(r.data)}</dd>
        {r.tipo === "rdo" ? (
          <>
            <dt>Clima</dt><dd>{[d.clima_manha, d.clima_tarde, d.clima_noite].filter(Boolean).join(" / ") || "–"}{d.chuva_paralisou ? ` · chuva parou ${fmt(d.horas_paradas, 1)} h` : ""}</dd>
            <dt>Equipe</dt><dd>{d.equipe || "–"}{d.efetivo ? ` · ${d.efetivo} pessoas` : ""}</dd>
            <dt>Produção</dt><dd>{d.sem_producao ? "Sem produção" : `${t.n} panos · ${fmt(t.area)} m² · ${fmt(t.ton, 1)} t`}</dd>
            <dt>Liberações</dt><dd>massa {d.sem_massa ? "não houve" : d.liberacao_massa || "–"} · pista {d.liberacao_pista || "–"}</dd>
          </>
        ) : (
          <>
            <dt>Motivo</dt><dd>{d.motivo || "–"}</dd>
            <dt>Panos</dt><dd>{t.n} · {fmt(t.ext)} m · {fmt(t.area)} m²</dd>
          </>
        )}
        <dt>Fotos</dt><dd>{r.fotos.length}</dd>
      </dl>
      {d.panos.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>#</th><th>Rodovia</th><th>km</th><th>Faixa</th><th>Serviço</th><th>C × L × E</th><th>m²</th></tr></thead>
            <tbody>{d.panos.map((x, i) => (
              <tr key={x.id}><td>{x.numero ?? i + 1}</td><td>{x.rodovia}</td><td>{fkm(x.km_inicial)} a {fkm(x.km_final)}</td><td>{x.faixa}</td><td>{x.servico}</td>
                <td>{fmt(x.comprimento_m, 1)} × {fmt(x.largura_m, 2)} × {fmt(x.espessura_cm, 1)}</td><td>{fmt((x.comprimento_m ?? 0) * (x.largura_m ?? 0))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {r.tipo === "rdo" && (
        <>
          <h3 className="sub">Não conformidades ({r.ncs.length})</h3>
          {r.ncs.length ? r.ncs.map((n, i) => (
            <button key={n.id} className="linha-nc" onClick={() => p.aoEditarNc(i)}>
              <Icone nome="alerta" /> <b>{n.tipo || "Sem tipo"}</b> {n.gravidade && `(${n.gravidade})`} — {n.descricao.slice(0, 90)}
            </button>
          )) : <p className="dica">Nenhuma NC indicada. Use o botão "Indicar NC" se viu algum procedimento errado.</p>}
        </>
      )}
      {pend.length > 0 ? (
        <div className="pendencias">
          <b>Falta resolver para enviar:</b>
          <ul>{pend.map((x) => <li key={x}>{x}</li>)}</ul>
          <button className="link" onClick={() => p.irPara(0)}>Voltar ao início do formulário</button>
        </div>
      ) : r.duvidas.length > 0 ? (
        <Aviso tipo="alerta">Ainda há {r.duvidas.length} {r.duvidas.length > 1 ? "pontos" : "ponto"} da leitura automática para conferir (lista amarela no topo). Você pode enviar mesmo assim.</Aviso>
      ) : null}
      <h3 className="sub">Assinatura</h3>
      <Assinatura valor={r.assinatura} nomePadrao={p.perfilNome} mudar={(v) => p.mudar({ ...r, assinatura: v })} />
      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}
      <div className="linha-botoes fim">
        {confirmaDescarte ? (
          <>
            <span>Apagar este rascunho do celular?</span>
            <button className="btn perigo" onClick={p.aoDescartar}>Sim, apagar</button>
            <button className="btn" onClick={() => setConfirmaDescarte(false)}>Não</button>
          </>
        ) : (
          !r.devolvidoMotivo && <button className="btn perigo" onClick={() => setConfirmaDescarte(true)}>Descartar rascunho</button>
        )}
        <button className="btn pri grande" disabled={pend.length > 0 || !!p.enviando} onClick={p.aoEnviar}>
          {p.enviando ? <><span className="giro" /> {p.enviando}</> : r.tipo === "rdo" ? "Enviar RDO para validação" : "Enviar levantamento"}
        </button>
      </div>
    </section>
  );
}
