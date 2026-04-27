import { Bot } from "lucide-react";
import { useTelegram } from "@/hooks/useTelegram";
import { t, useI18nStore } from "@/lib/i18n";
import LanguageToggle from "@/components/LanguageToggle";

export default function Header() {
  const { user } = useTelegram();
  const language = useI18nStore((state) => state.language);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <div className="flex items-center gap-3">
        {user?.photo_url ? (
          <img
            src={user.photo_url}
            alt="User avatar"
            className="h-10 w-10 rounded-full border-2 border-white/30 object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-white/10">
            <Bot className="h-5 w-5 text-white" />
          </div>
        )}
        <div>
          <p className="text-xs text-white/60">{t(language, "welcomeBack")}</p>
          <p className="text-sm font-semibold text-white">
            {fullName || user?.username || t(language, "cortexUser")}
          </p>
        </div>
      </div>
      <LanguageToggle />
    </header>
  );
}
