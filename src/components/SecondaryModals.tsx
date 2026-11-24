import { useCallback, useEffect, useState } from 'react';
import {
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bookmark,
  Heart,
  Home,
  Play,
  Wifi,
  X,
} from 'lucide-react';
import type { AdaptivePalette, GameItem, NewsFeedItem, SkylineConfig } from '../types/skyline';
import { GENERAL_NEWS_FALLBACK_ITEMS } from '../utils/rssFeedParser';

interface SecondaryModalsProps {
  activeModal: 'detail' | 'suspend';
  selectedGame: GameItem | null;
  palette: AdaptivePalette;
  config: SkylineConfig;
  onClose: () => void;
  onToggleFavorite: (gameId: string) => void;
  onToggleBacklog: (gameId: string) => void;
  onLaunchGame: (game: GameItem) => void;
  onOpenNewsFromLock?: () => void;
}

function formatLockClock(date: Date, format: '12hr' | '24hr'): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  if (format === '24hr') {
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${period}`;
}

export function SecondaryModals({
  activeModal,
  selectedGame,
  palette,
  config,
  onClose,
  onToggleFavorite,
  onToggleBacklog,
  onLaunchGame,
  onOpenNewsFromLock,
}: SecondaryModalsProps) {
  const surfaceBg = palette.isDark ? '#1A1D24' : '#F8FAFC';
  const cardBg = palette.isDark ? '#232730' : '#FFFFFF';
  const textPrimary = palette.isDark ? '#F1F5F9' : '#0F172A';
  const textMuted = palette.isDark ? '#94A3B8' : '#475569';
  const hairline = palette.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)';

  // Switchboard Lock Screen state (3x A press unlock + 3 Top News items)
  const [pressCount, setPressCount] = useState(0);
  const [topNews, setTopNews] = useState<NewsFeedItem[]>(() =>
    GENERAL_NEWS_FALLBACK_ITEMS.slice(0, 3)
  );
  const [clockText, setClockText] = useState(() => formatLockClock(new Date(), config.timeFormat));
  const [batteryPct] = useState(86);

  useEffect(() => {
    if (activeModal !== 'suspend') return;
    setPressCount(0);
    setClockText(formatLockClock(new Date(), config.timeFormat));

    const timer = window.setInterval(() => {
      setClockText(formatLockClock(new Date(), config.timeFormat));
    }, 15000);

    let cancelled = false;
    fetch('/api/feeds/news?category=latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json && Array.isArray(json.items) && json.items.length > 0) {
          setTopNews(json.items.slice(0, 3));
        }
      })
      .catch(() => {
        // Keep fallback 3 top news items
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeModal, config.timeFormat]);

  const handleLockButtonPress = useCallback(() => {
    setPressCount((prev) => {
      const next = Math.min(3, prev + 1);
      if (next >= 3) {
        window.setTimeout(() => {
          onClose();
        }, 140);
      }
      return next;
    });
  }, [onClose]);

  useEffect(() => {
    if (activeModal !== 'suspend') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const lower = e.key.toLowerCase();
      if (e.key === 'Enter' || e.key === ' ' || lower === 'a') {
        e.preventDefault();
        e.stopPropagation();
        handleLockButtonPress();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPressCount(0);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeModal, handleLockButtonPress]);

  if (activeModal === 'suspend') {
    const BatteryGlyph =
      batteryPct >= 75 ? BatteryFull : batteryPct >= 35 ? BatteryMedium : BatteryLow;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nintendo Switchboard Lock Screen"
        data-testid="switchboard-lock-screen"
        className="animate-ns2-fade absolute inset-0 z-50 flex overflow-hidden select-none"
      >
        {/* Left Sidebar: Dark Switchboard + 3 Top News */}
        <aside className="w-[27.5%] h-full bg-[#191A1E] text-white flex flex-col shrink-0">
          <div className="pt-5 pb-3.5 px-4 flex flex-col items-center justify-center text-center shrink-0">
            <div className="text-3xl font-ud-bold tracking-wider leading-none mb-1.5">
              &minus; / +
            </div>
            <div className="text-xs font-ud-regular text-white/90 tracking-tight">
              Nintendo Switchboard
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2.5 px-3 pb-3">
            {topNews.slice(0, 3).map((news, idx) => (
              <button
                key={news.id || idx}
                type="button"
                data-testid={`lock-news-card-${idx}`}
                onClick={() => {
                  if (onOpenNewsFromLock) onOpenNewsFromLock();
                }}
                className="relative flex-1 min-h-0 w-full overflow-hidden rounded-sm bg-[#2D2F36] text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <img
                  src={news.imageUrl || '/src/assets/images/cover_azure_horizon_1795374632225.jpg'}
                  alt={news.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fbApplied !== '1') {
                      img.dataset.fbApplied = '1';
                      img.src = '/src/assets/images/cover_azure_horizon_1795374632225.jpg';
                    }
                  }}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <div className="text-[11px] font-ud-bold leading-snug text-white line-clamp-2 drop-shadow-sm">
                    {news.title}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Main Panel: Light Switchboard Surface, Top-Right Flat Status, Center HOME Circle + 3 Dots, (A) Start */}
        <section
          onClick={handleLockButtonPress}
          className="relative flex-1 h-full bg-[#EBEBEB] text-[#1E1E1E] flex flex-col justify-between cursor-pointer"
        >
          {/* Top-Right Flat Status Bar (No Bubble) */}
          <div className="flex items-center justify-end gap-3.5 px-7 pt-5 shrink-0">
            <span className="font-ud-regular tabular-nums text-sm text-[#1E1E1E]">
              {clockText}
            </span>
            {config.showWifi && (
              <Wifi className="w-4 h-4 text-[#1E1E1E]" strokeWidth={2.2} />
            )}
            <div className="flex items-center gap-1.5">
              {config.showBatteryPercent && (
                <span className="font-ud-regular tabular-nums text-sm text-[#1E1E1E]">
                  {batteryPct}%
                </span>
              )}
              <BatteryGlyph className="w-5 h-5 text-[#1E1E1E]" strokeWidth={2} />
            </div>
          </div>

          {/* Center HOME Menu Circle + 3 Black Dots Appearing on A Press */}
          <div className="flex flex-col items-center justify-center px-6">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center transition-transform duration-100 active:scale-95"
              style={{
                border: '5px solid #1E1E1E',
                transform: pressCount > 0 ? 'scale(1.03)' : 'scale(1)',
              }}
            >
              <Home className="w-12 h-12 text-[#1E1E1E] fill-current" strokeWidth={1.8} />
            </div>

            <div className="mt-3 text-base font-ud-medium text-[#2A2A2A] tracking-tight">
              HOME Menu
            </div>

            {/* 3 Black Dots appearing progressively below HOME Menu as user presses A */}
            <div
              data-testid="lock-a-dots"
              aria-label={`Unlock progress ${pressCount} of 3`}
              className="mt-4 h-4 flex items-center justify-center gap-3.5"
            >
              {[0, 1, 2].map((dotIdx) => {
                const filled = dotIdx < pressCount;
                return (
                  <span
                    key={dotIdx}
                    data-testid={`lock-dot-${dotIdx}`}
                    className={`w-3 h-3 rounded-full transition-all duration-150 ${
                      filled ? 'opacity-100 scale-100 bg-[#111111]' : 'opacity-0 scale-50 bg-[#111111]'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Bottom Center: (A) Start Prompt */}
          <div className="pb-10 flex items-center justify-center shrink-0">
            <button
              type="button"
              data-testid="lock-a-start-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleLockButtonPress();
              }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full cursor-pointer hover:opacity-80 active:scale-95 transition-transform focus:outline-none"
            >
              <span className="w-7 h-7 rounded-full bg-[#1E1E1E] text-white font-ud-bold text-sm flex items-center justify-center">
                A
              </span>
              <span className="font-ud-medium text-lg text-[#1E1E1E]">Start</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Details"
      className="animate-ns2-fade fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{
          backgroundColor: surfaceBg,
          color: textPrimary,
          border: `1px solid ${hairline}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${hairline}` }}
        >
          <h2 className="text-lg font-ud-bold tracking-tight">
            {selectedGame?.title ?? 'Game Details'}
          </h2>
          <button
            type="button"
            aria-label="Close Dialog"
            onClick={onClose}
            className="p-2 rounded-lg cursor-pointer hover:opacity-75"
            style={{ backgroundColor: cardBg, color: textPrimary }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {selectedGame && (
          <div className="p-6 flex flex-col sm:flex-row gap-6">
            <div className="w-44 h-44 rounded-2xl overflow-hidden shrink-0 shadow-lg">
              <img
                src={selectedGame.coverUrl}
                alt={selectedGame.title}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover ${selectedGame.coverCropClass ?? ''}`}
              />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="text-xs font-ud-semibold" style={{ color: textMuted }}>
                  {selectedGame.platform} · {selectedGame.developer} · {selectedGame.releaseYear} ·{' '}
                  {selectedGame.playTimeHours} hrs played
                </div>
                <p className="text-sm mt-2 leading-relaxed font-ud-regular">
                  {selectedGame.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onLaunchGame(selectedGame);
                    onClose();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-ud-bold text-white cursor-pointer"
                  style={{ backgroundColor: palette.borderPrimary }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Game</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(selectedGame.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-ud-semibold cursor-pointer"
                  style={{ backgroundColor: cardBg, border: `1px solid ${hairline}` }}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      selectedGame.favorite ? 'fill-current' : ''
                    }`}
                    style={{
                      color: selectedGame.favorite ? palette.favoriteHeartBg : textMuted,
                    }}
                  />
                  <span>{selectedGame.favorite ? 'Favorited' : 'Add Favorite'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleBacklog(selectedGame.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-ud-semibold cursor-pointer"
                  style={{ backgroundColor: cardBg, border: `1px solid ${hairline}` }}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{selectedGame.inBacklog ? 'In Backlog' : 'Add to Backlog'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
