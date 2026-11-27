// Envio de um rascunho para o servidor. Cada passo concluído fica
// anotado no rascunho, então se a internet cair no meio, tentar de
// novo continua de onde parou sem duplicar nada.
import type { FotoRasc, Rascunho } from "./dominio";
import { lerArquivo } from "./locais";
import { BUCKET, sb } from "./supabase";

type Progresso = (r: Rascunho, etapa: string) => void;

async function subir(entidade: "rdo" | "lev" | "nc", id: string, foto: FotoRasc | { chave: string }, tipo: "foto" | "ficha" | "assinatura", extra: Partial<FotoRasc> = {}) {
  const blob = await lerArquivo(foto.chave);
  if (!blob) throw new Error("Uma foto não está mais no celular. Remova-a e adicione de novo.");
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${entidade}/${id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (up.error) throw up.error;
  const { error } = await sb.from("anexos").insert({
    entidade, entidade_id: id, tipo, path,
    categoria: extra.categoria ?? "", legenda: extra.legenda ?? "",
    lat: extra.lat ?? null, lon: extra.lon ?? null, tirada_em: extra.tirada_em ?? null,
  });
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return path;
}

export async function enviarRascunho(r0: Rascunho, progresso: Progresso): Promise<Rascunho> {
  let r: Rascunho = structuredClone(r0);
  const tabela = r.tipo === "rdo" ? "rdos" : "levantamentos";
  const salvar = (etapa: string) => progresso(structuredClone(r), etapa);

  // 1) registro principal (fica como rascunho no servidor até o fim)
  const linha = {
    obra_id: r.obra_id || null,
    data: r.data,
    dados: r.dados,
    assinante: r.assinatura?.nome ?? null,
    assinado_em: r.assinatura?.em ?? null,
  };
  if (!r.servidorId) {
    const { data, error } = await sb.from(tabela).insert(linha).select("id").single();
    if (error) throw error;
    r.servidorId = data.id as string;
  } else {
    const { error } = await sb.from(tabela).update(linha).eq("id", r.servidorId);
    if (error) throw error;
  }
  salvar("Registro gravado");
  const id = r.servidorId!;

  // 2) NCs indicadas no RDO
  if (r.tipo === "rdo") {
    for (const sid of r.ncsRemovidas) {
      const { error } = await sb.from("ncs").delete().eq("id", sid);
      if (error) throw error;
    }
    r.ncsRemovidas = [];
    for (const n of r.ncs) {
      const linhaNc = { rdo_id: id, tipo: n.tipo, gravidade: n.gravidade, descricao: n.descricao, acao_sugerida: n.acao_sugerida, local: n.local };
      if (!n.servidorId) {
        const { data, error } = await sb.from("ncs").insert(linhaNc).select("id").single();
        if (error) throw error;
        n.servidorId = data.id as string;
      } else {
        const { error } = await sb.from("ncs").update(linhaNc).eq("id", n.servidorId);
        if (error) throw error;
      }
      salvar("NC gravada");
      for (const f of n.fotos) {
        if (f.enviada) continue;
        f.enviada = await subir("nc", n.servidorId, f, "foto", f);
        salvar("Foto da NC enviada");
      }
    }
  }

  // 3) fotos e ficha de campo
  let i = 0;
  for (const f of r.fotos) {
    i++;
    if (f.enviada) continue;
    f.enviada = await subir(r.tipo, id, f, f.tipo, f);
    salvar(`Foto ${i} de ${r.fotos.length} enviada`);
  }

  // 4) assinatura
  if (r.assinatura && !r.assinatura.enviada) {
    r.assinatura.enviada = await subir(r.tipo, id, r.assinatura, "assinatura", { legenda: r.assinatura.nome, tirada_em: r.assinatura.em });
    salvar("Assinatura enviada");
  }

  // 5) envio para validação (o servidor confere obra e assinatura)
  const { error } = await sb.rpc(r.tipo === "rdo" ? "rdo_enviar" : "lev_enviar", { p_id: id });
  if (error) throw error;
  r = { ...r };
  return r;
}
