// Tipos, listas e regras de conferência do RDO e do levantamento.

export type Papel = "pendente" | "tecnico" | "analista" | "engenheiro" | "proprietario";
export type Tipo = "rdo" | "lev";
export type RdoStatus = "rascunho" | "enviado" | "prevalidado" | "validado" | "devolvido";
export type LevStatus = "rascunho" | "enviado" | "preaprovado" | "aprovado" | "devolvido";
export type NcStatus = "aberta" | "tratativa" | "encerrada" | "improcedente";

export const PAPEIS: Record<Papel, string> = {
  pendente: "Aguardando liberação",
  tecnico: "Técnico",
  analista: "Analista",
  engenheiro: "Engenheiro",
  proprietario: "Proprietário",
};

export const STATUS_RDO: Record<RdoStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Aguardando pré-validação do analista",
  prevalidado: "Pré-validado (aguarda engenheiro)",
  validado: "Validado",
  devolvido: "Devolvido para correção",
};
export const STATUS_LEV: Record<LevStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Aguardando pré-aprovação do analista",
  preaprovado: "Pré-aprovado (aguarda engenheiro)",
  aprovado: "Aprovado",
  devolvido: "Devolvido para correção",
};
export const STATUS_NC: Record<NcStatus, string> = {
  aberta: "Aberta (aguarda análise)",
  tratativa: "Em tratativa",
  encerrada: "Encerrada",
  improcedente: "Não procede",
};

// Mantenha igual ao de supabase/functions/extrair/esquemas.ts
export const NC_TIPOS = [
  "Temperatura da massa fora da faixa",
  "Pintura de ligação ausente ou irregular",
  "Superfície suja ou úmida antes da aplicação",
  "Aplicação sob chuva",
  "Espessura abaixo do projeto",
  "Falha de compactação",
  "Junta mal executada",
  "Fresagem fora do especificado",
  "Sinalização provisória deficiente",
  "Falta de EPI / risco de segurança",
  "Equipamento inadequado ou com defeito",
  "Trinca / fissura",
  "Panela / buraco",
  "Desagregação / desgaste",
  "Exsudação",
  "Ondulação / escorregamento de massa",
  "Desnível entre faixas ou com acostamento",
  "Empoçamento / drenagem",
  "Outro",
];
export const GRAVIDADES = ["Baixa", "Média", "Alta"];
export const SERVICOS = [
  "CBUQ", "Gap", "PMQ", "EGL", "SMA", "Binder", "Capa", "Microrrevestimento", "TSD",
  "Reperfilagem", "Reparo profundo", "Remendo", "Fresagem", "Fresagem funcional",
  "Fresagem estrutural", "Microfresagem", "Dreno", "Outro",
];
export const CLIMAS = ["Bom", "Nublado", "Chuvoso"];
export const CLIMAS_NOITE = ["Bom", "Nublado", "Chuvoso", "Sem trabalho à noite"];
export const SENTIDOS = ["Norte", "Sul", "Leste", "Oeste", "Crescente", "Decrescente"];
export const FAIXAS = ["1", "2", "3", "Acostamento", "Dispositivo"];
export const FOTO_CATS = [
  "Antes", "Fresagem", "Pintura de ligação", "Aplicação de massa", "Compactação",
  "Geogrelha", "Selatrinca", "Dreno de pavimento", "Pista liberada", "Ocorrência", "Ficha de campo",
];
export const EQUIPAMENTOS: [string, string[]][] = [
  ["Fresagem e recomposição", ["Fresadora", "Minifresadora", "Vassoura mecânica", "Minicarregadeira (bobcat)", "Caminhão pipa", "Compressor de ar"]],
  ["Aplicação de massa", ["Vibroacabadora", "Rolo tandem (chapa)", "Rolo de pneus", "Caminhão espargidor", "Caminhão basculante"]],
  ["Reparo profundo", ["Retroescavadeira", "Escavadeira hidráulica", "Rolo compactador liso", "Placa vibratória", "Compactador de percussão (sapo)", "Serra cortadora de piso", "Rompedor / martelete"]],
  ["Demais", ["Caminhão de sinalização (PMV/seta)", "Caminhão comboio", "Soprador", "Veículo leve de apoio"]],
];

// ---------------------------------------------------------------------
// Conteúdo dos formulários (guardado em "dados" no banco)
// ---------------------------------------------------------------------
export interface Pano {
  id: string;
  numero: number | null;
  rodovia: string;
  sentido: string;
  faixa: string;
  km_inicial: number | null;
  km_final: number | null;
  comprimento_m: number | null;
  largura_m: number | null;
  espessura_cm: number | null;
  servico: string;
  toneladas: number | null;
  observacao: string;
}
export interface Carga { id: string; usina: string; mistura: string; toneladas: number | null; placa_ou_nota: string }
export interface Ocorrencia { id: string; hora: string; descricao: string }
export interface Fala { id: string; em: string; texto: string; lida: boolean }
export interface Equip { nome: string; quantidade: number }

export interface DadosRdo {
  turno: string;
  equipe: string;
  clima_manha: string;
  clima_tarde: string;
  clima_noite: string;
  chuva_paralisou: boolean | null;
  horas_paradas: number | null;
  efetivo: number | null;
  equipamentos: Equip[];
  sem_producao: boolean;
  panos: Pano[];
  cargas: Carga[];
  equipe_pintura: string;
  pintura_m2: number | null;
  liberacao_massa: string;
  sem_massa: boolean;
  liberacao_pista: string;
  ocorrencias: Ocorrencia[];
  observacoes: string;
  falas: Fala[];
}
export interface DadosLev {
  motivo: string;
  empresa: string;
  panos: Pano[];
  observacoes: string;
  falas: Fala[];
}

export interface FotoRasc {
  id: string;
  chave: string;          // onde o arquivo está guardado no celular (IndexedDB)
  tipo: "foto" | "ficha";
  categoria: string;
  legenda: string;
  lat: number | null;
  lon: number | null;
  tirada_em: string;
  enviada?: string;       // caminho no servidor depois de enviada
}
export interface NcRasc {
  id: string;
  servidorId?: string;
  tipo: string;
  gravidade: string;
  descricao: string;
  acao_sugerida: string;
  local: { rodovia: string; sentido: string; faixa: string; km_inicial: number | null; km_final: number | null; hora: string };
  fotos: FotoRasc[];
}
export interface Duvida { campo: string; motivo: string }

export interface Rascunho {
  lid: string;
  tipo: Tipo;
  servidorId?: string;          // quando já existe no servidor (ex.: devolvido)
  devolvidoMotivo?: string;
  obra_id: string;
  data: string;
  dados: DadosRdo | DadosLev;
  fotos: FotoRasc[];
  ncs: NcRasc[];
  ncsRemovidas: string[];
  assinatura?: { nome: string; chave: string; em: string; enviada?: string };
  auto: Record<string, true>;   // campos preenchidos pela leitura automática
  duvidas: Duvida[];
  sugestoesNc: { tipo: string; gravidade: string; descricao: string; rodovia: string; km_inicial: number | null }[];
  etapa: number;
  atualizado: string;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const hojeStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const agoraHora = () => new Date().toTimeString().slice(0, 5);
export const brData = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
export const brDataHora = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
export const fmt = (n: number | null | undefined, d = 0) =>
  n == null || !isFinite(n) ? "–" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fkm = (k: number | null | undefined) => {
  if (k == null || !isFinite(k)) return "–";
  const inteiro = Math.floor(k + 1e-9);
  const metros = Math.round((k - inteiro) * 1000);
  return `${inteiro}+${String(metros).padStart(3, "0")}`;
};

/** "230+100", "230,100", "230.100" ou "230" → 230.1 */
export function lerKm(s: string): number | null {
  const t = String(s ?? "").trim().replace(/\s+/g, "");
  if (!t) return null;
  let m = t.match(/^(\d{1,3})\+(\d{1,3})(?:[.,](\d+))?$/);
  if (m) return +m[1] + parseFloat(`${m[2]}.${m[3] ?? 0}`) / 1000;
  m = t.match(/^(\d{1,3})[.,](\d{1,3})$/);
  if (m) return +m[1] + +m[2].padEnd(3, "0") / 1000;
  m = t.match(/^\d{1,3}$/);
  if (m) return +t;
  return null;
}
export function lerNum(s: string): number | null {
  const t = String(s ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  const n = t.includes(",") ? parseFloat(t.replace(/\./g, "").replace(",", ".")) : parseFloat(t);
  return isFinite(n) ? n : null;
}

export function novoPano(base?: Partial<Pano>): Pano {
  return {
    id: uid(), numero: null, rodovia: "", sentido: "", faixa: "", km_inicial: null, km_final: null,
    comprimento_m: null, largura_m: null, espessura_cm: null, servico: "", toneladas: null, observacao: "", ...base,
  };
}
export function novosDadosRdo(): DadosRdo {
  return {
    turno: "Diurno", equipe: "", clima_manha: "", clima_tarde: "", clima_noite: "", chuva_paralisou: null,
    horas_paradas: null, efetivo: null, equipamentos: [], sem_producao: false, panos: [], cargas: [],
    equipe_pintura: "", pintura_m2: null, liberacao_massa: "", sem_massa: false, liberacao_pista: "",
    ocorrencias: [], observacoes: "", falas: [],
  };
}
export function novosDadosLev(): DadosLev {
  return { motivo: "", empresa: "", panos: [], observacoes: "", falas: [] };
}
export function novoRascunho(tipo: Tipo, obra_id = ""): Rascunho {
  return {
    lid: uid(), tipo, obra_id, data: hojeStr(), dados: tipo === "rdo" ? novosDadosRdo() : novosDadosLev(),
    fotos: [], ncs: [], ncsRemovidas: [], auto: {}, duvidas: [], sugestoesNc: [], etapa: 0, atualizado: new Date().toISOString(),
  };
}
export function novaNc(base?: Partial<NcRasc>): NcRasc {
  return {
    id: uid(), tipo: "", gravidade: "", descricao: "", acao_sugerida: "",
    local: { rodovia: "", sentido: "", faixa: "", km_inicial: null, km_final: null, hora: agoraHora() }, fotos: [], ...base,
  };
}

// ---------------------------------------------------------------------
// Segmentos homogêneos (planilha 03__THs_Rev01)
// ---------------------------------------------------------------------
type SH = { sh: string; rod: string; ini: number; fim: number };
const THS: SH[] = [
  ["01","SP 310",227.8,241.8],["02","SP 310",241.8,267.7],["03","SP 310",267.7,282.4],["04","SP 310",282.4,293],["05","SP 310",293,296.13],
  ["06","SP 310",296.13,301],["07","SP 310",301,308.42],["08","SP 310",308.42,320.4],["09","SP 310",320.4,321.6],["10","SP 310",321.6,329],
  ["11","SP 310",329,364.25],["12","SP 310",364.25,382.69],["13","SP 310",382.69,394.84],["14","SP 310",394.84,412.19],["15","SP 310",412.19,425.38],
  ["16","SP 310",425.38,454.3],["17","SP 323",0.001,5.75],["18","SP 323",5.75,15.1],["19","SP 323",15.1,20],["20","SP 323",20,25.15],
  ["21","SP 323",25.15,28.2],["22","SP 323",28.2,34.8],["23","SP 323",34.8,39.66],["24","SP 323",39.66,44.1],["25","SP 326",293,312.3],
  ["26","SP 326",312.3,327.9],["27","SP 326",327.9,338.1],["28","SP 326",338.1,357.6],["29","SP 326",357.6,378.99],["30","SP 326",378.99,420.29],
  ["31","SP 326",420.29,424.8],["32","SP 326",424.8,426.3],["33","SP 333",83.02,103.1],["34","SP 333",103.1,119],["35","SP 333",119,140.2],
  ["36","SP 333",140.2,145.1],["37","SP 333",145.1,147.7],["38","SP 333",147.7,157.55],["39","SP 333",157.55,159.6],["40","SP 333",159.6,173.5],
  ["41","SP 333",173.5,182.2],["42","SP 333",182.2,212.6],["43","SP 351",151,155.58],["44","SP 351",155.58,157.3],["45","SP 351",157.3,166.34],
  ["46","SP 351",166.34,186.02],["47","SP 351",186.02,193.75],["48","SP 351",193.75,210.804],["49","SP 351",210.804,214.2],["50","SP 351",214.2,218.02],
].map(([sh, rod, ini, fim]) => ({ sh: sh as string, rod: rod as string, ini: ini as number, fim: fim as number }));

const chaveRod = (s: string) => String(s || "").toUpperCase().replace(/[\s\-–]/g, "");
export const RODOVIAS = [...new Set(THS.map((t) => t.rod))];
export function acharSH(rod: string, km: number | null): SH | undefined {
  if (km == null) return undefined;
  const k = chaveRod(rod);
  return THS.find((t) => chaveRod(t.rod) === k && km >= t.ini - 1e-9 && km <= t.fim + 1e-9);
}
export function rodoviaConhecida(rod: string) {
  return THS.some((t) => chaveRod(t.rod) === chaveRod(rod));
}

// ---------------------------------------------------------------------
// Conferências
// ---------------------------------------------------------------------
export const areaPano = (p: Pano) => (p.comprimento_m ?? 0) * (p.largura_m ?? 0);

export function avisosPano(p: Pano): string[] {
  const a: string[] = [];
  if (p.km_inicial != null && p.km_final != null && p.km_final < p.km_inicial && !/decres/i.test(p.sentido)) a.push("km final menor que o inicial");
  if (p.km_inicial != null && p.km_final != null && p.comprimento_m != null) {
    const ext = Math.abs(p.km_final - p.km_inicial) * 1000;
    if (ext > 0 && Math.abs(ext - p.comprimento_m) > Math.max(20, ext * 0.2)) a.push(`comprimento (${fmt(p.comprimento_m)} m) não bate com a distância entre os km (${fmt(ext)} m)`);
  }
  if (p.largura_m != null && (p.largura_m <= 0 || p.largura_m > 15)) a.push("largura fora do normal (0 a 15 m)");
  if (p.espessura_cm != null && (p.espessura_cm <= 0 || p.espessura_cm > 20)) a.push("espessura fora do normal (0 a 20 cm)");
  if (p.rodovia && rodoviaConhecida(p.rodovia) && p.km_inicial != null && !acharSH(p.rodovia, p.km_inicial)) a.push("km fora dos segmentos cadastrados desta rodovia");
  return a;
}

export function totais(panos: Pano[]) {
  const area = panos.reduce((s, p) => s + areaPano(p), 0);
  const ton = panos.reduce((s, p) => s + (p.toneladas ?? 0), 0);
  const ext = panos.reduce((s, p) => s + (p.comprimento_m ?? 0), 0);
  return { area, ton, ext, n: panos.length };
}

export function pendencias(r: Rascunho): string[] {
  const out: string[] = [];
  if (!r.obra_id) out.push("Escolher a obra");
  if (!r.data) out.push("Informar a data");
  if (r.tipo === "rdo") {
    const d = r.dados as DadosRdo;
    if (!d.clima_manha) out.push("Clima da manhã");
    if (!d.clima_tarde) out.push("Clima da tarde");
    if (!d.sem_producao && !d.panos.length) out.push("Lançar ao menos um pano ou marcar \"sem produção no dia\"");
    if (!d.liberacao_pista) out.push("Horário de liberação da pista");
    if (!d.sem_massa && !d.liberacao_massa && d.panos.length) out.push("Horário de liberação da equipe de massa (ou marcar que não houve)");
  } else {
    const d = r.dados as DadosLev;
    if (!d.motivo) out.push("Motivo do levantamento");
    if (!d.panos.length) out.push("Lançar ao menos um pano");
  }
  const panos = (r.dados as DadosRdo | DadosLev).panos;
  panos.forEach((p, i) => {
    const n = p.numero ?? i + 1;
    if (p.km_inicial == null || p.km_final == null) out.push(`Pano ${n}: km inicial e final`);
    if (p.comprimento_m == null || p.largura_m == null) out.push(`Pano ${n}: comprimento e largura`);
    if (!p.rodovia) out.push(`Pano ${n}: rodovia`);
  });
  r.ncs.forEach((n, i) => {
    if (!n.tipo) out.push(`NC ${i + 1}: tipo`);
    if (!n.descricao.trim()) out.push(`NC ${i + 1}: descrição`);
  });
  if (!r.assinatura) out.push("Assinar");
  return out;
}
