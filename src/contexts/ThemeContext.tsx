import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  Theme,
  THEMES,
  getStoredThemeId,
  getThemeById,
  storeThemeId,
  saveThemeCloud,
  loadThemeCloud,
} from "@/lib/theme";
import { getTelegramUserId } from "@/lib/store";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (id: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: async () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getThemeById(getStoredThemeId()));

  useEffect(() => {
    // Загружаем тему из облака при старте
    const userId = getTelegramUserId();
    loadThemeCloud(userId).then((cloudId) => {
      if (cloudId && cloudId !== getStoredThemeId()) {
        const cloudTheme = getThemeById(cloudId);
        storeThemeId(cloudId);
        setThemeState(cloudTheme);
      }
    });
  }, []);

  const setTheme = async (id: string) => {
    const newTheme = getThemeById(id);
    storeThemeId(id);
    setThemeState(newTheme);
    // Сохраняем в облако
    const userId = getTelegramUserId();
    await saveThemeCloud(userId, id);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
