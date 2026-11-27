import { type Pano, FAIXAS, RODOVIAS, SENTIDOS, SERVICOS, acharSH, areaPano, avisosPano, fkm, fmt, novoPano, totais } from "../dominio";
import { Campo, Icone, Numero, Selecao, Texto } from "./ui";

export function Panos(p: { panos: Pano[]; mudar: (panos: Pano[]) => void; auto: Record<string, true>; comToneladas?: boolean; rodoviaPadrao?: string }) {
  const t = totais(p.panos);
  const set = (i: number, k: keyof Pano, v: unknown) => {
    const novo = p.panos.map((x, j) => (j === i ? { ...x, [k]: v } : x));
    p.mudar(novo);
  };
  const adicionar = () => {
    const ult = p.panos.at(-1);
    p.mudar([...p.panos, novoPano({
      numero: p.panos.length + 1,
      rodovia: ult?.rodovia || p.rodoviaPadrao || "",
      sentido: ult?.sentido ?? "", faixa: ult?.faixa ?? "", servico: ult?.servico ?? "",
      largura_m: ult?.largura_m ?? null, espessura_cm: ult?.espessura_cm ?? null,
      km_inicial: ult?.km_final ?? null,
    })]);
  };
  return (
    <div className="panos">
      {p.panos.length > 0 && (
        <div className="resumo-panos">
          <div><b>{t.n}</b> {t.n > 1 ? "panos" : "pano"}</div>
          <div><b>{fmt(t.ext)}</b> m</div>
          <div><b>{fmt(t.area)}</b> m²</div>
          {p.comToneladas && <div><b>{fmt(t.ton, 1)}</b> t</div>}
        </div>
      )}
      {p.panos.map((x, i) => {
        const a = (k: string) => !!p.auto[`pano:${x.id}:${k}`];
        const sh = acharSH(x.rodovia, x.km_inicial);
        const avisos = avisosPano(x);
        return (
          <section key={x.id} className={`cartao pano ${avisos.length ? "com-aviso" : ""}`}>
            <header>
              <h3>Pano {x.numero ?? i + 1}</h3>
              <span className="dica">{sh ? `SH ${sh.sh} · ` : ""}{x.km_inicial != null ? `km ${fkm(x.km_inicial)} a ${fkm(x.km_final)}` : ""}{areaPano(x) ? ` · ${fmt(areaPano(x))} m²` : ""}</span>
              <button className="btn pequeno perigo" onClick={() => p.mudar(p.panos.filter((_, j) => j !== i))} aria-label={`Remover pano ${i + 1}`}><Icone nome="lixo" /></button>
            </header>
            <div className="grade g3">
              <Campo rotulo="Rodovia" obrigatorio auto={a("rodovia")}><Texto valor={x.rodovia} onChange={(v) => set(i, "rodovia", v)} lista={RODOVIAS} placeholder="SP 310" /></Campo>
              <Campo rotulo="Sentido" auto={a("sentido")}><Texto valor={x.sentido} onChange={(v) => set(i, "sentido", v)} lista={SENTIDOS} /></Campo>
              <Campo rotulo="Faixa" auto={a("faixa")}><Texto valor={x.faixa} onChange={(v) => set(i, "faixa", v)} lista={FAIXAS} /></Campo>
              <Campo rotulo="km inicial" obrigatorio auto={a("km_inicial")}><Numero km valor={x.km_inicial} onChange={(v) => set(i, "km_inicial", v)} /></Campo>
              <Campo rotulo="km final" obrigatorio auto={a("km_final")}><Numero km valor={x.km_final} onChange={(v) => set(i, "km_final", v)} /></Campo>
              <Campo rotulo="Serviço" auto={a("servico")}><Selecao valor={x.servico} opcoes={SERVICOS} onChange={(v) => set(i, "servico", v)} /></Campo>
              <Campo rotulo="Comprimento" obrigatorio auto={a("comprimento_m")}><Numero valor={x.comprimento_m} unidade="m" onChange={(v) => set(i, "comprimento_m", v)} /></Campo>
              <Campo rotulo="Largura" obrigatorio auto={a("largura_m")}><Numero valor={x.largura_m} unidade="m" onChange={(v) => set(i, "largura_m", v)} /></Campo>
              <Campo rotulo="Espessura" auto={a("espessura_cm")}><Numero valor={x.espessura_cm} unidade="cm" onChange={(v) => set(i, "espessura_cm", v)} /></Campo>
              {p.comToneladas && <Campo rotulo="Toneladas aplicadas" auto={a("toneladas")}><Numero valor={x.toneladas} unidade="t" onChange={(v) => set(i, "toneladas", v)} /></Campo>}
              <Campo rotulo="Observação do pano" auto={a("observacao")} className="largo"><Texto valor={x.observacao} onChange={(v) => set(i, "observacao", v)} /></Campo>
            </div>
            {avisos.length > 0 && <ul className="avisos">{avisos.map((v) => <li key={v}>{v}</li>)}</ul>}
          </section>
        );
      })}
      <button className="btn largo tracejado" onClick={adicionar}><Icone nome="mais" /> Adicionar pano</button>
    </div>
  );
}
