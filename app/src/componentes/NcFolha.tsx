import { useState } from "react";
import { type NcRasc, FAIXAS, GRAVIDADES, NC_TIPOS, RODOVIAS, SENTIDOS } from "../dominio";
import { falaDisponivel, useFala } from "../fala";
import { aplicarLeituraNc, lerAutomatico } from "../leitura";
import { useApp } from "../contexto";
import { useContextoLeitura } from "./BarraLeitura";
import { Fotos } from "./Fotos";
import { AreaTexto, Aviso, Campo, Folha, Icone, Numero, Opcoes, Selecao, Texto } from "./ui";

export function NcFolha(p: { nc: NcRasc; data: string; aoSalvar: (n: NcRasc) => void; aoRemover?: () => void; aoFechar: () => void }) {
  const { aviso } = useApp();
  const ctx = useContextoLeitura();
  const [n, setN] = useState<NcRasc>(p.nc);
  const [lendo, setLendo] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "erro"; m: string } | null>(null);
  const fala = useFala();
  const L = n.local;
  const setL = (k: keyof NcRasc["local"], v: unknown) => setN({ ...n, local: { ...L, [k]: v } });

  async function lerFala() {
    const texto = fala.parar();
    if (!texto) return;
    setLendo(true);
    setMsg(null);
    // a fala entra na descrição mesmo se a leitura falhar
    const base = { ...n, descricao: n.descricao ? `${n.descricao}\n${texto}` : texto };
    setN(base);
    try {
      const campos = await lerAutomatico("nc", { texto }, ctx(p.data));
      const { nova, resumo } = aplicarLeituraNc(n, campos);
      // se a leitura não trouxe descrição, fica a fala como foi dita
      if (nova.descricao === n.descricao) nova.descricao = base.descricao;
      setN(nova);
      setMsg({ t: "ok", m: resumo.length ? `Preenchido: ${resumo.join(", ")}. Confira.` : "Fala adicionada à descrição." });
    } catch (e) {
      setMsg({ t: "erro", m: `${(e as Error).message} A fala ficou na descrição.` });
    } finally {
      setLendo(false);
    }
  }

  const ok = n.tipo && n.descricao.trim();
  return (
    <Folha titulo="Indicar não conformidade" aoFechar={p.aoFechar}
      rodape={
        <>
          {p.aoRemover && <button className="btn perigo" onClick={p.aoRemover}>Remover</button>}
          <button className="btn" onClick={p.aoFechar}>Cancelar</button>
          <button className="btn pri" disabled={!ok} onClick={() => p.aoSalvar(n)}>Salvar NC no RDO</button>
        </>
      }>
      <p className="dica">Registre o procedimento errado ou o defeito que você viu. A NC vai junto com este RDO e o engenheiro faz a tratativa.</p>
      {falaDisponivel() && (
        <div className="mic-linha">
          <button className={`mic pequeno ${fala.ouvindo ? "ligado" : ""}`} disabled={lendo}
            onClick={() => (fala.ouvindo ? lerFala() : fala.iniciar())} aria-label={fala.ouvindo ? "Parar e preencher" : "Falar a NC"}>
            <Icone nome="mic" />
          </button>
          <span>{lendo ? <><span className="giro" /> Lendo…</> : fala.ouvindo ? "Ouvindo… toque para parar e preencher" : "Toque e descreva a NC falando"}</span>
        </div>
      )}
      {(fala.ouvindo && (fala.texto || fala.parcial)) && <div className="transcricao">{fala.texto} <span className="parcial">{fala.parcial}</span></div>}
      {fala.erro && <Aviso tipo="erro">{fala.erro}</Aviso>}
      {msg && <Aviso tipo={msg.t === "ok" ? "ok" : "erro"}>{msg.m}</Aviso>}
      <div className="grade g2">
        <Campo rotulo="Tipo" obrigatorio><Selecao valor={n.tipo} opcoes={NC_TIPOS} onChange={(v) => setN({ ...n, tipo: v })} /></Campo>
        <Campo rotulo="Gravidade"><Opcoes valor={n.gravidade} opcoes={GRAVIDADES} onChange={(v) => setN({ ...n, gravidade: v })} permiteLimpar /></Campo>
      </div>
      <Campo rotulo="O que aconteceu" obrigatorio>
        <AreaTexto valor={n.descricao} onChange={(v) => setN({ ...n, descricao: v })} linhas={4} placeholder="Ex.: caminhão chegou com massa a 120 °C e foi aplicada mesmo assim" />
      </Campo>
      <div className="grade g3">
        <Campo rotulo="Rodovia"><Texto valor={L.rodovia} onChange={(v) => setL("rodovia", v)} lista={RODOVIAS} /></Campo>
        <Campo rotulo="Sentido"><Texto valor={L.sentido} onChange={(v) => setL("sentido", v)} lista={SENTIDOS} /></Campo>
        <Campo rotulo="Faixa"><Texto valor={L.faixa} onChange={(v) => setL("faixa", v)} lista={FAIXAS} /></Campo>
        <Campo rotulo="km inicial"><Numero km valor={L.km_inicial} onChange={(v) => setL("km_inicial", v)} /></Campo>
        <Campo rotulo="km final"><Numero km valor={L.km_final} onChange={(v) => setL("km_final", v)} /></Campo>
        <Campo rotulo="Hora"><input type="time" value={L.hora} onChange={(e) => setL("hora", e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Ação sugerida"><AreaTexto valor={n.acao_sugerida} onChange={(v) => setN({ ...n, acao_sugerida: v })} linhas={2} placeholder="Opcional" /></Campo>
      <h3 className="sub">Fotos da NC</h3>
      <Fotos fotos={n.fotos} mudar={(f) => setN({ ...n, fotos: f })} categorias={["Ocorrência", "Antes", "Depois"]} aviso={aviso} />
    </Folha>
  );
}
