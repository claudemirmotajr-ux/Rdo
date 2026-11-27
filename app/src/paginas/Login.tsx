import { useState } from "react";
import { msgErro, sb } from "../supabase";
import { Aviso } from "../componentes/ui";

export function Login() {
  const [modo, setModo] = useState<"entrar" | "criar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "erro"; m: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setOcupado(true);
    try {
      if (modo === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (modo === "criar") {
        if (senha.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
        const { error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        setMsg({ t: "ok", m: "Conta criada. Confirme pelo link enviado ao seu e-mail. Depois o proprietário libera o seu acesso." });
        setModo("entrar");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMsg({ t: "ok", m: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." });
      }
    } catch (e2) {
      setMsg({ t: "erro", m: msgErro(e2) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="tela-login">
      <div className="cartao login">
        <div className="marca"><span className="placa">RDO</span><div><b>Diário de obra</b><span>Pavimentação asfáltica</span></div></div>
        <form onSubmit={enviar}>
          {modo === "criar" && (
            <label className="campo"><span className="rotulo">Seu nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" /></label>
          )}
          <label className="campo"><span className="rotulo">E-mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          {modo !== "esqueci" && (
            <label className="campo"><span className="rotulo">Senha</span>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete={modo === "criar" ? "new-password" : "current-password"} minLength={modo === "criar" ? 8 : undefined} />
            </label>
          )}
          {msg && <Aviso tipo={msg.t === "ok" ? "ok" : "erro"}>{msg.m}</Aviso>}
          <button className="btn pri grande largo" disabled={ocupado}>
            {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}
          </button>
        </form>
        <div className="links-login">
          {modo !== "entrar" && <button className="link" onClick={() => setModo("entrar")}>Já tenho conta</button>}
          {modo !== "criar" && <button className="link" onClick={() => setModo("criar")}>Criar conta</button>}
          {modo !== "esqueci" && <button className="link" onClick={() => setModo("esqueci")}>Esqueci a senha</button>}
        </div>
      </div>
    </div>
  );
}

export function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="tela-login">
      <form className="cartao login" onSubmit={async (e) => {
        e.preventDefault();
        if (senha.length < 8) return setMsg("Use pelo menos 8 caracteres.");
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) setMsg(msgErro(error)); else aoConcluir();
      }}>
        <h2>Criar nova senha</h2>
        <label className="campo"><span className="rotulo">Nova senha</span><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></label>
        {msg && <Aviso tipo="erro">{msg}</Aviso>}
        <button className="btn pri largo">Salvar senha</button>
      </form>
    </div>
  );
}
