import { createContext, useContext } from "react";
import type { Papel } from "./dominio";

export interface Obra { id: string; nome: string; contrato: string; rodovia: string; ativa: boolean }
export interface Cadastro { id: string; tipo: "usina" | "equipe" | "equipe_pintura" | "deposito"; nome: string; ativo: boolean }
export interface Perfil { id: string; nome: string; email: string | null; papel: Papel }

export interface Ctx {
  perfil: Perfil;
  obras: Obra[];
  cadastros: Cadastro[];
  recarregarCadastros: () => Promise<void>;
  aviso: (msg: string) => void;
}

export const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("Fora do app");
  return c;
}

export const eGestao = (p: Papel) => p === "analista" || p === "engenheiro" || p === "proprietario";
export const nomesDe = (cad: Cadastro[], tipo: Cadastro["tipo"]) => cad.filter((c) => c.tipo === tipo && c.ativo).map((c) => c.nome);
export const nomeObra = (obras: Obra[], id: string | null | undefined) => obras.find((o) => o.id === id)?.nome ?? "—";
