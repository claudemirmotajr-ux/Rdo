// Esquemas de saída da leitura automática (foto da ficha de campo ou
// fala do técnico). A IA só pode devolver JSON neste formato.
// Mantenha NC_TIPOS igual ao de app/src/dominio.ts.

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
] as const;

export const SERVICOS = [
  "CBUQ", "Gap", "PMQ", "EGL", "SMA", "Binder", "Capa", "Microrrevestimento", "TSD",
  "Reperfilagem", "Reparo profundo", "Remendo", "Fresagem", "Fresagem funcional",
  "Fresagem estrutural", "Microfresagem", "Dreno", "Outro",
] as const;

const txt = { anyOf: [{ type: "string" }, { type: "null" }] };
const numero = { anyOf: [{ type: "number" }, { type: "null" }] };
const inteiro = { anyOf: [{ type: "integer" }, { type: "null" }] };
const bool = { anyOf: [{ type: "boolean" }, { type: "null" }] };
const umDe = (vals: readonly string[]) => ({ anyOf: [{ type: "string", enum: [...vals] }, { type: "null" }] });

function obj(props: Record<string, unknown>) {
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}
const lista = (item: unknown) => ({ type: "array", items: item });

const CLIMAS = ["Bom", "Nublado", "Chuvoso"];

const pano = obj({
  numero: inteiro,
  rodovia: txt,
  sentido: txt,
  faixa: txt,
  km_inicial: numero,
  km_final: numero,
  comprimento_m: numero,
  largura_m: numero,
  espessura_cm: numero,
  servico: umDe(SERVICOS),
  toneladas: numero,
  observacao: txt,
});

const duvidas = lista(obj({ campo: { type: "string" }, motivo: { type: "string" } }));

export const ESQUEMA_RDO = obj({
  data: txt,
  turno: umDe(["Diurno", "Noturno"]),
  equipe: txt,
  clima_manha: umDe(CLIMAS),
  clima_tarde: umDe(CLIMAS),
  clima_noite: umDe([...CLIMAS, "Sem trabalho à noite"]),
  chuva_paralisou: bool,
  horas_paradas: numero,
  efetivo: inteiro,
  equipamentos: lista(obj({ nome: { type: "string" }, quantidade: { type: "integer" } })),
  panos: lista(pano),
  cargas: lista(obj({ usina: txt, mistura: txt, toneladas: numero, placa_ou_nota: txt })),
  equipe_pintura: txt,
  pintura_m2: numero,
  liberacao_massa: txt,
  liberacao_pista: txt,
  ocorrencias: lista(obj({ hora: txt, descricao: { type: "string" } })),
  observacoes: txt,
  ncs_sugeridas: lista(obj({
    tipo: { type: "string", enum: [...NC_TIPOS] },
    gravidade: umDe(["Baixa", "Média", "Alta"]),
    descricao: { type: "string" },
    rodovia: txt,
    km_inicial: numero,
  })),
  duvidas,
});

export const ESQUEMA_LEV = obj({
  data: txt,
  motivo: txt,
  empresa: txt,
  panos: lista(pano),
  observacoes: txt,
  duvidas,
});

export const ESQUEMA_NC = obj({
  tipo: umDe(NC_TIPOS),
  gravidade: umDe(["Baixa", "Média", "Alta"]),
  descricao: txt,
  acao_sugerida: txt,
  rodovia: txt,
  sentido: txt,
  faixa: txt,
  km_inicial: numero,
  km_final: numero,
  hora: txt,
  duvidas,
});

export type Modo = "rdo" | "lev" | "nc";
export const ESQUEMAS: Record<Modo, Record<string, unknown>> = { rdo: ESQUEMA_RDO, lev: ESQUEMA_LEV, nc: ESQUEMA_NC };

const REGRAS = `
Você lê anotações de obra de pavimentação asfáltica em rodovias de São Paulo e transforma em campos de formulário.

Regras:
- Use somente o que está escrito ou foi dito. Nunca invente valor. Se um campo não aparece, devolva null (ou lista vazia).
- Se um valor está ilegível, ambíguo ou parece errado (km final menor que o inicial, largura acima de 15 m, espessura acima de 20 cm, data impossível), preencha o que conseguir e registre em "duvidas" com o nome do campo e o motivo em português simples.
- Quilometragem: "km 230+100", "230,100" e "230.100" significam 230,100 km. Devolva como número decimal em km (230.1).
- Rodovias no formato "SP 310", "SP 323", "SP 326", "SP 333", "SP 351" ou como estiverem escritas.
- Espessura em centímetros (5 cm, "0,05 m" vira 5). Comprimento e largura em metros.
- Horários no formato HH:MM de 24 horas.
- Datas no formato AAAA-MM-DD. Se só houver dia e mês, use o ano da data de referência.
- Serviços: CBUQ, Gap, PMQ, EGL, SMA, Binder, Capa, Microrrevestimento, TSD, Reperfilagem, Reparo profundo, Remendo, Fresagem (funcional, estrutural ou micro), Dreno. Use "Outro" se não se encaixar.
- "Pano" é cada trecho executado, com km inicial/final e medidas. Numere na ordem em que aparecem se o número não estiver escrito.
- Cargas de massa: usina, mistura e toneladas de cada carga ou o total informado.
- Se o texto descrever um procedimento errado (massa fria, sem pintura de ligação, aplicação na chuva, compactação insuficiente, falta de sinalização ou EPI, etc.), sugira uma não conformidade em "ncs_sugeridas" com o tipo mais próximo da lista.
- Fala transcrita pode ter erros de reconhecimento de voz ("cebuq" = CBUQ, "gape" = Gap): corrija quando o sentido for claro.
`.trim();

export function sistema(modo: Modo, contexto: { hoje: string; obras?: string[]; usinas?: string[]; equipes?: string[] }) {
  const alvo = {
    rdo: "um RDO (relatório diário de obra)",
    lev: "um levantamento de panos (medição de trechos a executar ou executados)",
    nc: "uma não conformidade (procedimento errado ou defeito encontrado na obra)",
  }[modo];
  const cad = [
    contexto.obras?.length ? `Obras cadastradas: ${contexto.obras.join("; ")}.` : "",
    contexto.usinas?.length ? `Usinas cadastradas: ${contexto.usinas.join("; ")}. Use o nome cadastrado quando a anotação se referir a uma delas.` : "",
    contexto.equipes?.length ? `Equipes cadastradas: ${contexto.equipes.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
  return `${REGRAS}\n\nO resultado vai preencher ${alvo}. Data de referência (hoje): ${contexto.hoje}.\n${cad}`.trim();
}
