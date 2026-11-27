import { useEffect, useRef, useState } from "react";
import { guardarArquivo } from "../locais";
import { brDataHora } from "../dominio";
import { Miniatura } from "./Fotos";

export function Assinatura(p: {
  valor?: { nome: string; chave: string; em: string };
  nomePadrao: string;
  mudar: (v: { nome: string; chave: string; em: string } | undefined) => void;
}) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [nome, setNome] = useState(p.nomePadrao);
  const [riscou, setRiscou] = useState(false);

  useEffect(() => {
    const c = tela.current;
    if (!c || p.valor) return;
    const dpr = window.devicePixelRatio || 1;
    const larg = c.parentElement!.clientWidth;
    c.width = larg * dpr;
    c.height = 180 * dpr;
    c.style.width = `${larg}px`;
    c.style.height = "180px";
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1D2125";
    let desenhando = false;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const ini = (e: PointerEvent) => { desenhando = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
    const mov = (e: PointerEvent) => { if (!desenhando) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); setRiscou(true); };
    const fim = () => { desenhando = false; };
    c.addEventListener("pointerdown", ini);
    c.addEventListener("pointermove", mov);
    c.addEventListener("pointerup", fim);
    c.addEventListener("pointercancel", fim);
    return () => {
      c.removeEventListener("pointerdown", ini);
      c.removeEventListener("pointermove", mov);
      c.removeEventListener("pointerup", fim);
      c.removeEventListener("pointercancel", fim);
    };
  }, [p.valor]);

  if (p.valor) {
    return (
      <div className="assinado">
        <div className="assinatura-img"><Miniatura chave={p.valor.chave} alt="Assinatura" /></div>
        <p>Assinado por <b>{p.valor.nome}</b> em {brDataHora(p.valor.em)}</p>
        <button className="btn pequeno" onClick={() => { p.mudar(undefined); setRiscou(false); }}>Assinar de novo</button>
      </div>
    );
  }

  async function confirmar() {
    const c = tela.current!;
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (!blob) return;
    const chave = await guardarArquivo(blob);
    p.mudar({ nome: nome.trim(), chave, em: new Date().toISOString() });
  }

  return (
    <div className="assinar">
      <label className="campo">
        <span className="rotulo">Nome de quem assina <em className="obr">*</em></span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <div className="caixa-assinatura">
        <canvas ref={tela} aria-label="Assine com o dedo" />
        <span className="linha-assinatura">Assine aqui com o dedo</span>
      </div>
      <div className="linha-botoes">
        <button className="btn" onClick={() => { const c = tela.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setRiscou(false); }}>Limpar</button>
        <button className="btn pri" disabled={!riscou || nome.trim().length < 3} onClick={confirmar}>Confirmar assinatura</button>
      </div>
    </div>
  );
}
