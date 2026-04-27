import { Languages } from "lucide-react";
import { useI18nStore } from "@/lib/i18n";


export default function LanguageToggle() {
  const language = useI18nStore((state) => state.language);
  const toggleLanguage = useI18nStore((state) => state.toggleLanguage);

  return (
    <button
      onClick={toggleLanguage}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
    >
      <Languages className="h-4 w-4" />
      {language === "en" ? "RU" : "EN"}
    </button>
  );
}
