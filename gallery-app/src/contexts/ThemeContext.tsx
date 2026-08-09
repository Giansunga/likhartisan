import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export type ThemeName = 'default' | 'christmas' | 'valentines';

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
      primary: '#9F1D25',
      primaryLight: '#C83D42',
      accent: '#B8872D',
      bg: '#FFF8F1',
      bgSecondary: '#F4E6D3',
      text: '#2D1B16',
      border: '#E7CFAE',
    },
  },
  valentines: {
    name: 'valentines',
    label: "Valentine's Day",
    colors: {
      primary: '#9E1B32',
      primaryLight: '#C43F5A',
      accent: '#B58A52',
      bg: '#FFF7F6',
      bgSecondary: '#F8E8E9',
      text: '#3B2025',
      border: '#E8C8CA',
    },
  },
};

function getAutoDetectTheme(): ThemeName {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (month === 12) return 'christmas';
  if (month === 2 && day <= 14) return 'valentines';
  return 'default';
}

const THEME_CLASSES = ['theme-christmas', 'theme-valentines'] as const;

function isThemeName(name: unknown): name is ThemeName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(THEMES, name);
}

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
            applyTheme(isThemeName(data.theme_name) ? data.theme_name : 'default');
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
      const { error } = await supabase
        .from('theme_settings')
        .upsert({ id: 'current', theme_name: name, auto_detect: false, updated_at: new Date().toISOString() });
      if (error) throw error;
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
      const { error } = await supabase
        .from('theme_settings')
        .upsert({ id: 'current', auto_detect: val, updated_at: new Date().toISOString() });
      if (error) throw error;
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
