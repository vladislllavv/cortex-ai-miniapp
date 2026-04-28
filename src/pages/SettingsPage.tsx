import { useI18nStore } from "@/lib/i18n";
import { useTaskStore, getTelegramUserId, checkSubscription } from "@/lib/store";
import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Star, Trash2, Globe, Bell, Shield } from "lucide-react";

export default function SettingsPage() {
  const language = useI18nStore((state) => state.language);
  const setLanguage = useI18nStore((state) => state.setLanguage);
  const tasks = useTaskStore((state) => state.tasks);
  const ru = language === "ru";

  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const id = getTelegramUserId();
    setUserId(id);
    checkSubscription(id).then(setHasSubscription);
  }, []);

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const activeTasks = tasks.filter((t) => t.status !== "done").length;

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      {/* Заголовок */}
      <p
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "white",
          margin: "0 0 20px 0",
        }}
      >
        {ru ? "Настройки" : "Settings"}
      </p>

      {/* Подписка */}
      <SectionTitle>{ru ? "Подписка" : "Subscription"}</SectionTitle>
      <div
        style={{
          backgroundColor: hasSubscription
            ? "rgba(34,197,94,0.08)"
            : "rgba(255,255,255,0.05)",
          border: hasSubscription
            ? "1px solid rgba(34,197,94,0.2)"
            : "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          {hasSubscription
            ? <CheckCircle size={20} color="#22c55e" />
            : <XCircle size={20} color="rgba(255,255,255,0.3)" />
          }
          <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: 0 }}>
            {hasSubscription
              ? (ru ? "Подписка активна" : "Subscription active")
              : (ru ? "Нет подписки" : "No subscription")}
          </p>
        </div>

        {!hasSubscription && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
              {[
                ru ? "Безлимитные задачи" : "Unlimited tasks",
                ru ? "Неограниченный AI" : "Unlimited AI",
                ru ? "Приоритетная поддержка" : "Priority support",
              ].map((feature) => (
                <div key={feature} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Star size={13} color="#f59e0b" />
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>{feature}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const tg = (window as any).Telegram?.WebApp;
                tg?.openTelegramLink("https://t.me/aiplannerrubot");
              }}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "12px",
                border: "none",
                backgroundColor: "#3b82f6",
                fontSize: "14px",
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
              }}
            >
              {ru ? "Оформить за 100 Stars/мес" : "Subscribe for 100 Stars/mo"}
            </button>
          </>
        )}
      </div>

      {/* Статистика */}
      <SectionTitle>{ru ? "Статистика" : "Statistics"}</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        {[
          { label: ru ? "Всего" : "Total", value: tasks.length },
          { label: ru ? "Активных" : "Active", value: activeTasks },
          { label: ru ? "Выполнено" : "Done", value: doneTasks },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "14px 10px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "24px", fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>
              {value}
            </p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Язык */}
      <SectionTitle><Globe size={14} style={{ marginRight: "6px" }} />{ru ? "Язык" : "Language"}</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        {[
          { code: "ru", label: "🇷🇺 Русский" },
          { code: "en", label: "🇺🇸 English" },
        ].map(({ code, label }) => (
          <button
            key={code}
            onClick={() => setLanguage(code as "ru" | "en")}
            style={{
              height: "44px",
              borderRadius: "12px",
              border: language === code ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)",
              backgroundColor: language === code ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)",
              fontSize: "14px",
              fontWeight: language === code ? 600 : 400,
              color: language === code ? "#60a5fa" : "rgba(255,255,255,0.6)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Аккаунт */}
      <SectionTitle><Shield size={14} style={{ marginRight: "6px" }} />{ru ? "Аккаунт" : "Account"}</SectionTitle>
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "14px 16px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
            {ru ? "Ваш Telegram ID" : "Your Telegram ID"}
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
            {userId || "—"}
          </span>
        </div>
      </div>

      {/* Уведомления */}
      <SectionTitle><Bell size={14} style={{ marginRight: "6px" }} />{ru ? "Уведомления" : "Notifications"}</SectionTitle>
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "14px 16px",
          marginBottom: "20px",
        }}
      >
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: 0 }}>
          {ru
            ? "Уведомления приходят через бота @aiplannerrubot в Telegram"
            : "Notifications are sent via @aiplannerrubot bot in Telegram"}
        </p>
      </div>

      {/* Опасная зона */}
      <SectionTitle style={{ color: "rgba(239,68,68,0.7)" }}>
        <Trash2 size={14} style={{ marginRight: "6px" }} />
        {ru ? "Опасная зона" : "Danger zone"}
      </SectionTitle>
      <button
        onClick={() => {
          const tg = (window as any).Telegram?.WebApp;
          tg?.showConfirm(
            ru ? "Удалить все задачи?" : "Delete all tasks?",
            (confirmed: boolean) => {
              if (confirmed) {
                localStorage.removeItem("cortex-tasks");
                window.location.reload();
              }
            }
          );
        }}
        style={{
          width: "100%",
          height: "44px",
          borderRadius: "12px",
          border: "1px solid rgba(239,68,68,0.3)",
          backgroundColor: "rgba(239,68,68,0.08)",
          fontSize: "14px",
          fontWeight: 500,
          color: "#f87171",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <Trash2 size={16} />
        {ru ? "Удалить все задачи" : "Delete all tasks"}
      </button>

    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: "12px",
        fontWeight: 600,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginBottom: "8px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
