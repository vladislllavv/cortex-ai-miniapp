import { Calendar, Home, Settings, Sparkles } from "lucide-react";
import { t, useI18nStore } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PageKey = "home" | "calendar" | "ai" | "settings";

type Props = {
  active: PageKey;
  onNavigate: (page: PageKey) => void;
};

export default function BottomNav({ active, onNavigate }: Props) {
  const language = useI18nStore((state) => state.language);

  const items: { key: PageKey; icon: typeof Home; label: string }[] = [
    { key: "home", icon: Home, label: t(language, "navHome") },
    { key: "calendar", icon: Calendar, label: t(language, "navCalendar") },
    { key: "ai", icon: Sparkles, label: t(language, "navAi") },
    { key: "settings", icon: Settings, label: t(language, "navSettings") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0E2F44]/95 backdrop-blur-md border-t border-white/10">
      <div className="mx-auto flex max-w-md justify-around py-2">
        {items.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 text-[10px] transition-colors cursor-pointer",
                isActive ? "text-white" : "text-white/40"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
