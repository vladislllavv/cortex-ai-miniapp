import React, { useState } from "react";
import TelegramProvider from "@/components/TelegramProvider";
import BottomNav, { type PageKey } from "@/components/BottomNav";
import HomePage from "@/pages/HomePage";
import CalendarPage from "@/pages/CalendarPage";
import AiProcessPage from "@/pages/AiProcessPage";
import SettingsPage from "@/pages/SettingsPage";

const pages: Record<PageKey, () => React.ReactElement> = {
  home: HomePage,
  calendar: CalendarPage,
  ai: AiProcessPage,
  settings: SettingsPage,
};

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("home");
  const PageComponent = pages[activePage];

  return (
    <TelegramProvider>
      <div className="mx-auto max-w-md px-4 pb-20 min-h-screen">
        <PageComponent />
        <BottomNav active={activePage} onNavigate={setActivePage} />
      </div>
    </TelegramProvider>
  );
}
