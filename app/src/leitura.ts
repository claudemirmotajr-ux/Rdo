// Leitura automática (fala ou foto da ficha) e aplicação no rascunho.
// Regra: o que a leitura traz só preenche campo vazio. Se o campo já
// tem outro valor, vira uma dúvida para o técnico decidir — nada que
// ele digitou é apagado.
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  type DadosLev, type DadosRdo, type Duvida, type NcRasc, type Pano, type Rascunho,
  fkm, novoPano, uid,
} from "./dominio";
import { sb } from "./supabase";

type Campos = Record<string, unknown>;

export async function lerAutomatico(
  modo: "rdo" | "lev" | "nc",
  entrada: { texto?: string; imagens?: { media_type: string; data: string }[] },
  contexto: { hoje: string; obras: string[]; usinas: string[]; equipes: string[] },
): Promise<Campos> {
  if (!navigator.onLine) throw new Error("Sem internet agora. A fala ficou guardada; toque em \"Ler de novo\" quando tiver sinal.");
  const { data, error } = await sb.functions.invoke("extrair", { body: { modo, ...entrada, contexto } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null);
      throw new Error(corpo?.erro || "A leitura automática falhou. Tente de novo.");
    }
    throw new Error("Não foi possível falar com o servidor de leitura. Tente de novo.");
  }
  return (data as { campos: Campos }).campos;
}

const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nOuNull = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

interface Ctx { auto: Record<string, true>; duvidas: Duvida[]; resumo: string[] }

function preencher<T extends object>(alvo: T, chave: keyof T & string, valor: unknown, rotulo: string, ctx: Ctx, prefixo = "") {
  if (vazio(valor)) return;
  const atual = alvo[chave] as unknown;
  if (vazio(atual)) {
    (alvo as Record<string, unknown>)[chave] = valor;
    ctx.auto[prefixo + chave] = true;
    ctx.resumo.push(rotulo);
  } else if (String(atual) !== String(valor)) {
    ctx.duvidas.push({ campo: rotulo, motivo: `A leitura trouxe "${String(valor)}", mas o campo já tinha "${String(atual)}". Mantive o que estava.` });
  }
}

function panoDe(c: Campos, extras: Partial<Pano> = {}): Pano {
  return novoPano({
    numero: nOuNull(c.numero),
    rodovia: str(c.rodovia),
    sentido: str(c.sentido),
    faixa: str(c.faixa),
    km_inicial: nOuNull(c.km_inicial),
    km_final: nOuNull(c.km_final),
    comprimento_m: nOuNull(c.comprimento_m),
    largura_m: nOuNull(c.largura_m),
    espessura_cm: nOuNull(c.espessura_cm),
    servico: str(c.servico),
    toneladas: nOuNull(c.toneladas),
    observacao: str(c.observacao),
    ...extras,
  });
}

function juntarPanos(atuais: Pano[], novos: Campos[], ctx: Ctx): Pano[] {
  const out = atuais.map((p) => ({ ...p }));
  let add = 0;
  let compl = 0;
  for (const c of novos) {
    const n = panoDe(c);
    // mesmo trecho (mesmos km) → completa o que falta em vez de duplicar
    const igual = out.find((p) => p.km_inicial != null && p.km_inicial === n.km_inicial && p.km_final === n.km_final
      && (!p.rodovia || !n.rodovia || p.rodovia === n.rodovia));
    if (igual) {
      for (const k of ["rodovia", "sentido", "faixa", "comprimento_m", "largura_m", "espessura_cm", "servico", "toneladas", "observacao", "numero"] as const) {
        if (vazio(igual[k]) && !vazio(n[k])) {
          (igual as unknown as Record<string, unknown>)[k] = n[k];
          ctx.auto[`pano:${igual.id}:${k}`] = true;
        }
      }
      compl++;
    } else {
      if (n.numero == null) n.numero = out.length + 1;
      for (const k of Object.keys(n) as (keyof Pano)[]) if (k !== "id" && !vazio(n[k])) ctx.auto[`pano:${n.id}:${k}`] = true;
      out.push(n);
      add++;
    }
  }
  if (add) ctx.resumo.push(`${add} ${add > 1 ? "panos novos" : "pano novo"}`);
  if (compl) ctx.resumo.push(`${compl} ${compl > 1 ? "panos completados" : "pano completado"}`);
  return out;
}

function duvidasDaLeitura(c: Campos, ctx: Ctx) {
  for (const d of (c.duvidas as Duvida[] | undefined) ?? []) {
    if (d && d.campo) ctx.duvidas.push({ campo: d.campo, motivo: d.motivo || "Conferir" });
  }
}

/** Aplica o resultado de uma leitura num RDO ou levantamento. Devolve o rascunho novo e o resumo do que entrou. */
export function aplicarLeitura(r: Rascunho, c: Campos): { novo: Rascunho; resumo: string[]; duvidas: number } {
  const ctx: Ctx = { auto: { ...r.auto }, duvidas: [], resumo: [] };
  const novo: Rascunho = structuredClone(r);
  if (typeof c.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.data) && c.data !== novo.data) {
    ctx.duvidas.push({ campo: "Data", motivo: `A anotação fala em ${c.data.split("-").reverse().join("/")}, mas o RDO está com ${novo.data.split("-").reverse().join("/")}. Confira.` });
  }

  if (novo.tipo === "rdo") {
    const d = novo.dados as DadosRdo;
    preencher(d, "turno", c.turno, "Turno", ctx);
    preencher(d, "equipe", c.equipe, "Equipe", ctx);
    preencher(d, "clima_manha", c.clima_manha, "Clima da manhã", ctx);
    preencher(d, "clima_tarde", c.clima_tarde, "Clima da tarde", ctx);
    preencher(d, "clima_noite", c.clima_noite, "Clima da noite", ctx);
    preencher(d, "chuva_paralisou", c.chuva_paralisou, "Chuva paralisou", ctx);
    preencher(d, "horas_paradas", c.horas_paradas, "Horas paradas", ctx);
    preencher(d, "efetivo", c.efetivo, "Efetivo", ctx);
    preencher(d, "equipe_pintura", c.equipe_pintura, "Equipe de pintura", ctx);
    preencher(d, "pintura_m2", c.pintura_m2, "Metragem de pintura", ctx);
    preencher(d, "liberacao_massa", c.liberacao_massa, "Liberação da massa", ctx);
    preencher(d, "liberacao_pista", c.liberacao_pista, "Liberação da pista", ctx);

    const eq = (c.equipamentos as { nome: string; quantidade: number }[] | undefined) ?? [];
    if (eq.length) {
      for (const e of eq) {
        const atual = d.equipamentos.find((x) => x.nome.toLowerCase() === e.nome.toLowerCase());
        if (!atual) d.equipamentos.push({ nome: e.nome, quantidade: e.quantidade || 1 });
        else if (!atual.quantidade) atual.quantidade = e.quantidade;
      }
      ctx.auto["equipamentos"] = true;
      ctx.resumo.push("Equipamentos");
    }
    const panos = (c.panos as Campos[] | undefined) ?? [];
    if (panos.length) d.panos = juntarPanos(d.panos, panos, ctx);
    if (d.panos.length) d.sem_producao = false;

    const cargas = (c.cargas as Campos[] | undefined) ?? [];
    for (const k of cargas) {
      d.cargas.push({ id: uid(), usina: str(k.usina), mistura: str(k.mistura), toneladas: nOuNull(k.toneladas), placa_ou_nota: str(k.placa_ou_nota) });
    }
    if (cargas.length) { ctx.auto["cargas"] = true; ctx.resumo.push(`${cargas.length} ${cargas.length > 1 ? "cargas de massa" : "carga de massa"}`); }

    const oc = (c.ocorrencias as Campos[] | undefined) ?? [];
    for (const o of oc) if (str(o.descricao)) d.ocorrencias.push({ id: uid(), hora: str(o.hora), descricao: str(o.descricao) });
    if (oc.length) ctx.resumo.push(`${oc.length} ${oc.length > 1 ? "ocorrências" : "ocorrência"}`);

    if (str(c.observacoes)) {
      d.observacoes = d.observacoes ? `${d.observacoes}\n${str(c.observacoes)}` : str(c.observacoes);
      ctx.auto["observacoes"] = true;
      ctx.resumo.push("Observações");
    }
    const sug = (c.ncs_sugeridas as Campos[] | undefined) ?? [];
    for (const s of sug) {
      novo.sugestoesNc.push({ tipo: str(s.tipo), gravidade: str(s.gravidade), descricao: str(s.descricao), rodovia: str(s.rodovia), km_inicial: nOuNull(s.km_inicial) });
    }
    if (sug.length) ctx.resumo.push(`${sug.length} ${sug.length > 1 ? "possíveis NCs" : "possível NC"} para você confirmar`);
  } else {
    const d = novo.dados as DadosLev;
    preencher(d, "motivo", c.motivo, "Motivo", ctx);
    preencher(d, "empresa", c.empresa, "Empresa / equipe", ctx);
    const panos = (c.panos as Campos[] | undefined) ?? [];
    if (panos.length) d.panos = juntarPanos(d.panos, panos, ctx);
    if (str(c.observacoes)) {
      d.observacoes = d.observacoes ? `${d.observacoes}\n${str(c.observacoes)}` : str(c.observacoes);
      ctx.auto["observacoes"] = true;
      ctx.resumo.push("Observações");
    }
  }
  duvidasDaLeitura(c, ctx);
  novo.auto = ctx.auto;
  novo.duvidas = [...novo.duvidas, ...ctx.duvidas];
  return { novo, resumo: ctx.resumo, duvidas: ctx.duvidas.length };
}

/** Aplica uma leitura na NC que está sendo preenchida. */
export function aplicarLeituraNc(n: NcRasc, c: Campos): { nova: NcRasc; resumo: string[] } {
  const nova: NcRasc = structuredClone(n);
  const resumo: string[] = [];
  const set = (k: "tipo" | "gravidade" | "descricao" | "acao_sugerida", rot: string) => {
    const v = str(c[k]);
    if (v && !nova[k]) { nova[k] = v; resumo.push(rot); }
  };
  set("tipo", "Tipo"); set("gravidade", "Gravidade"); set("descricao", "Descrição"); set("acao_sugerida", "Ação sugerida");
  if (str(c.descricao) && nova.descricao && !nova.descricao.includes(str(c.descricao))) nova.descricao += `\n${str(c.descricao)}`;
  const L = nova.local;
  if (!L.rodovia && str(c.rodovia)) { L.rodovia = str(c.rodovia); resumo.push("Rodovia"); }
  if (!L.sentido && str(c.sentido)) L.sentido = str(c.sentido);
  if (!L.faixa && str(c.faixa)) L.faixa = str(c.faixa);
  if (L.km_inicial == null && nOuNull(c.km_inicial) != null) { L.km_inicial = nOuNull(c.km_inicial); resumo.push(`km ${fkm(L.km_inicial)}`); }
  if (L.km_final == null && nOuNull(c.km_final) != null) L.km_final = nOuNull(c.km_final);
  if (str(c.hora)) L.hora = str(c.hora);
  return { nova, resumo };
}
