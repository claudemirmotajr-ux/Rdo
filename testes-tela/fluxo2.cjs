const { chromium, devices } = require("playwright");
const path = require("path");
const SHOTS = path.join(__dirname, "shots");
const erros = [];
let n = 20;
const foto = async (p, nome) => { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, `${++n}-${nome}.png`) }); };
async function entrar(b, email) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block", locale: "pt-BR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(`[${email}] ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") erros.push(`[${email}] console: ${m.text()}`); });
  await p.goto("http://127.0.0.1:5700/");
  await p.getByLabel("E-mail").fill(email);
  await p.getByLabel("Senha").fill("senha-teste-123");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("Diário de obra").first().waitFor();
  return { ctx, p };
}
async function assinarEnviar(p, botao) {
  const tela = p.locator(".caixa-assinatura canvas");
  await tela.scrollIntoViewIfNeeded();
  const c = await tela.boundingBox();
  await p.mouse.move(c.x + 30, c.y + 90); await p.mouse.down();
  for (let i = 0; i < 10; i++) await p.mouse.move(c.x + 30 + i * 20, c.y + 90 + Math.cos(i) * 25);
  await p.mouse.up();
  await p.getByRole("button", { name: "Confirmar assinatura" }).click();
  await p.getByRole("button", { name: botao }).click();
}
(async () => {
  const b = await chromium.launch();
  // técnico: levantamento lido da ficha
  let { ctx, p } = await entrar(b, "tecnico@obra.test");
  await p.getByRole("button", { name: /Novo levantamento/ }).click();
  await p.getByText("Identificação").first().waitFor();
  await p.locator("label.ficha input[type=file]").setInputFiles(path.join(__dirname, "../app/public/icone-512.png"));
  await p.getByText(/Preenchido:/).first().waitFor({ timeout: 15000 });
  await p.getByLabel("Motivo do levantamento").fill("Medição de executado");
  await p.getByRole("button", { name: "Próximo" }).click();
  await p.getByText("Panos levantados").waitFor();
  await foto(p, "lev-panos");
  await p.getByRole("button", { name: "Próximo" }).click();
  await p.getByRole("button", { name: "Próximo" }).click();
  await assinarEnviar(p, "Enviar levantamento");
  await p.getByRole("heading", { name: "Levantamento enviado" }).waitFor({ timeout: 20000 });
  await ctx.close();
  // analista devolve
  ({ ctx, p } = await entrar(b, "analista@obra.test"));
  await p.getByRole("button", { name: /Levantamentos/ }).click();
  await p.locator(".registro").first().click();
  await p.getByRole("button", { name: "Devolver" }).click();
  await p.getByPlaceholder("O que precisa ser corrigido").fill("Faltou a foto do pano 2 e conferir a largura");
  await foto(p, "lev-devolvendo");
  await p.getByRole("button", { name: "Confirmar devolução" }).click();
  await p.getByText("Levantamento devolvido ao técnico").waitFor();
  await ctx.close();
  // técnico corrige e reenvia
  ({ ctx, p } = await entrar(b, "tecnico@obra.test"));
  await p.getByText(/devolvidos? para corrigir/).waitFor();
  await foto(p, "tecnico-aviso-devolvido");
  await p.getByRole("button", { name: /Levantamentos/ }).click();
  await p.locator(".registro").first().click();
  await p.getByRole("button", { name: "Corrigir e reenviar" }).click();
  await p.getByText("Devolvido para correção:").waitFor();
  await foto(p, "tecnico-corrigindo");
  await p.locator(".etapas button", { hasText: "Fotos" }).click();
  await p.locator(".botoes-foto input[type=file]").first().setInputFiles(path.join(__dirname, "../app/public/icone-192.png"));
  await p.locator(".grade-fotos .foto").first().waitFor();
  await p.getByRole("button", { name: "Próximo" }).click();
  await assinarEnviar(p, "Enviar levantamento");
  await p.getByRole("heading", { name: "Levantamento enviado" }).waitFor({ timeout: 20000 });
  await ctx.close();
  await b.close();
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "sem erros no navegador");
})().catch((e) => { console.error("FALHOU:", e.message); console.log(erros.join("\n")); process.exit(1); });
