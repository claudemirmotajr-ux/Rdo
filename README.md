# RDO Pavimentação

App para celular (instalável, funciona no Android pelo Chrome) para o diário de obra de pavimentação asfáltica:

- **RDO**: dia, clima e equipe, produção (panos e cargas de massa), checklist, fotos com GPS, revisão e assinatura.
- **Levantamento**: medição de panos com km, medidas e fotos.
- **Não conformidade (NC)**: botão **Indicar NC** dentro do RDO; a NC vai junto com o RDO e o engenheiro faz a tratativa.
- **Três formas de preencher**: digitando, **falando** (botão *Falar*) ou **fotografando a ficha de campo** (botão *Ler ficha*). A leitura automática só preenche campos vazios, marca em azul o que preencheu e lista em amarelo o que precisa ser conferido. Nada é enviado sem o técnico revisar e assinar.
- **Painéis** de RDO e de levantamento, com filtros, fila de cada papel, detalhes, fotos, histórico e exportação para Excel (CSV).

## Papéis e fluxo de aprovação

| Papel | O que pode fazer |
|---|---|
| Técnico | Cria, edita e envia os próprios RDOs e levantamentos; indica NCs; corrige o que for devolvido. Só vê o que é seu. |
| Analista | Pré-valida (RDO) ou pré-aprova (levantamento), ou devolve com motivo. Pode corrigir dados do que está na etapa dele. Pode marcar NC como "não procede". |
| Engenheiro | Dá a validação/aprovação final (só depois do analista), devolve, corrige dados, coloca NC em tratativa e encerra. |
| Proprietário | Tudo acima, mais pessoas, permissões e cadastros (obras, usinas, equipes). |
| Pendente | Conta nova sem papel: não vê nada até o proprietário liberar. |

```
RDO:            rascunho → enviado → pré-validado (analista) → validado (engenheiro) → código RDO-00001
Levantamento:   rascunho → enviado → pré-aprovado (analista) → aprovado (engenheiro)  → código LEV-00001
Devolução:      analista (enviado) ou engenheiro (enviado/pré-validado) → devolvido, com motivo → técnico corrige, assina e reenvia
NC:             aberta → em tratativa (engenheiro, código NC-00001) → encerrada   |   aberta → não procede (analista/engenheiro)
```

Um RDO com NC aberta não pode ser validado. Depois de validado, o RDO fica travado: ninguém edita nem apaga.

## Segurança

- **As regras ficam no banco, não na tela.** Toda mudança de situação passa por funções no servidor que conferem o papel de quem chama; edição direta das tabelas não consegue mudar situação, aprovações nem assinatura (`supabase/migrations/`).
- **Acesso por linha (RLS)**: cada técnico só enxerga os próprios registros, fotos e histórico; contas pendentes e quem não fez login não veem nada.
- **Histórico só de inclusão**: criado, enviado, pré-validado, validado, devolvido (com motivo), correções da gestão (com o que mudou) e NCs. Ninguém edita nem apaga, nem o proprietário.
- **Fotos privadas**: armazenamento sem acesso público; abrem por link temporário (1 hora) só para quem pode ver o registro.
- **Chave da IA só no servidor**: a leitura automática roda numa função do Supabase; a chave da Anthropic nunca vai para o celular.
- Testes automáticos de permissão: `supabase/tests/permissoes.sql` (86 verificações, todas passando).

## Como colocar no ar

Você vai precisar de: uma conta no [Supabase](https://supabase.com) (banco, login e fotos), uma chave da API da Anthropic (leitura automática) e um lugar para hospedar o site (Vercel ou Netlify, ambos gratuitos para começar).

### 1. Criar o projeto no Supabase
1. Crie um projeto novo e escolha a região **South America (São Paulo)**.
2. Em **SQL Editor**, cole todo o conteúdo de `supabase/migrations/20261127000000_inicial.sql` e rode.
   (Ou, com a CLI do Supabase: `supabase link` e `supabase db push`.)
3. Em **Authentication → URL Configuration**, coloque em *Site URL* o endereço onde o app vai ficar (passo 3).
4. **Crie a sua conta primeiro**: a primeira conta do sistema vira **proprietário**. As seguintes entram como pendentes.
5. Depois de cadastrar toda a equipe, se quiser fechar o cadastro: **Authentication → Providers → Email → desligar "Allow new users to sign up"** (aí novas contas só por convite do painel).

### 2. Ligar a leitura automática (foto da ficha e fala)
Com a [CLI do Supabase](https://supabase.com/docs/guides/cli):
```bash
supabase functions deploy extrair
supabase secrets set ANTHROPIC_API_KEY=sua-chave
# opcional: restringe quem pode chamar a função pelo navegador
supabase secrets set APP_ORIGIN=https://endereco-do-seu-app
```
Sem a chave, o app funciona normalmente; só os botões *Falar* e *Ler ficha* avisam que a leitura não está configurada (a fala fica guardada como texto no RDO).

### 3. Publicar o app
Em **Project Settings → API** do Supabase, copie a *Project URL* e a chave *anon public*. Na Vercel ou Netlify, importe este repositório com:
- Pasta raiz: `app`
- Comando de build: `npm run build` — pasta de saída: `dist`
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

Para rodar no próprio computador: `cd app && cp .env.example .env.local` (preencha) e `npm install && npm run dev`.

No celular, abra o endereço no Chrome e use **Adicionar à tela inicial** para instalar como app.

## Como funciona a voz
O botão *Falar* usa o reconhecimento de voz do Chrome no Android (gratuito, em português). Ele precisa de internet. Sem sinal, o técnico pode ditar pelo microfone do teclado (Gboard) no campo de texto da mesma tela, e a fala fica guardada. Quando a internet voltar, o botão **Ler de novo** preenche o RDO. O texto ditado fica salvo no RDO para o analista e o engenheiro consultarem.

## Sem internet na obra
Rascunhos, fotos e assinatura ficam guardados no celular até o envio. Se a internet cair no meio do envio, tentar de novo continua de onde parou, sem duplicar nada. O envio e a leitura automática precisam de sinal.

## Estrutura
```
app/                      app (React + Vite, instalável/PWA)
supabase/migrations/      banco: tabelas, papéis, regras de acesso, fluxos de aprovação
supabase/functions/extrair/  leitura automática (Claude): foto da ficha / fala → campos
supabase/tests/           testes de permissão (rodar_testes.sh)
testes-tela/              teste de tela completo com Supabase simulado sobre PostgreSQL local
```

## Testes
- Permissões do banco (precisa de PostgreSQL): `PGHOST=... PGUSER=postgres supabase/tests/rodar_testes.sh`
- Telas (precisa de PostgreSQL e Playwright): `testes-tela/preparar.sh`, depois `node testes-tela/servidor.cjs testes-tela/dist` e, em outro terminal, `node testes-tela/fluxo.cjs && node testes-tela/fluxo2.cjs`. Nesse teste a IA é simulada com respostas fixas.
