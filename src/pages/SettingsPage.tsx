import { useI18nStore } from "@/lib/i18n";
import {
  useTaskStore,
  getTelegramUserId,
  getSubscriptionInfo,
  checkSubscription,
  CustomCategory,
} from "@/lib/store";
import { useState, useEffect, useRef } from "react";
import {
  CheckCircle, XCircle, Star, Trash2,
  Globe, Bell, Shield, Plus, Edit2, X, Palette,
} from "lucide-react";

// Темы приложения
const THEMES = [
  { id: "dark-blue", name: "Тёмно-синяя", nameEn: "Dark Blue", primary: "#3b82f6", bg: "#0f172a", preview: ["#0f172a", "#1e293b", "#3b82f6"] },
  { id: "dark-purple", name: "Тёмно-фиолетовая", nameEn: "Dark Purple", primary: "#a855f7", bg: "#0f0f1a", preview: ["#0f0f1a", "#1a1a2e", "#a855f7"] },
  { id: "dark-green", name: "Тёмно-зелёная", nameEn: "Dark Green", primary: "#22c55e", bg: "#0a1a0f", preview: ["#0a1a0f", "#0d2018", "#22c55e"] },
  { id: "dark-red", name: "Тёмно-красная", nameEn: "Dark Red", primary: "#ef4444", bg: "#1a0f0f", preview: ["#1a0f0f", "#2e1818", "#ef4444"] },
  { id: "dark-orange", name: "Тёмно-оранжевая", nameEn: "Dark Orange", primary: "#f97316", bg: "#1a110a", preview: ["#1a110a", "#2e1e0d", "#f97316"] },
  { id: "dark-cyan", name: "Тёмно-голубая", nameEn: "Dark Cyan", primary: "#06b6d4", bg: "#0a1a1f", preview: ["#0a1a1f", "#0d2530", "#06b6d4"] },
];

const THEME_KEY = "cortex-theme";

export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.find((t) => t.id === stored) || THEMES[0];
}

export function applyTheme(themeId: string) {
  localStorage.setItem(THEME_KEY, themeId);
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  document.documentElement.style.setProperty("--primary", theme.primary);
  document.documentElement.style.setProperty("--bg", theme.bg);
}

export default function SettingsPage() {
  const language = useI18nStore((state) => state.language);
  const setLanguage = useI18nStore((state) => state.setLanguage);
  const tasks = useTaskStore((state) => state.tasks);
  const categories = useTaskStore((state) => state.categories);
  const addCategory = useTaskStore((state) => state.addCategory);
  const updateCategory = useTaskStore((state) => state.updateCategory);
  const deleteCategory = useTaskStore((state) => state.deleteCategory);
  const ru = language === "ru";

  const [subInfo, setSubInfo] = useState<{
    isActive: boolean; expiresAt: Date | null; daysLeft: number;
  }>({ isActive: false, expiresAt: null, daysLeft: 0 });

  const [userId, setUserId] = useState<string>("");
  const [subLoading, setSubLoading] = useState(true);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");
  const [newCatIcon, setNewCatIcon] = useState("📁");
  const [editingCat, setEditingCat] = useState<CustomCategory | null>(null);
  const [currentTheme, setCurrentTheme] = useState(getTheme().id);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = getTelegramUserId();
    setUserId(id);
    setSubLoading(true);
    Promise.all([getSubscriptionInfo(id), checkSubscription(id)]).then(([info, isActive]) => {
      setSubInfo({ isActive: isActive || info.isActive, expiresAt: info.expiresAt, daysLeft: info.daysLeft });
      setSubLoading(false);
    }).catch(() => setSubLoading(false));
  }, []);

  useEffect(() => {
    if (showAddCategory) {
      document.body.style.overflow = "hidden";
      setTimeout(() => nameInputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [showAddCategory]);

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const activeTasks = tasks.filter((t) => t.status !== "done").length;

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (editingCat) { updateCategory(editingCat.id, { name: newCatName.trim(), color: newCatColor, icon: newCatIcon }); setEditingCat(null); }
    else { addCategory({ name: newCatName.trim(), color: newCatColor, icon: newCatIcon }); }
    setNewCatName(""); setNewCatColor("#3b82f6"); setNewCatIcon("📁");
    setShowAddCategory(false);
  };

  const startEdit = (cat: CustomCategory) => {
    setEditingCat(cat); setNewCatName(cat.name); setNewCatColor(cat.color); setNewCatIcon(cat.icon);
    setShowAddCategory(true);
  };

  const openSubscribe = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
    else window.open("https://t.me/aiplannerrubot?start=subscribe", "_blank");
  };

  const openChannel = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) tg.openTelegramLink("https://t.me/miniapcortexai");
    else window.open("https://t.me/miniapcortexai", "_blank");
  };

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    applyTheme(themeId);
  };

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      <p style={{ fontSize: "22px", fontWeight: 700, color: "white", margin: "0 0 20px 0" }}>
        {ru ? "Настройки" : "Settings"}
      </p>

      {/* ПОДПИСКА */}
      <SectionTitle>{ru ? "Подписка" : "Subscription"}</SectionTitle>
      <div style={{ backgroundColor: subInfo.isActive ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.05)", border: subInfo.isActive ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "16px", marginBottom: "20px" }}>
        {subLoading ? (
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Проверяем..." : "Checking..."}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              {subInfo.isActive ? <CheckCircle size={20} color="#22c55e" /> : <XCircle size={20} color="rgba(255,255,255,0.3)" />}
              <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: 0, flex: 1 }}>
                {subInfo.isActive ? (ru ? "Подписка активна" : "Active") : (ru ? "Нет подписки" : "No subscription")}
              </p>
            </div>
            {subInfo.isActive && subInfo.expiresAt && (
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: "0 0 12px 0" }}>
                {ru ? `До: ${subInfo.expiresAt.toLocaleDateString("ru-RU")} (${subInfo.daysLeft} дн.)` : `Until: ${subInfo.expiresAt.toLocaleDateString("en-US")} (${subInfo.daysLeft} days)`}
              </p>
            )}
            {!subInfo.isActive && (
              <div style={{ marginBottom: "12px" }}>
                {[
                  ru ? "📅 1 мес — 99 ₽ / 73 ⭐" : "📅 1 mo — 99 ₽ / 73 ⭐",
                  ru ? "🗓 3 мес — 390 ₽ / 289 ⭐" : "🗓 3 mo — 390 ₽ / 289 ⭐",
                  ru ? "🏆 12 мес — 599 ₽ / 430 ⭐" : "🏆 12 mo — 599 ₽ / 430 ⭐",
                ].map((f) => <p key={f} style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", margin: "0 0 4px 0" }}>{f}</p>)}
              </div>
            )}
            <button onClick={openSubscribe} style={{ width: "100%", height: "44px", borderRadius: "12px", border: subInfo.isActive ? "1px solid rgba(34,197,94,0.3)" : "none", backgroundColor: subInfo.isActive ? "rgba(34,197,94,0.12)" : "#3b82f6", fontSize: "14px", fontWeight: 600, color: subInfo.isActive ? "#4ade80" : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Star size={16} color={subInfo.isActive ? "#4ade80" : "white"} />
              {subInfo.isActive ? (ru ? "Продлить подписку" : "Renew") : (ru ? "Оформить подписку" : "Get subscription")}
            </button>
          </>
        )}
      </div>

      {/* ТЕМА */}
      <SectionTitle>
        <Palette size={13} style={{ marginRight: "5px" }} />
        {ru ? "Тема приложения" : "App Theme"}
      </SectionTitle>
      <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "14px", marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          {THEMES.map((theme) => (
            <button key={theme.id} onClick={() => handleThemeChange(theme.id)}
              style={{ borderRadius: "12px", border: currentTheme === theme.id ? `2px solid ${theme.primary}` : "2px solid transparent", padding: "8px", cursor: "pointer", backgroundColor: "rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              {/* Превью */}
              <div style={{ width: "100%", height: "32px", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column", gap: "2px", padding: "4px", boxSizing: "border-box" as const, backgroundColor: theme.bg }}>
                <div style={{ height: "8px", borderRadius: "3px", backgroundColor: theme.preview[1] }} />
                <div style={{ height: "4px", borderRadius: "3px", backgroundColor: theme.primary, width: "60%" }} />
              </div>
              <p style={{ fontSize: "10px", color: currentTheme === theme.id ? theme.primary : "rgba(255,255,255,0.4)", margin: 0, fontWeight: currentTheme === theme.id ? 600 : 400, textAlign: "center" as const }}>
                {ru ? theme.name.split("-")[0] : theme.nameEn.split(" ")[1]}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* TELEGRAM КАНАЛ */}
      <SectionTitle>📢 {ru ? "Новости" : "News"}</SectionTitle>
      <button onClick={openChannel} style={{ width: "100%", height: "56px", borderRadius: "14px", border: "1px solid rgba(59,130,246,0.25)", backgroundColor: "rgba(59,130,246,0.08)", fontSize: "14px", fontWeight: 500, color: "#60a5fa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "12px", paddingLeft: "16px", paddingRight: "16px", marginBottom: "20px", boxSizing: "border-box" as const }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#2AABEE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        </div>
        <div style={{ textAlign: "left", flex: 1 }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#60a5fa", margin: 0 }}>{ru ? "Канал CortexAI" : "CortexAI Channel"}</p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Новости и обновления" : "News and updates"}</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </button>

      {/* РАЗДЕЛЫ */}
      <SectionTitle>{ru ? "Мои разделы" : "My sections"}</SectionTitle>
      <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "14px", marginBottom: "20px" }}>
        {categories.map((cat) => (
          <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: "18px" }}>{cat.icon}</span>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: cat.color, flexShrink: 0 }} />
            <span style={{ fontSize: "14px", color: "white", flex: 1 }}>{cat.name}</span>
            <button onClick={() => startEdit(cat)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
              <Edit2 size={14} color="rgba(255,255,255,0.4)" />
            </button>
            {!["birthdays", "vacations"].includes(cat.id) && (
              <button onClick={() => deleteCategory(cat.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                <Trash2 size={14} color="#ef4444" />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => { setEditingCat(null); setNewCatName(""); setNewCatColor("#3b82f6"); setNewCatIcon("📁"); setShowAddCategory(true); }} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <Plus size={16} color="#3b82f6" />
          <span style={{ fontSize: "13px", color: "#60a5fa" }}>{ru ? "Добавить раздел" : "Add section"}</span>
        </button>
      </div>

      {/* СТАТИСТИКА */}
      <SectionTitle>{ru ? "Статистика" : "Statistics"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "20px" }}>
        {[{ label: ru ? "Всего" : "Total", value: tasks.length }, { label: ru ? "Активных" : "Active", value: activeTasks }, { label: ru ? "Выполнено" : "Done", value: doneTasks }].map(({ label, value }) => (
          <div key={label} style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "14px 10px", textAlign: "center" }}>
            <p style={{ fontSize: "24px", fontWeight: 700, color: "white", margin: "0 0 4px 0" }}>{value}</p>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ЯЗЫК */}
      <SectionTitle><Globe size={13} style={{ marginRight: "5px" }} />{ru ? "Язык" : "Language"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
        {[{ code: "ru", label: "🇷🇺 Русский" }, { code: "en", label: "🇺🇸 English" }].map(({ code, label }) => (
          <button key={code} onClick={() => setLanguage(code as "ru" | "en")} style={{ height: "44px", borderRadius: "12px", border: language === code ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)", backgroundColor: language === code ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)", fontSize: "14px", fontWeight: language === code ? 600 : 400, color: language === code ? "#60a5fa" : "rgba(255,255,255,0.6)", cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* АККАУНТ */}
      <SectionTitle><Shield size={13} style={{ marginRight: "5px" }} />{ru ? "Аккаунт" : "Account"}</SectionTitle>
      <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "14px 16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>Telegram ID</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{userId || "—"}</span>
        </div>
      </div>

      {/* УВЕДОМЛЕНИЯ */}
      <SectionTitle><Bell size={13} style={{ marginRight: "5px" }} />{ru ? "Уведомления" : "Notifications"}</SectionTitle>
      <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "14px 16px", marginBottom: "20px" }}>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>
          {ru ? "Уведомления приходят через @aiplannerrubot в Telegram" : "Notifications via @aiplannerrubot in Telegram"}
        </p>
      </div>

      {/* ОПАСНАЯ ЗОНА */}
      <SectionTitle style={{ color: "rgba(239,68,68,0.7)" }}>
        <Trash2 size={13} style={{ marginRight: "5px" }} />{ru ? "Опасная зона" : "Danger zone"}
      </SectionTitle>
      <button onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.showConfirm(ru ? "Удалить все задачи?" : "Delete all tasks?", (confirmed: boolean) => { if (confirmed) { localStorage.removeItem("cortex-tasks"); window.location.reload(); } }); }} style={{ width: "100%", height: "44px", borderRadius: "12px", border: "1px solid rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.08)", fontSize: "14px", fontWeight: 500, color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
        <Trash2 size={16} />{ru ? "Удалить все задачи" : "Delete all tasks"}
      </button>

      {/* МОДАЛКА РАЗДЕЛА */}
      {showAddCategory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddCategory(false); }}>
          <div ref={modalRef} onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#1e293b", borderRadius: "20px", padding: "20px", width: "100%", maxWidth: "320px", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "80vh", overflowY: "auto", boxSizing: "border-box" as const }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>
                {editingCat ? (ru ? "Изменить раздел" : "Edit section") : (ru ? "Новый раздел" : "New section")}
              </p>
              <button onClick={() => setShowAddCategory(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="rgba(255,255,255,0.4)" />
              </button>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0" }}>{ru ? "Иконка" : "Icon"}</p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {["📁", "🎂", "🌴", "💳", "🏠", "💊", "🏋️", "📚", "🎯", "✈️", "🎵", "💼", "🚗", "🏥", "🎓", "💰"].map((icon) => (
                  <button key={icon} onClick={() => setNewCatIcon(icon)} style={{ width: "36px", height: "36px", fontSize: "18px", borderRadius: "8px", cursor: "pointer", backgroundColor: newCatIcon === icon ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.07)", border: newCatIcon === icon ? "1px solid #3b82f6" : "1px solid transparent" }}>{icon}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Название" : "Name"}</p>
              <input ref={nameInputRef} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddCategory()} placeholder={ru ? "Название раздела" : "Section name"} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, height: "42px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "12px", paddingRight: "12px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0" }}>{ru ? "Цвет" : "Color"}</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {["#3b82f6", "#ef4444", "#f59e0b", "#22c55e", "#a855f7", "#ec4899", "#06b6d4", "#f97316"].map((color) => (
                  <button key={color} onClick={() => setNewCatColor(color)} style={{ width: "30px", height: "30px", borderRadius: "50%", backgroundColor: color, border: newCatColor === color ? "3px solid white" : "2px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>

            <button onClick={handleAddCategory} disabled={!newCatName.trim()} style={{ width: "100%", height: "44px", borderRadius: "12px", border: "none", backgroundColor: newCatName.trim() ? "#3b82f6" : "rgba(255,255,255,0.1)", fontSize: "14px", fontWeight: 600, color: "white", cursor: newCatName.trim() ? "pointer" : "default" }}>
              {editingCat ? (ru ? "Сохранить" : "Save") : (ru ? "Создать раздел" : "Create section")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: "8px", ...style }}>
      {children}
    </div>
  );
}
