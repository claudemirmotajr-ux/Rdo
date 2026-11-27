import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { fkm, lerKm, lerNum } from "../dominio";

export function Campo(props: {
  rotulo: string; obrigatorio?: boolean; dica?: string; auto?: boolean; aviso?: string; children: ReactNode; className?: string;
}) {
  return (
    <label className={`campo ${props.auto ? "auto" : ""} ${props.aviso ? "com-aviso" : ""} ${props.className ?? ""}`}>
      <span className="rotulo">
        {props.rotulo}
        {props.obrigatorio && <em className="obr"> *</em>}
        {props.auto && <span className="selo-auto" title="Preenchido pela leitura automática. Confira.">lido automaticamente</span>}
      </span>
      {props.dica && <span className="dica">{props.dica}</span>}
      {props.children}
      {props.aviso && <span className="aviso">{props.aviso}</span>}
    </label>
  );
}

export function Texto(p: { valor: string; onChange: (v: string) => void; placeholder?: string; tipo?: string; autoComplete?: string; lista?: string[] }) {
  const id = useId();
  return (
    <>
      <input type={p.tipo ?? "text"} value={p.valor} placeholder={p.placeholder} autoComplete={p.autoComplete}
        list={p.lista?.length ? id : undefined} onChange={(e) => p.onChange(e.target.value)} />
      {p.lista?.length ? <datalist id={id}>{p.lista.map((x) => <option key={x} value={x} />)}</datalist> : null}
    </>
  );
}

export function AreaTexto(p: { valor: string; onChange: (v: string) => void; placeholder?: string; linhas?: number }) {
  return <textarea value={p.valor} placeholder={p.placeholder} rows={p.linhas ?? 3} onChange={(e) => p.onChange(e.target.value)} />;
}

/** Campo numérico que aceita vírgula (e "230+100" quando km). */
export function Numero(p: { valor: number | null; onChange: (v: number | null) => void; unidade?: string; km?: boolean; placeholder?: string }) {
  const mostrar = (v: number | null) => (v == null ? "" : p.km ? fkm(v) : String(v).replace(".", ","));
  const [txt, setTxt] = useState(mostrar(p.valor));
  const editando = useRef(false);
  useEffect(() => { if (!editando.current) setTxt(mostrar(p.valor)); }, [p.valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="com-unidade">
      <input inputMode="decimal" value={txt} placeholder={p.placeholder ?? (p.km ? "230+100" : "")}
        onFocus={() => { editando.current = true; }}
        onChange={(e) => { setTxt(e.target.value); p.onChange(p.km ? lerKm(e.target.value) : lerNum(e.target.value)); }}
        onBlur={() => { editando.current = false; setTxt(mostrar(p.km ? lerKm(txt) : lerNum(txt))); }} />
      {p.unidade && <span className="unidade">{p.unidade}</span>}
    </span>
  );
}

export function Opcoes(p: { valor: string; opcoes: string[]; onChange: (v: string) => void; permiteLimpar?: boolean }) {
  return (
    <div className="opcoes" role="group">
      {p.opcoes.map((o) => (
        <button type="button" key={o} aria-pressed={p.valor === o}
          onClick={() => p.onChange(p.permiteLimpar && p.valor === o ? "" : o)}>{o}</button>
      ))}
    </div>
  );
}

export function Selecao(p: { valor: string; opcoes: { v: string; t: string }[] | string[]; onChange: (v: string) => void; vazio?: string }) {
  const ops = (p.opcoes as (string | { v: string; t: string })[]).map((o) => (typeof o === "string" ? { v: o, t: o } : o));
  return (
    <select value={p.valor} onChange={(e) => p.onChange(e.target.value)}>
      <option value="">{p.vazio ?? "Escolha"}</option>
      {ops.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  );
}

export function Folha(p: { titulo: string; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }) {
  const fechar = useRef(p.aoFechar);
  fechar.current = p.aoFechar;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="fundo-folha" onClick={(e) => e.target === e.currentTarget && p.aoFechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={p.titulo}>
        <div className="folha-topo">
          <h2>{p.titulo}</h2>
          <button className="fechar" onClick={p.aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="folha-corpo">{p.children}</div>
        {p.rodape && <div className="folha-rodape">{p.rodape}</div>}
      </div>
    </div>
  );
}

export function Aviso(p: { tipo?: "info" | "alerta" | "erro" | "ok"; children: ReactNode }) {
  return <div className={`banner ${p.tipo ?? "info"}`}>{p.children}</div>;
}

export function Icone({ nome }: { nome: keyof typeof ICONES }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONES[nome] }} />;
}
const ICONES = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  doc: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
