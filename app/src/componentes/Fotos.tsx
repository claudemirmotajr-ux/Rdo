import { useEffect, useRef, useState } from "react";
import { type FotoRasc, FOTO_CATS, uid } from "../dominio";
import { apagarArquivo, comprimirImagem, guardarArquivo, lerArquivo, posicaoAtual } from "../locais";
import { Icone, Selecao } from "./ui";

/** Miniatura de uma foto guardada no celular. */
export function Miniatura({ chave, alt }: { chave: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    let vivo = true;
    lerArquivo(chave).then((b) => { if (b && vivo) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [chave]);
  return url ? <img src={url} alt={alt} /> : <span className="sem-img">…</span>;
}

export function Fotos(p: { fotos: FotoRasc[]; mudar: (f: FotoRasc[]) => void; categorias?: string[]; aviso: (m: string) => void }) {
  const [cat, setCat] = useState(p.categorias?.[0] ?? "Antes");
  const [ocupado, setOcupado] = useState(false);
  const atual = useRef(p.fotos);
  atual.current = p.fotos;
  const cats = p.categorias ?? FOTO_CATS;

  async function adicionar(arqs: FileList | null) {
    // copia já: a FileList esvazia quando o campo é limpo logo após a escolha
    const lista = arqs ? Array.from(arqs) : [];
    if (!lista.length) return;
    setOcupado(true);
    try {
      const gps = await posicaoAtual();
      const novas: FotoRasc[] = [];
      for (const a of lista) {
        const blob = await comprimirImagem(a);
        const chave = await guardarArquivo(blob);
        novas.push({ id: uid(), chave, tipo: "foto", categoria: cat, legenda: "", lat: gps?.lat ?? null, lon: gps?.lon ?? null, tirada_em: new Date().toISOString() });
      }
      p.mudar([...atual.current, ...novas]);
      if (!gps) p.aviso("Fotos salvas sem localização (GPS desligado ou negado)");
    } catch (e) {
      p.aviso((e as Error).message || "Não foi possível salvar a foto");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="fotos">
      <div className="linha-fotos">
        <label className="campo">
          <span className="rotulo">Categoria das próximas fotos</span>
          <Selecao valor={cat} opcoes={cats} onChange={(v) => setCat(v || cats[0])} />
        </label>
        <div className="botoes-foto">
          <label className="btn">
            <Icone nome="camera" /> Tirar foto
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          </label>
          <label className="btn">
            Da galeria
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {ocupado && <p className="dica"><span className="giro" /> Salvando fotos…</p>}
      <div className="grade-fotos">
        {p.fotos.map((f) => (
          <figure key={f.id} className="foto">
            <div className="img">
              <Miniatura chave={f.chave} alt={f.categoria} />
              <span className={`etiqueta ${f.tipo === "ficha" ? "ficha" : ""}`}>{f.categoria}{f.lat != null ? " · GPS" : ""}</span>
              {!f.enviada && (
                <button className="remover" aria-label="Remover foto"
                  onClick={() => { apagarArquivo(f.chave); p.mudar(p.fotos.filter((x) => x.id !== f.id)); }}>×</button>
              )}
            </div>
            <input className="legenda" placeholder="Legenda (opcional)" value={f.legenda}
              onChange={(e) => p.mudar(p.fotos.map((x) => (x.id === f.id ? { ...x, legenda: e.target.value } : x)))} />
          </figure>
        ))}
      </div>
    </div>
  );
}
