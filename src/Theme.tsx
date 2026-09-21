import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './video-editor/Icon';

type Theme = 'light' | 'dark';

const themeKey = 'silent-forward-theme';
const storedTheme = localStorage.getItem(themeKey);
const initialTheme: Theme =
  storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

document.documentElement.dataset.theme = initialTheme;

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeKey, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const context = useContext(ThemeContext);
  if (!context) return null;

  const next = context.theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={`Activează tema ${next === 'dark' ? 'întunecată' : 'luminoasă'}`}
      title={`Tema ${next === 'dark' ? 'întunecată' : 'luminoasă'}`}
      onClick={() => context.setTheme(next)}
    >
      <Icon name={context.theme === 'light' ? 'moon' : 'sun'} size={17} />
      <span>{context.theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
