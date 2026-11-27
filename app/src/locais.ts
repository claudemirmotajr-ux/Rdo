// Rascunhos ficam no próprio celular até o envio: funcionam sem
// internet e não somem se o app for fechado. Fotos ficam no IndexedDB
// (cabe muito mais que no localStorage).
import { createStore, del, get, set } from "idb-keyval";
import type { Rascunho } from "./dominio";

const loja = createStore("rdo-arquivos", "arquivos");
const CHAVE = "rdo-rascunhos-v1";

function chaveUsuario(usuario: string) {
  return `${CHAVE}:${usuario}`;
}

export function lerRascunhos(usuario: string): Rascunho[] {
  try {
    const v = localStorage.getItem(chaveUsuario(usuario));
    return v ? (JSON.parse(v) as Rascunho[]) : [];
  } catch {
    return [];
  }
}

export function gravarRascunhos(usuario: string, lista: Rascunho[]): boolean {
  try {
    localStorage.setItem(chaveUsuario(usuario), JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

export async function guardarArquivo(blob: Blob): Promise<string> {
  const chave = "a-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await set(chave, blob, loja);
  return chave;
}
export const lerArquivo = (chave: string) => get<Blob>(chave, loja);
export const apagarArquivo = (chave: string) => del(chave, loja);

export async function apagarArquivosDoRascunho(r: Rascunho) {
  const chaves = [
    ...r.fotos.map((f) => f.chave),
    ...r.ncs.flatMap((n) => n.fotos.map((f) => f.chave)),
    ...(r.assinatura ? [r.assinatura.chave] : []),
  ];
  await Promise.all(chaves.map((c) => apagarArquivo(c).catch(() => undefined)));
}

/** Reduz a foto para no máximo `lado` px e JPEG, para economizar dados. */
export async function comprimirImagem(arquivo: Blob, lado = 1600, qualidade = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((ok, falha) =>
    c.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível processar a foto"))), "image/jpeg", qualidade),
  );
}

export async function blobParaBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Posição atual do GPS (ou null se negado / indisponível em 8 s). */
export function posicaoAtual(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}
