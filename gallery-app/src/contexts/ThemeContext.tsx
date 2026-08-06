import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type ThemeName = 'default' | 'christmas' | 'valentines' | 'holy-week' | 'mothers-day' | 'fathers-day';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  accent: string;
  bg: string;
  bgSecondary: string;
  text: string;
  border: string;
}

export interface Theme {
  name: ThemeName;
  label: string;
  colors: ThemeColors;
}

export const THEMES: Record<ThemeName, Theme> = {
  default: {
    name: 'default',
    label: 'Default',
    colors: {
      primary: '#823E0B',
      primaryLight: '#A05219',
      accent: '#C1570D',
      bg: '#FAF8F5',
      bgSecondary: '#F7F0E9',
      text: '#1E1E1E',
      border: '#E8E0D8',
    },
  },
  christmas: {
    name: 'christmas',
    label: 'Christmas',
    colors: {
      primary: '#C62828',
      primaryLight: '#EF5350',
      accent: '#2E7D32',
      bg: '#FFF5F5',
      bgSecondary: '#FFEBEE',
      text: '#B71C1C',
      border: '#FFCDD2',
    },
  },
  valentines: {
    name: 'valentines',
    label: "Valentine's Day",
    colors: {
      primary: '#D32F2F',
      primaryLight: '#EF5350',
      accent: '#E91E63',
      bg: '#FFF0F3',
      bgSecondary: '#FCE4EC',
      text: '#880E4F',
      border: '#F8BBD0',
    },
  },
  'holy-week': {
    name: 'holy-week',
    label: 'Holy Week',
    colors: {
      primary: '#4A148C',
      primaryLight: '#7B1FA2',
      accent: '#7B1FA2',
      bg: '#F3E5F5',
      bgSecondary: '#EDE7F6',
      text: '#311B92',
      border: '#D1C4E9',
    },
  },
  'mothers-day': {
    name: 'mothers-day',
    label: "Mother's Day",
    colors: {
      primary: '#AD1457',
      primaryLight: '#E91E63',
      accent: '#F48FB1',
      bg: '#FCE4EC',
      bgSecondary: '#F8BBD0',
      text: '#880E4F',
      border: '#F48FB1',
    },
  },
  'fathers-day': {
    name: 'fathers-day',
    label: "Father's Day",
    colors: {
      primary: '#1565C0',
      primaryLight: '#42A5F5',
      accent: '#42A5F5',
      bg: '#E3F2FD',
      bgSecondary: '#BBDEFB',
      text: '#0D47A1',
      border: '#90CAF9',
    },
  },
};

function getAutoDetectTheme(): ThemeName {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 12) return 'christmas';
  if (month === 2 && day <= 14) return 'valentines';
  if ((month === 3 || month === 4) && day <= 30) return 'holy-week';
  if (month === 5 && day <= 15) return 'mothers-day';
  if (month === 6 && day <= 21) return 'fathers-day';
  return 'default';
}

const THEME_CLASSES = ['theme-christmas', 'theme-valentines', 'theme-holy-week', 'theme-mothers-day', 'theme-fathers-day'] as const;

function injectThemeStyle(name: ThemeName) {
  const existing = document.getElementById('theme-dynamic-vars');
  if (existing) existing.remove();

  if (name === 'default') {
    const root = document.documentElement;
    THEME_CLASSES.forEach(cls => root.classList.remove(cls));
    return;
  }

  const root = document.documentElement;
  THEME_CLASSES.forEach(cls => root.classList.remove(cls));
  root.classList.add(`theme-${name}`);

  const c = THEMES[name].colors;
  const style = document.createElement('style');
  style.id = 'theme-dynamic-vars';
  style.textContent = `:root {
    --primary-color: ${c.primary} !important;
    --primary-light: ${c.primaryLight} !important;
    --accent-color: ${c.accent} !important;
    --bg-primary: ${c.bg} !important;
    --bg-secondary: ${c.bgSecondary} !important;
    --text-dark: ${c.text} !important;
    --cream-dark: ${c.border} !important;
    --color-primary: ${c.primary} !important;
    --color-primary-light: ${c.primaryLight} !important;
    --color-accent: ${c.accent} !important;
  }`;
  document.head.appendChild(style);
}

interface ThemeContextType {
  currentTheme: ThemeName;
  theme: Theme;
  autoDetect: boolean;
  setTheme: (name: ThemeName) => Promise<void>;
  setAutoDetect: (val: boolean) => Promise<void>;
  loading: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: 'default',
  theme: THEMES.default,
  autoDetect: true,
  setTheme: async () => {},
  setAutoDetect: async () => {},
  loading: true,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('default');
  const [autoDetect, setAutoDetectState] = useState(true);
  const [loading, setLoading] = useState(true);

  const applyTheme = useCallback((name: ThemeName) => {
    setCurrentTheme(name);
    injectThemeStyle(name);
  }, []);

  useEffect(() => {
    async function loadTheme() {
      try {
        const { data } = await supabase
          .from('theme_settings')
          .select('theme_name, auto_detect')
          .eq('id', 'current')
          .single();

        if (data) {
          setAutoDetectState(data.auto_detect ?? true);
          if (data.auto_detect) {
            applyTheme(getAutoDetectTheme());
          } else {
            applyTheme((data.theme_name as ThemeName) || 'default');
          }
        } else {
          applyTheme(getAutoDetectTheme());
        }
      } catch {
        applyTheme(getAutoDetectTheme());
      } finally {
        setLoading(false);
      }
    }
    loadTheme();
  }, [applyTheme]);

  useEffect(() => {
    if (!autoDetect) return;
    const interval = setInterval(() => {
      applyTheme(getAutoDetectTheme());
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoDetect, applyTheme]);

  async function setTheme(name: ThemeName) {
    applyTheme(name);
    try {
      await supabase
        .from('theme_settings')
        .upsert({ id: 'current', theme_name: name, auto_detect: false, updated_at: new Date().toISOString() });
      setAutoDetectState(false);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  }

  async function setAutoDetect(val: boolean) {
    setAutoDetectState(val);
    if (val) {
      applyTheme(getAutoDetectTheme());
    }
    try {
      await supabase
        .from('theme_settings')
        .upsert({ id: 'current', auto_detect: val, updated_at: new Date().toISOString() });
    } catch (e) {
      console.error('Failed to save auto-detect setting:', e);
    }
  }

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      theme: THEMES[currentTheme],
      autoDetect,
      setTheme,
      setAutoDetect,
      loading,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
