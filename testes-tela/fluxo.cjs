const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = "http://127.0.0.1:5700/";
const SHOTS = path.join(__dirname, "shots");
const FICHA = path.join(__dirname, "../app/public/icone-512.png");
require("fs").mkdirSync(SHOTS, { recursive: true });

let n = 0;
const erros = [];
async function foto(p, nome) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, "0")}-${nome}.png`), fullPage: false }); }

async function entrar(b, email) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block", locale: "pt-BR", permissions: [], geolocation: undefined });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(`[${email}] pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") erros.push(`[${email}] console: ${m.text()}`); });
  await p.goto(BASE);
  await p.getByLabel("E-mail").fill(email);
  await p.getByLabel("Senha").fill("senha-teste-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("Diário de obra").first().waitFor();
  return { ctx, p };
}

(async () => {
  const b = await chromium.launch();
  const etapa = process.argv[2] || "tudo";

  if (etapa === "tudo" || etapa === "dono") {
    const { ctx, p } = await entrar(b, "dono@obra.test");
    await p.getByRole("button", { name: "Config." }).click();
    await p.getByText("Pessoas e permissões").waitFor();
    await foto(p, "dono-pessoas-pendentes");
    const linha = (nome) => p.locator(".pessoa", { hasText: nome }).locator("select");
    await linha("João Técnico").selectOption("tecnico");
    await p.waitForTimeout(300);
    await linha("Ana Analista").selectOption("analista");
    await p.waitForTimeout(300);
    await linha("Eduardo Engenheiro").selectOption("engenheiro");
    await p.waitForTimeout(300);
    await p.getByPlaceholder("Nome da obra").fill("Reabilitação SP-310 Lote 2");
    await p.getByPlaceholder("Contrato").fill("CT-045/2026");
    await p.getByPlaceholder("Rodovia (ex.: SP 310)").fill("SP 310");
    await p.locator("section", { hasText: "Obras" }).getByRole("button", { name: "Adicionar" }).click();
    await p.getByText("Reabilitação SP-310 Lote 2").waitFor();
    await p.getByPlaceholder("Novo nome (usinas)").fill("Usina Teste");
    await p.locator("section", { hasText: "Usinas" }).getByRole("button", { name: "Adicionar" }).click();
    await p.locator(".chip", { hasText: "Usina Teste" }).waitFor();
    await foto(p, "dono-cadastros");
    await ctx.close();
  }

  if (etapa === "tudo" || etapa === "tecnico") {
    const { ctx, p } = await entrar(b, "tecnico@obra.test");
    await foto(p, "tecnico-inicio");
    await p.getByRole("button", { name: /Novo RDO/ }).click();
    await p.getByText("Dia de trabalho").waitFor();
    // ficha de campo
    await p.locator("label.ficha input[type=file]").setInputFiles(FICHA);
    await p.getByText(/Preenchido:/).first().waitFor({ timeout: 15000 });
    await foto(p, "tecnico-ficha-lida");
    // fala (pelo campo de texto: no teste não há microfone)
    await p.getByRole("button", { name: "Falar" }).click();
    await p.getByText("Conte o que está acontecendo na obra").waitFor();
    await p.getByPlaceholder("Ex.: liberação da pista às 17h30").fill("Chuva fraca às 10h, paramos 40 minutos. Um caminhão chegou com a massa fria e foi aplicada no km 230+200. Liberação da pista às 17h30.");
    await foto(p, "tecnico-falar");
    await p.getByRole("button", { name: "Preencher o RDO com isso" }).click();
    await p.locator(".folha").getByText(/Preenchido:/).waitFor({ timeout: 15000 });
    await foto(p, "tecnico-fala-lida");
    await p.locator(".folha-rodape").getByRole("button", { name: "Fechar" }).click();
    await p.getByText("A leitura encontrou possíveis não conformidades").waitFor();
    await foto(p, "tecnico-sugestao-nc");
    await p.getByRole("button", { name: "Indicar como NC" }).click();
    await p.getByText("Indicar não conformidade").waitFor();
    await foto(p, "tecnico-nc-folha");
    await p.getByRole("button", { name: "Salvar NC no RDO" }).click();
    // etapas
    await p.getByRole("button", { name: "Próximo" }).click();
    await p.getByText("Clima e equipe").first().waitFor();
    await foto(p, "tecnico-clima");
    await p.getByRole("button", { name: "Próximo" }).click();
    await p.getByText("Produção do dia").waitFor();
    await foto(p, "tecnico-producao");
    await p.getByRole("button", { name: "Próximo" }).click();
    await p.getByText("Checklist do dia").waitFor();
    await p.getByRole("button", { name: "Próximo" }).click();
    await p.getByRole("button", { name: "Próximo" }).click();
    await p.getByRole("heading", { name: "Revisão" }).waitFor();
    // assinatura
    const tela = p.locator(".caixa-assinatura canvas");
    await tela.scrollIntoViewIfNeeded();
    const caixa = await tela.boundingBox();
    await p.mouse.move(caixa.x + 30, caixa.y + 100);
    await p.mouse.down();
    for (let i = 0; i < 12; i++) await p.mouse.move(caixa.x + 30 + i * 18, caixa.y + 100 + Math.sin(i) * 30);
    await p.mouse.up();
    await p.getByRole("button", { name: "Confirmar assinatura" }).click();
    await p.getByText(/Assinado por/).waitFor();
    await foto(p, "tecnico-revisao");
    await p.getByRole("button", { name: "Enviar RDO para validação" }).click();
    await p.getByRole("heading", { name: "RDO enviado" }).waitFor({ timeout: 20000 });
    await foto(p, "tecnico-enviado");
    await ctx.close();
  }

  if (etapa === "tudo" || etapa === "analista") {
    const { ctx, p } = await entrar(b, "analista@obra.test");
    await foto(p, "analista-inicio");
    await p.getByRole("button", { name: /Painel RDO/ }).click();
    await p.locator(".registro").first().waitFor();
    await foto(p, "analista-painel");
    await p.locator(".registro").first().click();
    await p.getByRole("button", { name: "Pré-validar" }).waitFor();
    await p.locator(".grade-fotos img").first().waitFor({ timeout: 10000 });
    await foto(p, "analista-detalhe");
    await p.getByRole("button", { name: "Pré-validar" }).click();
    await p.getByText("RDO pré-validado").waitFor();
    await ctx.close();
  }

  if (etapa === "tudo" || etapa === "engenheiro") {
    const { ctx, p } = await entrar(b, "engenheiro@obra.test");
    await p.getByRole("button", { name: /Painel RDO/ }).click();
    await p.locator(".registro").first().click();
    await p.getByText("Há NC aberta neste RDO").waitFor();
    await p.locator(".cartao.nc").scrollIntoViewIfNeeded();
    await foto(p, "engenheiro-nc-aberta");
    await p.getByRole("button", { name: "Colocar em tratativa" }).click();
    await p.getByPlaceholder("O que será feito").fill("Fresar e recompor o trecho do km 230+200 ao 230+250 na próxima janela");
    await p.getByRole("button", { name: "Confirmar" }).click();
    await p.getByText("Em tratativa").first().waitFor();
    await p.getByRole("button", { name: "Validar" }).click();
    await p.getByText("RDO validado").waitFor();
    await p.getByRole("button", { name: "Todos" }).click();
    await p.locator(".registro").first().click();
    await p.getByRole("heading", { name: "Histórico" }).scrollIntoViewIfNeeded();
    await foto(p, "engenheiro-validado-historico");
    await ctx.close();
  }

  await b.close();
  console.log(erros.length ? "ERROS NO NAVEGADOR:\n" + erros.join("\n") : "sem erros no navegador");
})().catch((e) => { console.error("FALHOU:", e.message); console.log(erros.join("\n")); process.exit(1); });
