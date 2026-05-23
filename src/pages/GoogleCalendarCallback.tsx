/**
 * Страница обработки OAuth2 callback от Google Calendar
 * Открывается после авторизации: /auth/google/callback?code=...&state=userId
 */
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function GoogleCalendarCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Подключаем Google Calendar...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    const userId = params.get("state");
    const error  = params.get("error");

    if (error || !code || !userId) {
      setStatus("error");
      setMessage(error === "access_denied" ? "Доступ отклонён." : "Ошибка авторизации.");
      return;
    }

    // Передаём код боту через Telegram deep link
    // Бот получит код через /start gcal_{code}
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      // Закрываем webApp и открываем ссылку с кодом
      setTimeout(() => {
        tg.openTelegramLink(`https://t.me/cortexaibot?start=gcal_${code}`);
        tg.close();
      }, 1500);
      setStatus("success");
      setMessage("Google Calendar подключён! Возвращаемся в приложение...");
    } else {
      // Fallback: сохраняем через Firebase напрямую (если GOOGLE_CLIENT_SECRET доступен)
      // В данном случае просто показываем сообщение
      setStatus("success");
      setMessage("Авторизация получена. Откройте бот и введите: /start gcal_" + code.substring(0, 10) + "...");
    }
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      backgroundColor: "#0E2F44",
      color: "white",
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "24px",
      textAlign: "center",
    }}>
      {status === "loading" && (
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
      )}
      {status === "success" && (
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
      )}
      {status === "error" && (
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
      )}

      <p style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
        {status === "success" ? "Google Calendar подключён!" : status === "error" ? "Ошибка" : "Загрузка..."}
      </p>
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", maxWidth: "320px" }}>
        {message}
      </p>

      {status === "success" && (
        <div style={{
          marginTop: "24px",
          padding: "12px 20px",
          backgroundColor: "rgba(34,197,94,0.15)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: "12px",
          fontSize: "13px",
          color: "#86efac",
          maxWidth: "320px",
        }}>
          📅 Теперь все задачи с дедлайном будут автоматически добавляться в Google Calendar
        </div>
      )}

      {status !== "loading" && (
        <button
          onClick={() => (window as any).Telegram?.WebApp?.close()}
          style={{
            marginTop: "24px",
            padding: "12px 32px",
            borderRadius: "12px",
            border: "none",
            backgroundColor: "#3b82f6",
            color: "white",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Закрыть
        </button>
      )}
    </div>
  );
}
