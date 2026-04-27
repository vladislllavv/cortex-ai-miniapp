import { Loader2, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { triggerHaptic } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t, useI18nStore } from "@/lib/i18n";
import { useTaskStore } from "@/lib/store";
import { localParseTask } from "@/lib/parseTask";

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      // Имитация задержки ИИ
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const parsed = localParseTask(input);

      if (parsed.title) {
        const task = {
          title: parsed.title,
          description: parsed.description,
          // Если ИИ не распознал дату — ставим сегодня (addTask в store тоже подставит сегодня)
          dueDate: parsed.dueDate || new Date().toISOString(),
          priority: parsed.priority as "low" | "medium" | "high",
          status: "todo" as const,
          isAiCreated: true,
        };
        addTask(task);
        triggerHaptic("success");
        const datePart = task.dueDate
          ? ` (${new Date(task.dueDate).toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })})`
          : "";
        setResult(
          t(language, "taskExtracted")
            .replace("{title}", task.title)
            .replace("{date}", datePart)
        );
      } else {
        triggerHaptic("error");
        setResult(t(language, "couldNotExtract"));
      }
    } catch (error) {
      console.error("Error parsing task:", error);
      triggerHaptic("error");
      setResult(t(language, "couldNotExtract"));
    }

    setLoading(false);
  };

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-lg font-semibold text-white">{t(language, "aiProcessing")}</h1>
      <Card className="space-y-3 text-slate-800">
        <p className="text-xs text-slate-600">{t(language, "aiHelpText")}</p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <textarea
            className="h-32 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40 resize-none placeholder:text-slate-400"
            placeholder={t(language, "aiPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button className="w-full" type="submit" disabled={loading || !input.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t(language, "analyzing")}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {t(language, "analyzeWithAi")}
              </>
            )}
          </Button>
        </form>
      </Card>
      {result ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="text-sm text-slate-700">{result}</Card>
        </motion.div>
      ) : null}
    </section>
  );
}
