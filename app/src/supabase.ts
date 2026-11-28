import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && chave);

/** Mostra qual servidor e tipo de chave o app recebeu no build (sem expor a chave). */
export function servidorConfigurado(): string {
  let host = url ?? "";
  try { host = new URL(url ?? "").host; } catch { host = `endereço inválido: "${url}"`; }
  const tipo = !chave ? "sem chave" : chave.startsWith("sb_publishable_") ? "chave publishable" : chave.startsWith("eyJ") ? "chave anon" : chave.startsWith("sb_secret_") ? "CHAVE SECRETA (troque!)" : "chave desconhecida";
  return `${host} · ${tipo}`;
}

export const sb = createClient(url || "http://localhost", chave || "sem-chave", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Mensagem de erro legível a partir de um erro do Supabase / rede. */
export function msgErro(e: unknown): string {
  if (!navigator.onLine) return "Sem internet. O rascunho continua salvo no celular; tente de novo quando tiver sinal.";
  const m = (e as { message?: string })?.message || String(e);
  if (/row-level security|permission denied|42501/i.test(m)) return `Você não tem permissão para isso. (detalhe: ${m})`;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) {
    let host = url || "(vazio)";
    try { host = new URL(url || "").host; } catch { /* endereço mal formado */ }
    return `Falha de conexão com o servidor ${host}. Confira a variável VITE_SUPABASE_URL na Netlify. (detalhe: ${m})`;
  }
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/User already registered/i.test(m)) return "Já existe uma conta com este e-mail.";
  return m;
}

export const BUCKET = "anexos";

/** Endereço temporário (1 hora) para abrir um arquivo privado. */
export async function urlArquivo(path: string): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
