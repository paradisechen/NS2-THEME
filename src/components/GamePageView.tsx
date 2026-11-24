import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Images,
  MoreHorizontal,
  Play,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { AdaptivePalette, GameItem, SkylineConfig } from '../types/skyline';
import type { Switch2LayoutMetrics } from '../utils/rp5Layout';
import { BottomControllerGlyph } from './BottomControllerGlyph';
import { SwitchPdfIcon } from './SwitchPdfIcons';

interface GamePageViewProps {
  game: GameItem;
  config: SkylineConfig;
  palette: AdaptivePalette;
  metrics: Switch2LayoutMetrics;
  onPlayRequest: (game: GameItem) => void;
  onToggleFavorite: (gameId: string) => void;
  onOpenGameEdit: () => void;
  onClose: () => void;
}

/**
 * Full-screen Edge-to-Edge Game Page:
 * - Artwork backdrop + matching horizontal/bottom vignettes
 * - 5 seconds after entering, auto-plays YouTube trailer/gameplay behind vignettes
 * - Larger Back, Play, and (...) buttons
 * - (...) menu contains strictly: Edit Info & View More (multi-photo viewer)
 */
export function GamePageView({
  game,
  config,
  palette,
  metrics,
  onPlayRequest,
  onToggleFavorite,
  onOpenGameEdit,
  onClose,
}: GamePageViewProps) {
  const [focusedBtn, setFocusedBtn] = useState<'back' | 'play' | 'options'>('play');
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [expandDesc, setExpandDesc] = useState(false);

  const [resolvedEmbedUrl, setResolvedEmbedUrl] = useState<string | null>(() =>
    game.youtubeVideoId
      ? `https://www.youtube-nocookie.com/embed/${game.youtubeVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${game.youtubeVideoId}&playsinline=1&rel=0&vq=small`
      : null
  );
  const [showTrailerBg, setShowTrailerBg] = useState(false);

  const galleryPhotos = Array.from(
    new Set(
      [
        ...(game.screenshots ?? []),
        game.backgroundUrl,
        game.coverUrl,
      ].filter((u): u is string => Boolean(u && u.trim()))
    )
  );

  // Resolve YouTube video if needed, then start background trailer 5 seconds after entering
  useEffect(() => {
    setShowTrailerBg(false);
    let cancelled = false;

    if (game.youtubeVideoId) {
      setResolvedEmbedUrl(
        `https://www.youtube-nocookie.com/embed/${game.youtubeVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${game.youtubeVideoId}&playsinline=1&rel=0&vq=small`
      );
    } else {
      setResolvedEmbedUrl(null);
      fetch(`/api/youtube/search?q=${encodeURIComponent(game.title)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && data && data.videoId) {
            setResolvedEmbedUrl(
              `https://www.youtube-nocookie.com/embed/${data.videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${data.videoId}&playsinline=1&rel=0&vq=small`
            );
          }
        })
        .catch(() => {
          /* keep artwork background */
        });
    }

    const trailerTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowTrailerBg(true);
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(trailerTimer);
    };
  }, [game.id, game.title, game.youtubeVideoId]);

  const [clockText, setClockText] = useState(() => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    if (config.timeFormat === '24hr') return `${h.toString().padStart(2, '0')}:${m}`;
    const p = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m} ${p}`;
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, '0');
      setClockText(
        config.timeFormat === '24hr'
          ? `${h.toString().padStart(2, '0')}:${m}`
          : `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
      );
    }, 15000);
    return () => window.clearInterval(timer);
  }, [config.timeFormat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showPhotosModal) setShowPhotosModal(false);
        else if (showOptionsMenu) setShowOptionsMenu(false);
        else onClose();
        return;
      }

      if (showPhotosModal) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          setPhotoIdx((p) => (p + 1) % Math.max(1, galleryPhotos.length));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          setPhotoIdx((p) => (p - 1 + Math.max(1, galleryPhotos.length)) % Math.max(1, galleryPhotos.length));
        }
        return;
      }

      const order: ('back' | 'play' | 'options')[] = ['back', 'play', 'options'];
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedBtn((cur) => order[(order.indexOf(cur) + 1) % order.length]);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setFocusedBtn((cur) => order[(order.indexOf(cur) - 1 + order.length) % order.length]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (focusedBtn === 'back') onClose();
        else if (focusedBtn === 'play') onPlayRequest(game);
        else setShowOptionsMenu((v) => !v);
      } else if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorite(game.id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusedBtn, galleryPhotos.length, game, onClose, onPlayRequest, onToggleFavorite, showOptionsMenu, showPhotosModal]);

  const h = metrics.viewportHeight;
  const fontScale = (config.systemFontScalePct || 100) / 100;
  const padX = Math.max(28, Math.round(metrics.screenMargin * 1.05));
  const coverSize = Math.max(96, Math.round(h * 0.23));
  const actionBtnSize = Math.max(60, Math.round(h * 0.1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${game.title} Game Page`}
      data-testid="game-page-view"
      className="animate-ns2-fade absolute inset-0 z-40 flex flex-col justify-between overflow-hidden select-none bg-[#101216] text-white"
    >
      {/* Full Edge-to-Edge Artwork Background + Delayed 5s YouTube Trailer Behind Same Vignette */}
      <img
        src={game.backgroundUrl || game.coverUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className={`absolute inset-0 w-full h-full object-cover scale-105 ${game.coverCropClass ?? ''}`}
      />

      {showTrailerBg && resolvedEmbedUrl && !showPhotosModal && (
        <div
          aria-hidden="true"
          data-testid="game-page-trailer-bg"
          className="animate-ns2-fade absolute inset-0 overflow-hidden pointer-events-none"
        >
          <iframe
            src={resolvedEmbedUrl}
            title={`${game.title} Trailer`}
            allow="autoplay; encrypted-media"
            className="w-full h-full border-0 scale-125 pointer-events-none"
          />
        </div>
      )}

      {/* Horizontal & Bottom Vignette Gradients */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.52) 48%, rgba(0,0,0,0.14) 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 55%, rgba(0,0,0,0.8) 100%)',
        }}
      />

      {/* Top Status Strip */}
      <div
        className="relative z-10 flex items-center justify-between"
        style={{
          paddingLeft: `${padX}px`,
          paddingRight: `${padX}px`,
          paddingTop: `${Math.max(18, Math.round(h * 0.036))}px`,
        }}
      >
        <div
          className="flex items-center gap-2 font-ud-regular text-white/85"
          style={{ fontSize: `${Math.round(13 * fontScale)}px` }}
        >
          <span>{game.developer}</span>
          <span>·</span>
          <span>{game.releaseYear}</span>
          <span>·</span>
          <span>{game.genre}</span>
        </div>

        <div className="flex items-center gap-4 text-white/95 font-ud-regular">
          <span
            style={{ fontSize: `${Math.round(metrics.statusFontSize * 1.05 * fontScale)}px` }}
            className="tabular-nums"
          >
            {clockText}
          </span>
          {config.showBatteryPercent && (
            <span
              style={{ fontSize: `${Math.round(metrics.statusFontSize * 1.05 * fontScale)}px` }}
              className="tabular-nums"
            >
              86%
            </span>
          )}
        </div>
      </div>

      {/* Bottom Info Column + Enlarged Action Row */}
      <div
        className="relative z-10 flex flex-col justify-end gap-5"
        style={{
          paddingLeft: `${padX}px`,
          paddingRight: `${padX}px`,
          paddingBottom: `${Math.max(20, Math.round(h * 0.04))}px`,
        }}
      >
        {/* Cover Frame + Platform Badge */}
        <div className="flex items-end gap-4">
          <div
            className="overflow-hidden shrink-0 bg-[#1B1E26]"
            style={{
              width: `${coverSize}px`,
              height: `${coverSize}px`,
              borderRadius: `${Math.max(14, Math.round(coverSize * 0.14))}px`,
              border: `2px solid rgba(255,255,255,0.22)`,
            }}
          >
            <img
              src={game.coverUrl}
              alt={game.title}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover block ${game.coverCropClass ?? ''}`}
            />
          </div>

          <div className="flex flex-col gap-2 pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="px-3.5 py-1 rounded-lg text-xs font-ud-semibold"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  border: `1.5px solid ${palette.borderPrimary}`,
                }}
              >
                {game.platform}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-ud-regular bg-black/45 text-white/90">
                <Clock className="w-3.5 h-3.5" />
                <span>{game.playTimeHours} hrs played</span>
              </span>
              {game.lastPlayedByUser && (
                <span className="px-3.5 py-1 rounded-lg text-xs font-ud-regular bg-black/45 text-white/80">
                  Last: {game.lastPlayedByUser}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Game Title & Summary */}
        <div className="max-w-2xl space-y-2">
          <h1
            data-testid="game-page-title"
            className="font-ud-bold leading-tight tracking-tight text-white"
            style={{ fontSize: `${Math.round(Math.max(26, h * 0.056) * fontScale)}px` }}
          >
            {game.title}
          </h1>
          <p
            onClick={() => setExpandDesc((v) => !v)}
            className={`font-ud-regular text-white/85 leading-relaxed cursor-pointer ${
              expandDesc ? '' : 'line-clamp-2'
            }`}
            style={{ fontSize: `${Math.round(Math.max(13, h * 0.025) * fontScale)}px` }}
          >
            {game.summary}
          </p>
        </div>

        {/* Bigger Action Row: Back Circle + White Pill Play + (...) Circle */}
        <div className="flex items-center justify-between pt-1">
          <div className="relative flex items-center gap-4">
            <button
              type="button"
              data-testid="game-page-back"
              aria-label="Back to Home"
              onMouseEnter={() => setFocusedBtn('back')}
              onClick={onClose}
              className="rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 focus:outline-none"
              style={{
                width: `${actionBtnSize}px`,
                height: `${actionBtnSize}px`,
                backgroundColor: 'rgba(255,255,255,0.22)',
                border: focusedBtn === 'back' ? `3.5px solid ${palette.borderPrimary}` : '3.5px solid transparent',
              }}
            >
              <ArrowLeft className="w-7 h-7 text-white" />
            </button>

            <button
              type="button"
              data-testid="game-page-play"
              onMouseEnter={() => setFocusedBtn('play')}
              onClick={() => onPlayRequest(game)}
              className="px-9 rounded-full flex items-center gap-3 bg-white text-[#111317] font-ud-bold cursor-pointer transition-transform active:scale-95 focus:outline-none"
              style={{
                height: `${actionBtnSize}px`,
                fontSize: `${Math.round(Math.max(16, h * 0.028) * fontScale)}px`,
                border: focusedBtn === 'play' ? `3.5px solid ${palette.borderPrimary}` : '3.5px solid transparent',
              }}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Play</span>
            </button>

            <button
              type="button"
              data-testid="game-page-options"
              aria-label="More Options"
              onMouseEnter={() => setFocusedBtn('options')}
              onClick={() => setShowOptionsMenu((v) => !v)}
              className="rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 focus:outline-none"
              style={{
                width: `${actionBtnSize}px`,
                height: `${actionBtnSize}px`,
                backgroundColor: showOptionsMenu ? palette.borderPrimary : 'rgba(255,255,255,0.22)',
                border: focusedBtn === 'options' ? `3.5px solid ${palette.borderPrimary}` : '3.5px solid transparent',
              }}
            >
              <MoreHorizontal className="w-7 h-7 text-white" />
            </button>

            {/* (...) Menu strictly contains: Edit Info & View More */}
            {showOptionsMenu && (
              <div
                data-testid="game-page-options-menu"
                className="absolute bottom-20 left-32 w-56 rounded-xl p-2 space-y-1.5 z-20 shadow-xl"
                style={{ backgroundColor: 'rgba(20, 22, 28, 0.96)', border: '1px solid rgba(255,255,255,0.16)' }}
              >
                <button
                  type="button"
                  data-testid="game-page-opt-edit"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onOpenGameEdit();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-ud-semibold hover:bg-white/10 cursor-pointer text-left"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Edit Info</span>
                </button>
                <button
                  type="button"
                  data-testid="game-page-opt-view-more"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    setPhotoIdx(0);
                    setShowPhotosModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-ud-semibold hover:bg-white/10 cursor-pointer text-left"
                >
                  <Images className="w-4 h-4" />
                  <span>View More</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-5">
            <BottomControllerGlyph size={metrics.helpIconSize} color="#FFFFFF" />
            <div className="flex items-center gap-2 text-xs font-ud-regular text-white/90">
              <SwitchPdfIcon button="B" size={20} fillColor="#FFFFFF" cutoutColor="#101216" />
              <span>Back</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-ud-regular text-white/90">
              <SwitchPdfIcon button="A" size={20} fillColor="#FFFFFF" cutoutColor="#101216" />
              <span>Play</span>
            </div>
          </div>
        </div>
      </div>

      {/* View More Photo Gallery Overlay */}
      {showPhotosModal && (
        <div
          data-testid="game-page-photos-modal"
          className="animate-ns2-fade absolute inset-0 z-50 bg-black/92 flex flex-col justify-between p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-ud-bold text-lg">{game.title} — Gallery ({photoIdx + 1} / {galleryPhotos.length})</h2>
            <button
              type="button"
              onClick={() => setShowPhotosModal(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-ud-bold cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close (B)</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center gap-4 py-4">
            <button
              type="button"
              onClick={() => setPhotoIdx((p) => (p - 1 + galleryPhotos.length) % galleryPhotos.length)}
              className="p-3 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div className="h-full max-w-[78%] flex items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-black">
              <img
                src={galleryPhotos[photoIdx] || game.coverUrl}
                alt={`${game.title} Screenshot ${photoIdx + 1}`}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <button
              type="button"
              onClick={() => setPhotoIdx((p) => (p + 1) % galleryPhotos.length)}
              className="p-3 rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
              aria-label="Next photo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2.5 overflow-x-auto py-1">
            {galleryPhotos.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPhotoIdx(i)}
                className="w-24 h-14 rounded-lg overflow-hidden cursor-pointer shrink-0 transition-transform"
                style={{
                  border: i === photoIdx ? `3px solid ${palette.borderPrimary}` : '2px solid rgba(255,255,255,0.2)',
                }}
              >
                <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
