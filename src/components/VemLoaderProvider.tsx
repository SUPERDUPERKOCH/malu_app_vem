import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { VemLoader } from './VemLoader';

interface VemLoaderContextValue { showVemLoader: (duration?: number) => Promise<void> }
const VemLoaderContext = createContext<VemLoaderContextValue | null>(null);
const DEFAULT_DURATION = 2300;

export function VemLoaderProvider({ children }: PropsWithChildren) {
  const [visible, setVisible] = useState(true);
  const [generation, setGeneration] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolver = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    setVisible(false);
    resolver.current?.(); resolver.current = null;
    if (timer.current) clearTimeout(timer.current); timer.current = null;
  }, []);

  useEffect(() => { timer.current = setTimeout(finish, DEFAULT_DURATION); return () => { if (timer.current) clearTimeout(timer.current); }; }, [finish]);

  const showVemLoader = useCallback((duration = DEFAULT_DURATION) => new Promise<void>((resolve) => {
    if (timer.current) clearTimeout(timer.current);
    resolver.current?.(); resolver.current = resolve;
    setGeneration((current) => current + 1); setVisible(true);
    timer.current = setTimeout(finish, duration);
  }), [finish]);

  return <VemLoaderContext.Provider value={{ showVemLoader }}>{children}<VemLoader key={generation} visible={visible} /></VemLoaderContext.Provider>;
}

export function useVemLoader(): VemLoaderContextValue {
  const context = useContext(VemLoaderContext);
  if (!context) throw new Error('useVemLoader deve ser usado dentro de VemLoaderProvider');
  return context;
}
