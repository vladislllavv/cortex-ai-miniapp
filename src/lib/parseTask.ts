export interface ParsedTask {
  title: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  description?: string;
}

export function localParseTask(text: string): ParsedTask {
  const lines = text.split("\n");
  const title = lines[0]?.slice(0, 100) || "New Task";

  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const tomorrowMatch = text.match(/завтра|tomorrow/i);

  let dueDate: string | undefined;
  if (timeMatch) {
    const baseDate = new Date();
    if (tomorrowMatch) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    baseDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]), 0, 0);
    dueDate = baseDate.toISOString();
  }

  const urgentMatch = text.match(/срочн|urgent|critical|асап|asap/i);
  const lowMatch = text.match(/когда|when|not urgent|некритично/i);
  const priority = urgentMatch ? "high" : lowMatch ? "low" : "medium";

  return {
    title,
    dueDate,
    priority,
    description: text.length > 100 ? text : undefined,
  };
}
