import { Card } from "@/components/ui/card";
import { t, useI18nStore } from "@/lib/i18n";

export default function SettingsPage() {
  const language = useI18nStore((state) => state.language);

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-lg font-semibold text-white">{t(language, "settingsTitle")}</h1>
      <Card className="space-y-2 text-slate-800">
        <p className="text-sm font-medium text-slate-900">{t(language, "language")}</p>
        <p className="text-xs text-slate-500">English / Русский</p>
      </Card>
      <Card className="space-y-2 text-slate-800">
        <p className="text-sm font-medium text-slate-900">{t(language, "preferences")}</p>
        <p className="text-xs text-slate-500">{t(language, "settingsDesc")}</p>
      </Card>
      <Card className="space-y-2 text-slate-800">
        <p className="text-sm font-medium text-slate-900">{t(language, "aboutCortex")}</p>
        <p className="text-xs text-slate-500">{t(language, "aboutDesc")}</p>
      </Card>
    </section>
  );
}
