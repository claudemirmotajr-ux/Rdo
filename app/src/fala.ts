// Reconhecimento de voz do próprio navegador (Chrome no Android).
// O Android encerra a escuta depois de alguns segundos de silêncio;
// enquanto o técnico não tocar em "Parar", a escuta é religada sozinha.
import { useCallback, useEffect, useRef, useState } from "react";

interface Resultado { isFinal: boolean; 0: { transcript: string } }
interface EventoFala { resultIndex: number; results: ArrayLike<Resultado> }
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function criar(): Reconhecedor | null {
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export const falaDisponivel = () => {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};

const ERROS: Record<string, string> = {
  "not-allowed": "O microfone foi bloqueado. Libere o microfone para este app nas configurações do Chrome.",
  "service-not-allowed": "O microfone foi bloqueado. Libere o microfone para este app nas configurações do Chrome.",
  "audio-capture": "Nenhum microfone encontrado no aparelho.",
  network: "O reconhecimento de voz precisa de internet. Sem sinal, use o microfone do teclado do celular para ditar no campo de texto.",
};

export function useFala() {
  const [ouvindo, setOuvindo] = useState(false);
  const [texto, setTexto] = useState("");     // tudo que já foi reconhecido em definitivo
  const [parcial, setParcial] = useState(""); // o que está sendo reconhecido agora
  const [erro, setErro] = useState("");
  const rec = useRef<Reconhecedor | null>(null);
  const querOuvir = useRef(false);
  const acumulado = useRef("");

  const iniciar = useCallback(() => {
    setErro("");
    const r = criar();
    if (!r) {
      setErro("Este navegador não reconhece voz. Use o Chrome no Android, ou o microfone do teclado para ditar.");
      return;
    }
    acumulado.current = "";
    setTexto("");
    setParcial("");
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interino = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) acumulado.current = `${acumulado.current} ${res[0].transcript}`.trim();
        else interino += res[0].transcript;
      }
      setTexto(acumulado.current);
      setParcial(interino);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setErro(ERROS[e.error] ?? `Falha no reconhecimento de voz (${e.error}).`);
      querOuvir.current = false;
    };
    r.onend = () => {
      if (querOuvir.current) {
        try { r.start(); return; } catch { /* segue para encerrar */ }
      }
      setOuvindo(false);
      setParcial("");
    };
    rec.current = r;
    querOuvir.current = true;
    try {
      r.start();
      setOuvindo(true);
    } catch {
      setErro("Não foi possível ligar o microfone.");
    }
  }, []);

  /** Para de ouvir e devolve o texto final. */
  const parar = useCallback((): string => {
    querOuvir.current = false;
    rec.current?.stop();
    setOuvindo(false);
    const final = `${acumulado.current} ${parcialRef.current}`.trim();
    setParcial("");
    return final;
  }, []);

  const parcialRef = useRef("");
  useEffect(() => { parcialRef.current = parcial; }, [parcial]);
  useEffect(() => () => { querOuvir.current = false; rec.current?.stop(); }, []);

  return { ouvindo, texto, parcial, erro, iniciar, parar, setErro };
}
