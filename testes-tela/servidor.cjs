// Servidor de TESTE que imita o Supabase (REST, login, storage, função
// de leitura) em cima de um PostgreSQL local com a migração real.
// As consultas rodam como o usuário logado (role authenticated + claims),
// então as regras de RLS do banco valem como no Supabase.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORTA = 5700;
const DIST = process.argv[2];
// conexão pelas variáveis PGHOST / PGPORT / PGUSER; banco rdo_e2e
const pool = new Pool({ database: process.env.PGDATABASE || "rdo_e2e" });
const arquivos = new Map(); // path -> {tipo, bytes}

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (u) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, exp: Math.floor(Date.now() / 1000) + 3600, session_id: "s" })}.assinatura`;
function quem(req) {
  const a = req.headers.authorization || "";
  const t = a.replace(/^Bearer /, "");
  try {
    const p = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
    return p.role === "authenticated" ? p.sub : null;
  } catch { return null; }
}
const usuarioJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: u.raw_user_meta_data || {}, created_at: new Date().toISOString() });
const sessao = (u) => ({ access_token: jwt(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `rt-${u.id}`, user: usuarioJson(u) });

async function comoUsuario(sub, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(sub ? "set local role authenticated" : "set local role anon");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { sub, role: "authenticated" } : { role: "anon" })]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally { c.release(); }
}

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error("identificador inválido " + s), { status: 400 }); return `"${s}"`; };
const valor = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
function filtros(params, args) {
  const w = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
    const m = v.match(/^(eq|neq|gte|lte|gt|lt|in|is)\.(.*)$/s);
    if (!m) throw Object.assign(new Error("filtro não suportado " + v), { status: 400 });
    const [, op, val] = m;
    if (op === "in") {
      const itens = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      w.push(`${ident(k)}::text = any($${args.push(itens)})`);
    } else if (op === "is") {
      w.push(`${ident(k)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`);
    } else {
      const sql = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" }[op];
      w.push(`${ident(k)}::text ${sql} $${args.push(val)}::text`);
    }
  }
  return w.length ? " where " + w.join(" and ") : "";
}
const colunas = (sel) => (!sel || sel === "*" ? "*" : sel.split(",").map((c) => ident(c.trim())).join(","));
function ordem(o) {
  if (!o) return "";
  return " order by " + o.split(",").map((x) => { const [c, d] = x.split("."); return `${ident(c)} ${d === "desc" ? "desc" : "asc"}`; }).join(",");
}
const lerCorpo = (req) => new Promise((ok) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => ok(Buffer.concat(b))); });
function responder(res, status, corpo, cab = {}) {
  res.writeHead(status, { "content-type": "application/json", ...cab });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}
function erroPg(res, e) {
  const status = e.status || (e.code === "42501" ? 403 : 400);
  responder(res, status, { message: e.message, code: e.code || "PGRST", details: null, hint: null });
}

async function rest(req, res, url, sub) {
  const partes = url.pathname.replace("/rest/v1/", "").split("/");
  const prefer = req.headers.prefer || "";
  const umObjeto = (req.headers.accept || "").includes("vnd.pgrst.object");
  const args = [];
  if (partes[0] === "rpc") {
    const fn = ident(partes[1]);
    const corpo = JSON.parse((await lerCorpo(req)).toString() || "{}");
    const nomes = Object.keys(corpo);
    const sql = `select * from public.${fn}(${nomes.map((n, i) => `${ident(n)} => $${i + 1}`).join(",")})`;
    const r = await comoUsuario(sub, (c) => c.query(sql, nomes.map((n) => valor(corpo[n]))));
    const linha = r.rows[0];
    const campos = r.fields.map((f) => f.name);
    if (campos.length === 1 && campos[0] === partes[1]) return responder(res, 200, linha ? linha[campos[0]] : null);
    return responder(res, 200, linha ?? null);
  }
  const tabela = ident(partes[0]);
  if (req.method === "GET" || req.method === "HEAD") {
    if (req.method === "HEAD" || prefer.includes("count=exact")) {
      const r = await comoUsuario(sub, (c) => c.query(`select count(*)::int n from public.${tabela}${filtros(url.searchParams, args)}`, args));
      return responder(res, 200, req.method === "HEAD" ? undefined : [], { "content-range": `0-0/${r.rows[0].n}` });
    }
    let sql = `select ${colunas(url.searchParams.get("select"))} from public.${tabela}${filtros(url.searchParams, args)}${ordem(url.searchParams.get("order"))}`;
    if (url.searchParams.get("limit")) sql += ` limit ${parseInt(url.searchParams.get("limit"), 10)}`;
    const r = await comoUsuario(sub, (c) => c.query(sql, args));
    if (umObjeto) return r.rows.length === 1 ? responder(res, 200, r.rows[0]) : responder(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" });
    return responder(res, 200, r.rows);
  }
  const corpo = JSON.parse((await lerCorpo(req)).toString() || "null");
  const volta = prefer.includes("return=representation");
  const ret = volta ? ` returning ${colunas(url.searchParams.get("select"))}` : "";
  let r;
  if (req.method === "POST") {
    const linhas = Array.isArray(corpo) ? corpo : [corpo];
    const cols = Object.keys(linhas[0]);
    const vals = linhas.map((l) => `(${cols.map((c) => `$${args.push(valor(l[c]))}`).join(",")})`).join(",");
    r = await comoUsuario(sub, (c) => c.query(`insert into public.${tabela} (${cols.map(ident).join(",")}) values ${vals}${ret}`, args));
    if (!volta) return responder(res, 201);
  } else if (req.method === "PATCH") {
    const sets = Object.keys(corpo).map((c) => `${ident(c)} = $${args.push(valor(corpo[c]))}`).join(",");
    r = await comoUsuario(sub, (c) => c.query(`update public.${tabela} set ${sets}${filtros(url.searchParams, args)}${ret}`, args));
    if (!volta) return responder(res, 204);
  } else if (req.method === "DELETE") {
    r = await comoUsuario(sub, (c) => c.query(`delete from public.${tabela}${filtros(url.searchParams, args)}${ret}`, args));
    if (!volta) return responder(res, 204);
  }
  if (umObjeto) return r.rows.length === 1 ? responder(res, 201, r.rows[0]) : responder(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" });
  return responder(res, 201, r.rows);
}

async function auth(req, res, url) {
  const rota = url.pathname.replace("/auth/v1/", "");
  if (rota === "token") {
    const corpo = JSON.parse((await lerCorpo(req)).toString());
    let r;
    if (url.searchParams.get("grant_type") === "password") {
      if (corpo.password !== "senha-teste-123") return responder(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials", code: "invalid_credentials" });
      r = await pool.query("select * from auth.users where email = $1", [corpo.email]);
    } else {
      r = await pool.query("select * from auth.users where id::text = $1", [String(corpo.refresh_token).replace("rt-", "")]);
    }
    if (!r.rows[0]) return responder(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials", code: "invalid_credentials" });
    return responder(res, 200, sessao(r.rows[0]));
  }
  if (rota === "user") {
    const sub = quem(req);
    const r = sub ? await pool.query("select * from auth.users where id = $1", [sub]) : { rows: [] };
    return r.rows[0] ? responder(res, 200, usuarioJson(r.rows[0])) : responder(res, 401, { msg: "invalid" });
  }
  if (rota === "logout") return responder(res, 204);
  if (rota === "signup") {
    const corpo = JSON.parse((await lerCorpo(req)).toString());
    const r = await pool.query("insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2) returning *", [corpo.email, corpo.data || {}]);
    return responder(res, 200, usuarioJson(r.rows[0]));
  }
  responder(res, 404, { msg: "rota de auth não simulada: " + rota });
}

async function storage(req, res, url, sub) {
  const rota = decodeURIComponent(url.pathname.replace("/storage/v1/", ""));
  let m;
  if (req.method === "POST" && (m = rota.match(/^object\/sign\/anexos\/(.+)$/))) {
    const caminho = m[1];
    const r = await comoUsuario(sub, (c) => c.query("select 1 from storage.objects where bucket_id = 'anexos' and name = $1", [caminho]));
    if (!r.rows.length) return responder(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return responder(res, 200, { signedURL: `/object/sign/anexos/${caminho}?token=teste` });
  }
  if (req.method === "GET" && (m = rota.match(/^object\/sign\/anexos\/(.+)$/))) {
    const a = arquivos.get(m[1]);
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": a.tipo });
    return res.end(a.bytes);
  }
  if (req.method === "POST" && (m = rota.match(/^object\/anexos\/(.+)$/))) {
    const caminho = m[1];
    let bytes = await lerCorpo(req);
    let tipoArq = req.headers["content-type"] || "application/octet-stream";
    const bnd = (tipoArq.match(/boundary=(.+)$/) || [])[1];
    if (bnd) { // multipart: pega a parte do arquivo (como o Supabase faz)
      const txt = bytes.toString("latin1");
      const parte = txt.split("--" + bnd).find((x) => /content-type:\s*image\//i.test(x) || /filename=/i.test(x));
      const cab = parte.slice(0, parte.indexOf("\r\n\r\n"));
      tipoArq = (cab.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || "application/octet-stream";
      bytes = Buffer.from(parte.slice(parte.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, ""), "latin1");
    }
    await comoUsuario(sub, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ('anexos', $1, $2)", [caminho, sub]));
    arquivos.set(caminho, { tipo: tipoArq, bytes });
    return responder(res, 200, { Key: `anexos/${caminho}`, Id: caminho });
  }
  if (req.method === "DELETE" && rota === "object/anexos") {
    const corpo = JSON.parse((await lerCorpo(req)).toString());
    for (const p of corpo.prefixes || []) {
      await comoUsuario(sub, (c) => c.query("delete from storage.objects where bucket_id = 'anexos' and name = $1", [p]));
      arquivos.delete(p);
    }
    return responder(res, 200, []);
  }
  responder(res, 404, { message: "rota de storage não simulada: " + rota });
}

// Simulação da IA: respostas fixas, só para testar o caminho na tela.
async function funcao(req, res, sub) {
  if (!sub) return responder(res, 401, { erro: "Faça login" });
  const p = JSON.parse((await lerCorpo(req)).toString());
  const papel = await comoUsuario(sub, (c) => c.query("select public.meu_papel() p"));
  if (papel.rows[0].p === "pendente") return responder(res, 403, { erro: "Sua conta ainda não foi liberada" });
  if (p.modo === "nc") {
    return responder(res, 200, { campos: { tipo: "Temperatura da massa fora da faixa", gravidade: "Alta", descricao: "Caminhão da Usina Teste chegou com a massa a 120 °C e foi aplicada", acao_sugerida: "Fresar e refazer o trecho", rodovia: "SP 310", sentido: "Norte", faixa: "1", km_inicial: 230.2, km_final: 230.25, hora: "09:40", duvidas: [] } });
  }
  if (p.imagens && p.imagens.length) {
    return responder(res, 200, { campos: {
      data: p.contexto.hoje, turno: "Diurno", equipe: "Equipe Antônio", clima_manha: "Bom", clima_tarde: null, clima_noite: null, chuva_paralisou: null, horas_paradas: null, efetivo: 14,
      equipamentos: [{ nome: "Vibroacabadora", quantidade: 1 }, { nome: "Rolo tandem (chapa)", quantidade: 2 }],
      panos: [
        { numero: 1, rodovia: "SP 310", sentido: "Norte", faixa: "1", km_inicial: 230.1, km_final: 230.35, comprimento_m: 250, largura_m: 3.5, espessura_cm: 5, servico: "CBUQ", toneladas: 21, observacao: null },
        { numero: 2, rodovia: "SP 310", sentido: "Norte", faixa: "2", km_inicial: 230.35, km_final: 230.5, comprimento_m: 150, largura_m: 3.5, espessura_cm: 5, servico: "CBUQ", toneladas: 13, observacao: null },
      ],
      cargas: [{ usina: "Usina Teste", mistura: "CBUQ", toneladas: 38, placa_ou_nota: "NF 1234" }],
      equipe_pintura: null, pintura_m2: null, liberacao_massa: "16:10", liberacao_pista: null, ocorrencias: [], observacoes: null, ncs_sugeridas: [],
      duvidas: [{ campo: "Pano 2 - largura", motivo: "Número borrado na ficha: pode ser 3,5 ou 3,8 m" }],
    } });
  }
  const t = (p.texto || "").toLowerCase();
  return responder(res, 200, { campos: {
    data: null, turno: null, equipe: null, clima_manha: null, clima_tarde: t.includes("chuva") ? "Chuvoso" : null, clima_noite: null,
    chuva_paralisou: t.includes("paramos") ? true : null, horas_paradas: t.includes("40") ? 0.7 : null, efetivo: null, equipamentos: [], panos: [], cargas: [],
    equipe_pintura: null, pintura_m2: null, liberacao_massa: null, liberacao_pista: t.includes("17h30") ? "17:30" : null,
    ocorrencias: t.includes("chuva") ? [{ hora: "10:00", descricao: "Chuva fraca, serviço parado por 40 minutos" }] : [],
    observacoes: null,
    ncs_sugeridas: t.includes("fria") ? [{ tipo: "Temperatura da massa fora da faixa", gravidade: "Alta", descricao: "Caminhão chegou com massa fria (cerca de 120 °C) e foi aplicada", rodovia: "SP 310", km_inicial: 230.2 }] : [],
    duvidas: [],
  } });
}

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" };
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  try {
    const sub = quem(req);
    if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url, sub);
    if (url.pathname.startsWith("/auth/v1/")) return await auth(req, res, url);
    if (url.pathname.startsWith("/storage/v1/")) return await storage(req, res, url, sub);
    if (url.pathname === "/functions/v1/extrair") return await funcao(req, res, sub);
    let f = path.join(DIST, url.pathname);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
    res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (!res.headersSent) erroPg(res, e);
    console.error(req.method, url.pathname, e.message);
  }
}).listen(PORTA, () => console.log("servidor de teste em", PORTA));
