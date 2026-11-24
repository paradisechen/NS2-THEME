import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, Home, Star } from 'lucide-react';
import type { AdaptivePalette } from '../types/skyline';
import type { Switch2LayoutMetrics } from '../utils/rp5Layout';
import {
  BROWSER_HOME_URL,
  normalizeBrowserInput,
  type BrowserBookmark,
} from '../utils/browserHelper';
import { BottomControllerGlyph } from './BottomControllerGlyph';
import { SwitchPdfIcon } from './SwitchPdfIcons';

interface BrowserViewProps {
  initialUrl?: string;
  palette: AdaptivePalette;
  metrics: Switch2LayoutMetrics;
  onClose: () => void;
}

const FAVORITES_STORAGE_KEY = 'skyline2_browser_favorites_v1';

function loadSavedFavorites(): BrowserBookmark[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.url === 'string' && typeof x.label === 'string')
      .map((x) => ({ label: x.label, url: x.url, isFavorite: true }));
  } catch {
    return [];
  }
}

function buildUrlLabel(url: string, title?: string): string {
  if (title && title.trim().length >= 2) {
    return title.trim().slice(0, 26);
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 24);
  }
}

/**
 * Clean NS2 Simple Nintendo-Style Internet Browser:
 * - Basic Back (<), Next (>), Home (https://www.nintendo.com), URL bar, Favorite Star (★)
 * - Unobstructed full-bleed website viewport so pages never render squished or overlapped
 */
export function BrowserView({
  initialUrl = BROWSER_HOME_URL,
  palette,
  metrics,
  onClose,
}: BrowserViewProps) {
  const startUrl = normalizeBrowserInput(initialUrl || BROWSER_HOME_URL);
  const [historyState, setHistoryState] = useState<{ stack: string[]; index: number }>({
    stack: [startUrl],
    index: 0,
  });
  const [addressInput, setAddressInput] = useState<string>(startUrl);
  const [pageTitle, setPageTitle] = useState<string>('');
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [favorites, setFavorites] = useState<BrowserBookmark[]>(loadSavedFavorites);

  const historyStack = historyState.stack;
  const historyIndex = historyState.index;
  const activeUrl = historyStack[historyIndex] ?? startUrl;
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyStack.length - 1;

  const isCurrentFavorite = useMemo(
    () => favorites.some((f) => f.url === activeUrl),
    [favorites, activeUrl]
  );

  const navigateTo = useCallback((raw: string) => {
    const normalized = normalizeBrowserInput(raw);
    setHistoryState((prev) => {
      const sliced = prev.stack.slice(0, prev.index + 1);
      if (sliced[sliced.length - 1] === normalized) {
        return { stack: sliced, index: sliced.length - 1 };
      }
      const nextStack = [...sliced, normalized];
      return { stack: nextStack, index: nextStack.length - 1 };
    });
    setAddressInput(normalized);
    setPageTitle('');
    setReloadNonce((n) => n + 1);
  }, []);

  const goBack = useCallback(() => {
    if (historyState.index <= 0) return;
    const nextIdx = historyState.index - 1;
    const target = historyState.stack[nextIdx];
    setHistoryState((prev) => ({ ...prev, index: nextIdx }));
    setAddressInput(target);
    setPageTitle('');
    setReloadNonce((n) => n + 1);
  }, [historyState]);

  const goForward = useCallback(() => {
    if (historyState.index >= historyState.stack.length - 1) return;
    const nextIdx = historyState.index + 1;
    const target = historyState.stack[nextIdx];
    setHistoryState((prev) => ({ ...prev, index: nextIdx }));
    setAddressInput(target);
    setPageTitle('');
    setReloadNonce((n) => n + 1);
  }, [historyState]);

  const goHome = useCallback(() => {
    navigateTo(BROWSER_HOME_URL);
  }, [navigateTo]);

  const toggleFavorite = useCallback(() => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.url === activeUrl);
      const next = exists
        ? prev.filter((f) => f.url !== activeUrl)
        : [{ label: buildUrlLabel(activeUrl, pageTitle), url: activeUrl, isFavorite: true }, ...prev];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }, [activeUrl, pageTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'skyline-browser-nav' && typeof data.url === 'string') {
        navigateTo(data.url);
      } else if (data.type === 'skyline-browser-loaded') {
        if (typeof data.title === 'string' && data.title.trim()) {
          setPageTitle(data.title.trim());
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigateTo]);

  const iframeSrc = `/api/browser/view?url=${encodeURIComponent(activeUrl)}&r=${reloadNonce}`;

  const h = metrics.viewportHeight;
  const padX = Math.max(20, Math.round(metrics.screenMargin * 0.85));
  const isDark = palette.isDark;
  const bg = isDark ? '#1A1C21' : '#EFEFEF';
  const cardBg = isDark ? '#252830' : '#FFFFFF';
  const textMain = isDark ? '#F3F4F6' : '#1F2329';
  const textMuted = isDark ? '#9CA3AF' : '#5E6570';
  const divider = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Internet Browser"
      data-testid="browser-view"
      className="animate-ns2-fade absolute inset-0 z-40 flex flex-col overflow-hidden select-none"
      style={{ backgroundColor: bg, color: textMain }}
    >
      {/* Simple NS2 Nintendo Top Bar: Back, Next, Home (nintendo.com), URL Bar, Favorite Star */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{
          height: `${Math.max(48, Math.round(h * 0.1))}px`,
          paddingLeft: `${padX}px`,
          paddingRight: `${padX}px`,
          borderBottom: `1px solid ${divider}`,
        }}
      >
        <button
          type="button"
          aria-label="Previous page"
          data-testid="browser-back-btn"
          disabled={!canGoBack}
          onClick={goBack}
          className="p-2 rounded-lg cursor-pointer disabled:opacity-35 hover:opacity-80 transition-opacity shrink-0"
          style={{ backgroundColor: cardBg, border: `1px solid ${divider}` }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Next page"
          data-testid="browser-next-btn"
          disabled={!canGoForward}
          onClick={goForward}
          className="p-2 rounded-lg cursor-pointer disabled:opacity-35 hover:opacity-80 transition-opacity shrink-0"
          style={{ backgroundColor: cardBg, border: `1px solid ${divider}` }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          aria-label="Home page"
          data-testid="browser-home-btn"
          onClick={goHome}
          className="p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity shrink-0"
          style={{ backgroundColor: cardBg, border: `1px solid ${divider}` }}
        >
          <Home className="w-4 h-4" />
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo(addressInput);
            (document.activeElement as HTMLElement | null)?.blur?.();
          }}
          className="flex-1 flex items-center gap-2 min-w-0"
        >
          <div
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0"
            style={{ backgroundColor: cardBg, border: `1px solid ${divider}` }}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: textMuted }} />
            <input
              type="text"
              aria-label="Browser address"
              data-testid="browser-url-input"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onBlur={() => window.getSelection()?.removeAllRanges()}
              className="w-full bg-transparent text-xs font-ud-regular focus:outline-none select-text"
              style={{ color: textMain }}
            />
          </div>
          <button
            type="submit"
            data-testid="browser-go-btn"
            className="px-3.5 py-1.5 rounded-lg text-xs font-ud-semibold text-white cursor-pointer shrink-0"
            style={{ backgroundColor: '#E60012' }}
          >
            Go
          </button>
        </form>

        <button
          type="button"
          aria-label={isCurrentFavorite ? 'Remove favorite' : 'Add favorite'}
          aria-pressed={isCurrentFavorite}
          data-testid="browser-favorite-btn"
          onClick={toggleFavorite}
          className="p-2 rounded-lg cursor-pointer shrink-0 transition-colors"
          style={{
            backgroundColor: isCurrentFavorite ? '#F59E0B' : cardBg,
            color: isCurrentFavorite ? '#FFFFFF' : textMain,
            border: `1px solid ${isCurrentFavorite ? '#F59E0B' : divider}`,
          }}
        >
          <Star className="w-4 h-4" fill={isCurrentFavorite ? '#FFFFFF' : 'none'} />
        </button>
      </div>

      {/* Full Unobstructed Website Viewport */}
      <div className="flex-1 min-h-0 w-full bg-white relative">
        <iframe
          key={`${activeUrl}-${reloadNonce}`}
          src={iframeSrc}
          title="SkyLine 3 In-App Browser"
          data-testid="browser-iframe"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          className="w-full h-full border-0 bg-white block"
        />
      </div>

      {/* Slim Bottom Bar */}
      <footer style={{ paddingLeft: `${padX}px`, paddingRight: `${padX}px` }}>
        <div className="w-full h-px" style={{ backgroundColor: divider }} />
        <div
          className="flex items-center justify-between"
          style={{ height: `${Math.max(38, Math.round(h * 0.08))}px` }}
        >
          <BottomControllerGlyph size={metrics.helpIconSize} color={textMain} />
          <button
            type="button"
            data-testid="browser-close-btn"
            onClick={onClose}
            className="flex items-center gap-2 cursor-pointer hover:opacity-75"
          >
            <SwitchPdfIcon
              button="B"
              size={Math.max(20, Math.round(metrics.helpIconSize * 0.65))}
              fillColor={textMain}
              cutoutColor={bg}
            />
            <span
              className="font-ud-regular"
              style={{ fontSize: `${metrics.helpFontSize}px`, color: textMain }}
            >
              Back
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}
