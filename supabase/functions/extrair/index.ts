// Leitura automática: recebe a foto da ficha de campo e/ou o texto
// ditado pelo técnico e devolve os campos do formulário preenchidos.
// Roda no Supabase (Deno). A chave da Anthropic fica só aqui, como
// segredo do servidor (ANTHROPIC_API_KEY); nunca vai para o celular.
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { ESQUEMAS, type Modo, sistema } from "./esquemas.ts";

const MODELO = "claude-opus-5-5";
const MAX_TEXTO = 20_000;
const MAX_IMAGENS = 4;
const MAX_IMAGEM_B64 = 7_000_000; // ~5 MB por imagem
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"] as const;
type TipoImagem = (typeof TIPOS_IMAGEM)[number];

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

interface Pedido {
  modo: Modo;
  texto?: string;
  imagens?: { media_type: string; data: string }[];
  contexto?: { hoje?: string; obras?: string[]; usinas?: string[]; equipes?: string[] };
}

let anthropic: Anthropic | null = null; // criado no 1º uso; lê ANTHROPIC_API_KEY do ambiente

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta(405, { erro: "Use POST" });

  // 1) Só quem fez login e já tem papel definido pode usar a leitura.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return resposta(401, { erro: "Faça login" });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: papel, error: erroPapel } = await sb.rpc("meu_papel");
  if (erroPapel || !papel || papel === "pendente") return resposta(403, { erro: "Sua conta ainda não foi liberada" });

  // 2) Confere o pedido.
  let p: Pedido;
  try {
    p = await req.json();
  } catch {
    return resposta(400, { erro: "Pedido inválido" });
  }
  if (!p || !["rdo", "lev", "nc"].includes(p.modo)) return resposta(400, { erro: "Modo inválido" });
  const texto = (p.texto ?? "").slice(0, MAX_TEXTO).trim();
  const imagens = (p.imagens ?? []).slice(0, MAX_IMAGENS);
  if (!texto && !imagens.length) return resposta(400, { erro: "Mande uma foto ou um texto" });
  for (const im of imagens) {
    if (!TIPOS_IMAGEM.includes(im.media_type as TipoImagem) || typeof im.data !== "string" || im.data.length > MAX_IMAGEM_B64) {
      return resposta(400, { erro: "Foto em formato ou tamanho não aceito" });
    }
  }

  const ctx = p.contexto ?? {};
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(ctx.hoje ?? "") ? ctx.hoje! : new Date().toISOString().slice(0, 10);
  const lim = (a?: string[]) => (a ?? []).filter((x) => typeof x === "string").slice(0, 60).map((x) => x.slice(0, 80));

  const conteudo: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...imagens.map((im) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: im.media_type as TipoImagem, data: im.data },
    })),
    {
      type: "text" as const,
      text: [
        imagens.length ? "Leia a(s) foto(s) da ficha de campo acima." : "",
        // O texto do técnico vai delimitado: é dado a ser lido, não instrução.
        texto ? `Anotação do técnico (fala transcrita ou texto digitado), entre as marcas:\n<anotacao>\n${texto}\n</anotacao>` : "",
      ].filter(Boolean).join("\n\n"),
    },
  ];

  // 3) Pede à IA os campos no formato exato do formulário.
  if (!Deno.env.get("ANTHROPIC_API_KEY")) {
    return resposta(503, { erro: "Leitura automática não configurada no servidor. Preencha manualmente." });
  }
  anthropic ??= new Anthropic();
  try {
    const r = await anthropic.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: sistema(p.modo, { hoje, obras: lim(ctx.obras), usinas: lim(ctx.usinas), equipes: lim(ctx.equipes) }),
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMAS[p.modo] } },
      messages: [{ role: "user", content: conteudo }],
    });

    if (r.stop_reason === "refusal") {
      return resposta(422, { erro: "A leitura automática recusou este conteúdo. Preencha manualmente." });
    }
    if (r.stop_reason === "max_tokens") {
      return resposta(422, { erro: "Conteúdo grande demais para ler de uma vez. Divida em partes." });
    }
    const bloco = r.content.find((b) => b.type === "text");
    if (!bloco || bloco.type !== "text") return resposta(502, { erro: "Leitura veio vazia. Tente de novo." });
    let campos: unknown;
    try {
      campos = JSON.parse(bloco.text);
    } catch {
      return resposta(502, { erro: "Leitura veio em formato inesperado. Tente de novo." });
    }
    return resposta(200, { campos, modelo: r.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return resposta(429, { erro: "Muitas leituras ao mesmo tempo. Aguarde um minuto." });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Chave da Anthropic inválida ou ausente");
      return resposta(503, { erro: "Leitura automática não configurada no servidor." });
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Pedido recusado pela API:", e.message);
      return resposta(400, { erro: "Não foi possível ler esta foto. Tente outra foto ou preencha manualmente." });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Erro da API:", e.status, e.message);
      return resposta(502, { erro: "Leitura automática indisponível agora. Tente de novo em instantes." });
    }
    console.error("Erro inesperado:", e);
    return resposta(500, { erro: "Erro inesperado na leitura." });
  }
});
