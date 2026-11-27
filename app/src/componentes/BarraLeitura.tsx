import { useRef, useState } from "react";
import { type DadosLev, type DadosRdo, type Rascunho, brDataHora, uid } from "../dominio";
import { falaDisponivel, useFala } from "../fala";
import { aplicarLeitura, lerAutomatico } from "../leitura";
import { blobParaBase64, comprimirImagem, guardarArquivo, posicaoAtual } from "../locais";
import { nomesDe, useApp } from "../contexto";
import { AreaTexto, Aviso, Folha, Icone } from "./ui";

export function useContextoLeitura() {
  const { obras, cadastros } = useApp();
  return (data: string) => ({
    hoje: data,
    obras: obras.filter((o) => o.ativa).map((o) => `${o.nome}${o.rodovia ? ` (${o.rodovia})` : ""}`),
    usinas: nomesDe(cadastros, "usina"),
    equipes: [...nomesDe(cadastros, "equipe"), ...nomesDe(cadastros, "equipe_pintura")],
  });
}

export function BarraLeitura({ r, mudar }: { r: Rascunho; mudar: (r: Rascunho) => void }) {
  const { aviso } = useApp();
  const ctx = useContextoLeitura();
  const [aberta, setAberta] = useState<"fala" | null>(null);
  const [lendo, setLendo] = useState("");
  const [resultado, setResultado] = useState<{ resumo: string[]; duvidas: number } | null>(null);
  const [erro, setErro] = useState("");
  const inFicha = useRef<HTMLInputElement>(null);
  const atual = useRef(r);
  atual.current = r;

  const falas = (r.dados as DadosRdo | DadosLev).falas;
  const naoLidas = falas.filter((f) => !f.lida);

  async function processarTexto(texto: string, falaId: string) {
    setErro("");
    setResultado(null);
    setLendo("Lendo o que você falou…");
    try {
      const campos = await lerAutomatico(r.tipo, { texto }, ctx(r.data));
      const base = structuredClone(atual.current);
      const f = (base.dados as DadosRdo | DadosLev).falas.find((x) => x.id === falaId);
      if (f) f.lida = true;
      const { novo, resumo, duvidas } = aplicarLeitura(base, campos);
      mudar(novo);
      setResultado({ resumo, duvidas });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo("");
    }
  }

  function guardarFala(texto: string) {
    const fala = { id: uid(), em: new Date().toISOString(), texto, lida: false };
    const base = structuredClone(atual.current);
    (base.dados as DadosRdo | DadosLev).falas.push(fala);
    mudar(base);
    atual.current = base;
    return fala;
  }

  async function lerFicha(arquivos: FileList | null) {
    const lista = arquivos ? Array.from(arquivos).slice(0, 4) : [];
    if (!lista.length) return;
    setErro("");
    setResultado(null);
    setLendo("Lendo a ficha de campo…");
    try {
      const gps = await posicaoAtual();
      const imagens: { media_type: string; data: string }[] = [];
      const base = structuredClone(atual.current);
      for (const a of lista) {
        const blob = await comprimirImagem(a, 2000, 0.85);
        const chave = await guardarArquivo(blob);
        base.fotos.push({ id: uid(), chave, tipo: "ficha", categoria: "Ficha de campo", legenda: "", lat: gps?.lat ?? null, lon: gps?.lon ?? null, tirada_em: new Date().toISOString() });
        imagens.push({ media_type: "image/jpeg", data: await blobParaBase64(blob) });
      }
      mudar(base);
      atual.current = base;
      const campos = await lerAutomatico(r.tipo, { imagens }, ctx(r.data));
      const { novo, resumo, duvidas } = aplicarLeitura(structuredClone(atual.current), campos);
      mudar(novo);
      setResultado({ resumo, duvidas });
      aviso(resumo.length ? `Ficha lida: ${resumo.join(", ")}` : "Ficha lida, mas nada novo foi encontrado");
    } catch (e) {
      setErro(`${(e as Error).message} A foto da ficha ficou anexada ao ${r.tipo === "rdo" ? "RDO" : "levantamento"}.`);
    } finally {
      setLendo("");
      if (inFicha.current) inFicha.current.value = "";
    }
  }

  return (
    <div className="barra-leitura">
      <div className="botoes-leitura">
        <button className="btn grande voz" onClick={() => { setResultado(null); setErro(""); setAberta("fala"); }}>
          <Icone nome="mic" /> Falar
        </button>
        <label className="btn grande ficha">
          <Icone nome="camera" /> Ler ficha
          <input ref={inFicha} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => lerFicha(e.target.files)} />
        </label>
      </div>
      <p className="dica centro">Fale ou fotografe a ficha de campo e o app preenche os campos. Você confere antes de enviar.</p>
      {lendo && !aberta && <Aviso><span className="giro" /> {lendo}</Aviso>}
      {erro && !aberta && <Aviso tipo="erro">{erro}</Aviso>}
      {resultado && !aberta && <ResultadoLeitura {...resultado} aoFechar={() => setResultado(null)} />}
      {naoLidas.length > 0 && !lendo && (
        <Aviso tipo="alerta">
          {naoLidas.length} {naoLidas.length > 1 ? "falas ainda não foram lidas" : "fala ainda não foi lida"} (sem internet na hora).{" "}
          <button className="link" onClick={async () => { for (const f of naoLidas) await processarTexto(f.texto, f.id); }}>Ler de novo</button>
        </Aviso>
      )}
      {aberta === "fala" && (
        <PainelFala
          aoFechar={() => setAberta(null)}
          lendo={lendo}
          erro={erro}
          resultado={resultado}
          falas={falas}
          aoConcluir={async (texto) => {
            const f = guardarFala(texto);
            await processarTexto(texto, f.id);
          }}
        />
      )}
    </div>
  );
}

export function ResultadoLeitura({ resumo, duvidas, aoFechar }: { resumo: string[]; duvidas: number; aoFechar?: () => void }) {
  return (
    <Aviso tipo={duvidas ? "alerta" : "ok"}>
      {aoFechar && <button className="fechar-banner" onClick={aoFechar} aria-label="Fechar aviso">×</button>}
      {resumo.length ? <>Preenchido: <b>{resumo.join(", ")}</b>.</> : "Nada novo para preencher."}
      {duvidas > 0 && <> {duvidas} {duvidas > 1 ? "pontos para conferir" : "ponto para conferir"} (veja a lista em amarelo).</>}
      {" "}Os campos lidos ficam marcados. Confira antes de enviar.
    </Aviso>
  );
}

function PainelFala(p: {
  aoFechar: () => void;
  aoConcluir: (texto: string) => Promise<void>;
  lendo: string;
  erro: string;
  resultado: { resumo: string[]; duvidas: number } | null;
  falas: { id: string; em: string; texto: string; lida: boolean }[];
}) {
  const fala = useFala();
  const [digitado, setDigitado] = useState("");
  const temVoz = falaDisponivel();

  async function concluir() {
    const t = (fala.ouvindo ? fala.parar() : fala.texto).trim();
    const tudo = [t, digitado.trim()].filter(Boolean).join("\n");
    if (!tudo) return;
    setDigitado("");
    await p.aoConcluir(tudo);
  }

  return (
    <Folha titulo="Conte o que está acontecendo na obra" aoFechar={() => { if (fala.ouvindo) fala.parar(); p.aoFechar(); }}
      rodape={
        <>
          <button className="btn" onClick={() => { if (fala.ouvindo) fala.parar(); p.aoFechar(); }}>Fechar</button>
          <button className="btn pri" disabled={!!p.lendo || (!fala.texto && !fala.parcial && !digitado.trim())} onClick={concluir}>
            {p.lendo ? <><span className="giro" /> Lendo…</> : "Preencher o RDO com isso"}
          </button>
        </>
      }>
      <p className="dica">
        Fale normalmente, por exemplo: <i>"Pano 1, SP-310, km 230+100 ao 230+350, faixa 1 sentido norte, 250 por 3,5 com 5 de CBUQ.
        Usina Coplan, 38 toneladas. Chuva fraca às 10h, paramos 40 minutos."</i> Pode falar várias vezes durante o dia: cada fala vai somando.
      </p>
      {temVoz ? (
        <div className="mic-area">
          <button className={`mic ${fala.ouvindo ? "ligado" : ""}`} onClick={() => (fala.ouvindo ? fala.parar() : fala.iniciar())}
            aria-label={fala.ouvindo ? "Parar de ouvir" : "Começar a falar"}>
            <Icone nome="mic" />
          </button>
          <b>{fala.ouvindo ? "Ouvindo… toque para pausar" : fala.texto ? "Toque para continuar falando" : "Toque para começar a falar"}</b>
        </div>
      ) : (
        <Aviso tipo="alerta">Este navegador não reconhece voz. Use o botão de microfone do teclado do celular para ditar no campo abaixo.</Aviso>
      )}
      {(fala.texto || fala.parcial) && (
        <div className="transcricao">{fala.texto} <span className="parcial">{fala.parcial}</span></div>
      )}
      {fala.erro && <Aviso tipo="erro">{fala.erro}</Aviso>}
      <label className="campo">
        <span className="rotulo">Ou escreva / dite pelo teclado</span>
        <AreaTexto valor={digitado} onChange={setDigitado} linhas={3} placeholder="Ex.: liberação da pista às 17h30" />
      </label>
      {p.erro && <Aviso tipo="erro">{p.erro}</Aviso>}
      {p.resultado && <ResultadoLeitura {...p.resultado} />}
      {p.falas.length > 0 && (
        <details className="falas">
          <summary>Falas de hoje ({p.falas.length})</summary>
          <ul>{p.falas.map((f) => <li key={f.id}><small>{brDataHora(f.em)}{f.lida ? "" : " · ainda não lida"}</small><br />{f.texto}</li>)}</ul>
        </details>
      )}
    </Folha>
  );
}
