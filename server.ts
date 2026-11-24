import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  APKP_FALLBACK_CATALOG,
  parseApkPortsDetailHtml,
  parseApkPortsListHtml,
} from './src/utils/apkportsParser.ts';
import {
  NSWPEDIA_FALLBACK_CATALOG,
  parseNswpediaListHtml,
} from './src/utils/nswpediaParser.ts';
import {
  extractArticleContentHtml,
  GENERAL_NEWS_FALLBACK_BY_CATEGORY,
  GENERAL_NEWS_FALLBACK_ITEMS,
  NEWS_FALLBACK_BY_CATEGORY,
  NSO_FALLBACK_ITEMS,
  parseRedditJsonPosts,
  parseRssOrAtomXml,
} from './src/utils/rssFeedParser.ts';
import type { GeneralNewsCategoryId, NewsFeedItem, NsoCategoryId } from './src/types/skyline.ts';
import {
  buildCalibratedPegasusThemeZip,
  parseSkylineConfigFromQuery,
} from './src/utils/pegasusThemeZip.ts';
import {
  buildInAppBridgeScript,
  escapeHtml,
  extractYouTubeVideoId,
  extractYouTubeVideosFromHtml,
  isSafeExternalHttpUrl,
  parseDuckDuckGoHtmlResults,
  rewriteCssForInAppProxy,
  rewriteHtmlForInAppFrame,
  type YouTubeVideoCard,
} from './src/utils/browserHelper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APKP_ORIGIN = 'https://www.apkports.com';
const NSWPEDIA_ORIGIN = 'http://nswpedia.com';
const ALLOWED_IMAGE_HOSTS = new Set([
  'www.apkports.com',
  'apkports.com',
  'nswpedia.com',
  'www.nswpedia.com',
  'i.ytimg.com',
  'assets.nintendo.com',
  'cdn.cloudflare.steamstatic.com',
  'img3.pixhost.to',
  'img2.pixhost.to',
  'img1.pixhost.to',
  'sxcu.net',
  'iili.io',
  'i.imgur.com',
  'apkvision.org',
]);

const FALLBACK_COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1E2430"/><stop offset="100%" stop-color="#2B3242"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="260" y="130" width="120" height="100" rx="16" fill="none" stroke="#4FD1FF" stroke-width="6" opacity="0.65"/><circle cx="320" cy="180" r="14" fill="#4FD1FF" opacity="0.65"/></svg>`;

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const listCache = new Map<string, CacheEntry<unknown>>();
const detailCache = new Map<string, CacheEntry<unknown>>();
const feedCache = new Map<string, CacheEntry<NewsFeedItem[]>>();

const NSO_RSS_SOURCES: { name: string; url: string; colors: [string, string] }[] = [
  { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#E60012', '#991B1B'] },
  { name: 'Nintendo Wire', url: 'https://www.nintendowire.com/feed/', colors: ['#DC2626', '#7F1D1D'] },
  { name: 'Nintendo Everything', url: 'https://nintendoeverything.com/feed/', colors: ['#E60012', '#1E293B'] },
  { name: 'Nintendo YouTube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCGIY_O-8vW4rfX98KlMkvRg', colors: ['#B91C1C', '#111827'] },
];

const NSO_RSS_BY_CATEGORY: Record<NsoCategoryId, { name: string; url: string; colors: [string, string] }[]> = {
  nintendo: NSO_RSS_SOURCES,
  action: [
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#DC2626', '#7C3AED'] },
    { name: 'Gematsu', url: 'https://www.gematsu.com/feed', colors: ['#0284C7', '#1E3A8A'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/news', colors: ['#E60012', '#991B1B'] },
  ],
  rpg: [
    { name: 'Gematsu', url: 'https://www.gematsu.com/feed', colors: ['#4338CA', '#7C3AED'] },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#047857', '#0284C7'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#7C3AED', '#2563EB'] },
  ],
  adventure: [
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/reviews', colors: ['#0284C7', '#0F766E'] },
    { name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', colors: ['#7C3AED', '#0EA5E9'] },
    { name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', colors: ['#0D9488', '#1E3A8A'] },
  ],
  indie: [
    { name: 'IndieGamesPlus', url: 'https://www.indiegamesplus.com/feed', colors: ['#2563EB', '#0EA5E9'] },
    { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed', colors: ['#7C3AED', '#2563EB'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/news', colors: ['#059669', '#0EA5E9'] },
  ],
  multiplayer: [
    { name: 'GameSpot', url: 'https://www.gamespot.com/feeds/news/', colors: ['#DC2626', '#1E293B'] },
    { name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', colors: ['#DB2777', '#7C3AED'] },
    { name: 'Nintendo Life', url: 'https://www.nintendolife.com/feeds/latest', colors: ['#E60012', '#0EA5E9'] },
  ],
};

const GENERAL_NEWS_RSS_BY_CATEGORY: Record<
  GeneralNewsCategoryId,
  { name: string; url: string; kind?: 'rss' | 'reddit'; colors: [string, string] }[]
> = {
  latest: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', colors: ['#E60012', '#1E293B'] },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', colors: ['#0F172A', '#2563EB'] },
    { name: 'El Nuevo Día', url: 'https://www.elnuevodia.com/arc/outboundfeeds/rss/?outputType=xml', colors: ['#0284C7', '#1E3A8A'] },
  ],
  elnuevodia: [
    { name: 'El Nuevo Día', url: 'https://www.elnuevodia.com/arc/outboundfeeds/rss/?outputType=xml', colors: ['#0284C7', '#1E3A8A'] },
    { name: 'Primera Hora', url: 'https://www.primerahora.com/arc/outboundfeeds/rss/?outputType=xml', colors: ['#0369A1', '#0F172A'] },
  ],
  puerto_rico: [
    { name: 'El Nuevo Día Locales', url: 'https://www.elnuevodia.com/arc/outboundfeeds/rss/category/noticias/locales/?outputType=xml', colors: ['#DC2626', '#0284C7'] },
    { name: 'Metro PR', url: 'https://www.metro.pr/arc/outboundfeeds/rss/?outputType=xml', colors: ['#059669', '#0F766E'] },
    { name: 'WIPR PR', url: 'https://wipr.pr/feed/', colors: ['#0284C7', '#1E3A8A'] },
  ],
  r_puertorico: [
    { name: 'r/PuertoRico', url: 'https://www.reddit.com/r/PuertoRico/hot.json?limit=18', kind: 'reddit', colors: ['#FF4500', '#0284C7'] },
    { name: 'r/PuertoRico Threads', url: 'https://news.google.com/rss/search?q=site:reddit.com/r/PuertoRico&hl=en-US&gl=US&ceid=US:en', colors: ['#EA580C', '#1E293B'] },
  ],
  politics: [
    { name: 'NPR Politics', url: 'https://feeds.npr.org/1014/rss.xml', colors: ['#B91C1C', '#1E3A8A'] },
    { name: 'BBC Politics', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml', colors: ['#991B1B', '#0F172A'] },
  ],
  economy: [
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', colors: ['#047857', '#0F172A'] },
    { name: 'NPR Business', url: 'https://feeds.npr.org/1006/rss.xml', colors: ['#0F766E', '#1E293B'] },
  ],
  tech: [
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', colors: ['#7C3AED', '#2563EB'] },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', colors: ['#EA580C', '#1E293B'] },
  ],
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Live APKPorts.com Library API for Switch 2 eShop UI
  app.get('/api/apkports/games', async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const sort = String(req.query.sort ?? 'popular');
    const category = String(req.query.category ?? '').trim();
    const portType = String(req.query.portType ?? '');
    const q = String(req.query.q ?? '').trim();
    const section = String(req.query.section ?? 'games');
    const sourceFilter = String(req.query.sourceSite ?? 'all'); // all | apkports | nswpedia

    const cacheKey = `${section}|${sourceFilter}|${page}|${sort}|${category}|${portType}|${q}`;
    const cached = listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json({ ...(cached.data as object), source: 'cache' });
      return;
    }

    const filterCatalog = (items: typeof APKP_FALLBACK_CATALOG) =>
      items.filter((g) => {
        if (q && !g.title.toLowerCase().includes(q.toLowerCase()) && !(g.description || '').toLowerCase().includes(q.toLowerCase())) {
          return false;
        }
        if (portType && g.portType !== portType) return false;
        if (category) {
          const catLower = category.toLowerCase();
          const hasCat = g.categories.some((c) => c.toLowerCase().includes(catLower) || catLower.includes(c.toLowerCase()));
          const inDesc = (g.description || '').toLowerCase().includes(catLower);
          if (!hasCat && !inDesc) return false;
        }
        return true;
      });

    const fetchNswpediaGames = async () => {
      if (sourceFilter === 'apkports') return [];
      try {
        const nswTarget = q
          ? `${NSWPEDIA_ORIGIN}/?s=${encodeURIComponent(q)}`
          : `${NSWPEDIA_ORIGIN}/nintendo-switch-roms/`;
        const r = await fetch(nswTarget, {
          signal: AbortSignal.timeout(2500),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        if (!r.ok) throw new Error(`NSWPedia HTTP ${r.status}`);
        const html = await r.text();
        const liveNsw = parseNswpediaListHtml(html);
        const mergedNsw = [...liveNsw];
        for (const fb of NSWPEDIA_FALLBACK_CATALOG) {
          if (!mergedNsw.some((x) => x.slug === fb.slug || x.title.toLowerCase() === fb.title.toLowerCase())) {
            mergedNsw.push(fb);
          }
        }
        return filterCatalog(mergedNsw);
      } catch {
        return filterCatalog(NSWPEDIA_FALLBACK_CATALOG);
      }
    };

    try {
      let apkpGames: typeof APKP_FALLBACK_CATALOG = [];
      let apkpTotalCount = 0;
      let apkpTotalPages = 1;
      let apkpCategories = [
        { name: 'Action', slug: 'action' },
        { name: 'RPG', slug: 'rpg' },
        { name: 'Adventure', slug: 'adventure' },
        { name: 'Shooter', slug: 'shooter' },
        { name: 'Platformer', slug: 'platformer' },
        { name: 'Racing', slug: 'racing' },
        { name: 'Simulation', slug: 'simulation' },
        { name: 'Sports', slug: 'sports' },
      ];

      if (sourceFilter !== 'nswpedia') {
        try {
          let targetUrl = '';
          if (q) {
            const sp = new URLSearchParams({ q });
            if (page > 1) sp.set('page', String(page));
            targetUrl = `${APKP_ORIGIN}/search?${sp.toString()}`;
          } else if (section === 'fan-games') {
            const sp = new URLSearchParams();
            if (page > 1) sp.set('page', String(page));
            targetUrl = `${APKP_ORIGIN}/fan-games${sp.toString() ? `?${sp.toString()}` : ''}`;
          } else {
            const sp = new URLSearchParams();
            sp.set('page', String(page));
            if (sort) sp.set('sort', sort);
            if (category) sp.set('category', category.toLowerCase());
            if (portType) sp.set('portType', portType);
            targetUrl = `${APKP_ORIGIN}/games?${sp.toString()}`;
          }

          const upstream = await fetch(targetUrl, {
            signal: AbortSignal.timeout(2500),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
              Accept: 'text/html,application/xhtml+xml',
            },
          });

          if (!upstream.ok) {
            throw new Error(`Upstream status ${upstream.status}`);
          }

          const html = await upstream.text();
          const parsed = parseApkPortsListHtml(html, section);
          apkpGames = parsed.games;
          if (parsed.categories.length > 0) apkpCategories = parsed.categories;

          // If upstream category page didn't populate matching titles or category slugs weren't tagged on upstream cards,
          // ensure matching APKPorts catalog items are included so categories never appear broken/empty.
          const matchingFallback = filterCatalog(APKP_FALLBACK_CATALOG);
          for (const fb of matchingFallback) {
            if (!apkpGames.some((g) => g.slug === fb.slug)) {
              apkpGames.push(fb);
            }
          }
          apkpTotalCount = Math.max(parsed.totalCount, apkpGames.length);
          apkpTotalPages = Math.max(parsed.totalPages, 1);
        } catch {
          apkpGames = filterCatalog(APKP_FALLBACK_CATALOG);
          apkpTotalCount = apkpGames.length;
        }
      }

      const nswGames = await fetchNswpediaGames();
      const combinedGames =
        sourceFilter === 'nswpedia'
          ? nswGames
          : sourceFilter === 'apkports'
            ? apkpGames
            : [...apkpGames, ...nswGames];

      const payload = {
        games: combinedGames,
        totalCount: Math.max(apkpTotalCount, combinedGames.length),
        totalPages: apkpTotalPages,
        page,
        categories: apkpCategories,
      };

      listCache.set(cacheKey, {
        expiresAt: Date.now() + 5 * 60 * 1000,
        data: payload,
      });

      res.json({ ...payload, source: combinedGames.length > 0 ? 'live' : 'fallback' });
    } catch {
      const fallbackCombined = filterCatalog([
        ...(sourceFilter === 'nswpedia' ? [] : APKP_FALLBACK_CATALOG),
        ...(sourceFilter === 'apkports' ? [] : NSWPEDIA_FALLBACK_CATALOG),
      ]);
      res.json({
        games: fallbackCombined,
        totalCount: fallbackCombined.length,
        totalPages: 1,
        page: 1,
        categories: [
          { name: 'Action', slug: 'action' },
          { name: 'RPG', slug: 'rpg' },
          { name: 'Adventure', slug: 'adventure' },
          { name: 'Shooter', slug: 'shooter' },
          { name: 'Platformer', slug: 'platformer' },
          { name: 'Racing', slug: 'racing' },
          { name: 'Simulation', slug: 'simulation' },
          { name: 'Sports', slug: 'sports' },
        ],
        source: 'fallback',
      });
    }
  });

  // Fast YouTube Trailer Resolver for eShop Cards & Game Full Page
  app.get('/api/youtube/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }
    const ytKey = `yt:${q.toLowerCase()}`;
    const cached = detailCache.get(ytKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} gameplay trailer`)}`;
      const ytRes = await fetch(searchUrl, {
        signal: AbortSignal.timeout(3500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!ytRes.ok) throw new Error(`YT HTTP ${ytRes.status}`);
      const html = await ytRes.text();
      const videos = extractYouTubeVideosFromHtml(html);
      if (videos.length === 0) throw new Error('No YouTube videos found');
      const top = videos[0];
      const payload = {
        videoId: top.videoId,
        title: top.title,
        embedUrl: `https://www.youtube-nocookie.com/embed/${top.videoId}?autoplay=1&mute=0&playsinline=1&rel=0&vq=small`,
      };
      detailCache.set(ytKey, { expiresAt: Date.now() + 30 * 60 * 1000, data: payload });
      res.json(payload);
    } catch {
      const fallbackId = '3pE23YTYEZM';
      res.json({
        videoId: fallbackId,
        title: `${q} Gameplay Trailer`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${fallbackId}?autoplay=1&mute=0&playsinline=1&rel=0&vq=small`,
      });
    }
  });

  // Live APKPorts.com / NSWPedia Game Detail endpoint
  app.get('/api/apkports/game/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) {
      res.status(400).json({ error: 'Missing slug' });
      return;
    }

    const nswMatch = NSWPEDIA_FALLBACK_CATALOG.find((g) => g.slug === slug);
    if (nswMatch) {
      res.json({
        ...nswMatch,
        requirements: 'Nintendo Switch (NSP/XCI) · Eden Emulator Direct Boot Supported',
        developer: 'Nintendo Switch Library',
        releaseDate: '2026',
        screenshots: [nswMatch.coverUrl],
        sourceUrl: nswMatch.downloadUrl || `${NSWPEDIA_ORIGIN}/`,
      });
      return;
    }

    const cached = detailCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const upstream = await fetch(`${APKP_ORIGIN}/game/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(2500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!upstream.ok) {
        throw new Error(`Status ${upstream.status}`);
      }
      const html = await upstream.text();
      const detail = parseApkPortsDetailHtml(html, slug);
      if (!detail) {
        throw new Error('Could not parse detail');
      }
      detailCache.set(slug, {
        expiresAt: Date.now() + 10 * 60 * 1000,
        data: detail,
      });
      res.json(detail);
    } catch {
      const fb = APKP_FALLBACK_CATALOG.find((g) => g.slug === slug) ?? APKP_FALLBACK_CATALOG[0];
      res.json({
        ...fb,
        description:
          fb.description ||
          `${fb.title} — Complete Android handheld release available via APKPorts.com with full controller support.`,
        requirements: 'Android 10+ · Gamepad / RP5 Controls Supported',
        developer: fb.franchises[0] || 'APKPorts Community',
        releaseDate: '2026',
        screenshots: [fb.coverUrl],
        sourceUrl: `${APKP_ORIGIN}/game/${encodeURIComponent(slug)}`,
        downloadUrl: fb.downloadUrl || `${APKP_ORIGIN}/game/${encodeURIComponent(slug)}#download`,
        videoUrl: fb.videoUrl,
      });
    }
  });

  // Allowlisted Image Proxy for APKPorts thumbnails & screenshots
  app.get('/api/apkports/image', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }

    if (!['https:', 'http:'].includes(parsedUrl.protocol) || !ALLOWED_IMAGE_HOSTS.has(parsedUrl.hostname)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Referer: `${APKP_ORIGIN}/`,
        },
      });
      if (!upstream.ok) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/webp';
      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
    }
  });

  // Live RSS Feed Endpoints for Nintendo Online & General News Sections
  app.get('/api/feeds/nso', async (req, res) => {
    const rawCat = String(req.query.category || 'nintendo') as NsoCategoryId;
    const category: NsoCategoryId = rawCat in NEWS_FALLBACK_BY_CATEGORY ? rawCat : 'nintendo';
    const refresh = req.query.refresh === '1';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const chunkSize = 12;

    const cacheKey = `nso:${category}`;
    const cached = !refresh ? feedCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      const start = (page - 1) * chunkSize;
      const slice = cached.data.slice(start, start + chunkSize);
      res.json({
        items: slice.length > 0 ? slice : cached.data.slice(0, chunkSize),
        source: 'cache',
        page,
        hasMore: cached.data.length > start + chunkSize,
      });
      return;
    }
    try {
      const sources =
        category === 'nintendo'
          ? NSO_RSS_SOURCES
          : NSO_RSS_BY_CATEGORY[category] || NSO_RSS_SOURCES;
      const results = await Promise.allSettled(
        sources.map(async (src) => {
          const r = await fetch(src.url, {
            signal: AbortSignal.timeout(2600),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
              Accept: 'application/rss+xml, application/xml, text/xml',
            },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const xml = await r.text();
          return parseRssOrAtomXml(xml, src.name, category, src.colors).slice(0, 14);
        })
      );
      const merged: NewsFeedItem[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }
      if (merged.length === 0) throw new Error('No live NSO items');
      const fullList = merged.slice(0, 36);
      feedCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: fullList });
      const start = (page - 1) * chunkSize;
      const items = fullList.slice(start, start + chunkSize);
      res.json({
        items,
        source: 'live',
        page,
        hasMore: fullList.length > start + chunkSize,
      });
    } catch {
      const catBase = NEWS_FALLBACK_BY_CATEGORY[category];
      const allFallback = [...catBase, ...NSO_FALLBACK_ITEMS.filter((x) => x.category !== category)];
      const start = (page - 1) * chunkSize;
      const items = allFallback.slice(start, start + chunkSize);
      res.json({
        items: items.length > 0 ? items : catBase,
        source: 'fallback',
        page,
        hasMore: allFallback.length > start + chunkSize,
      });
    }
  });

  app.get('/api/feeds/news', async (req, res) => {
    const rawCat = String(req.query.category || 'latest') as GeneralNewsCategoryId;
    const category: GeneralNewsCategoryId =
      rawCat in GENERAL_NEWS_FALLBACK_BY_CATEGORY ? rawCat : 'latest';
    const refresh = req.query.refresh === '1';
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const chunkSize = 12;

    const cacheKey = `news:${category}`;
    const cached = !refresh ? feedCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      const start = (page - 1) * chunkSize;
      const slice = cached.data.slice(start, start + chunkSize);
      res.json({
        items: slice.length > 0 ? slice : cached.data.slice(0, chunkSize),
        source: 'cache',
        page,
        hasMore: cached.data.length > start + chunkSize,
      });
      return;
    }

    try {
      const merged: NewsFeedItem[] = [];
      const sources = GENERAL_NEWS_RSS_BY_CATEGORY[category] || [];
      const results = await Promise.allSettled(
        sources.map(async (src) => {
          const r = await fetch(src.url, {
            signal: AbortSignal.timeout(3000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
              Accept:
                src.kind === 'reddit'
                  ? 'application/json'
                  : 'application/rss+xml, application/xml, text/xml',
            },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          if (src.kind === 'reddit') {
            const json = await r.json();
            return parseRedditJsonPosts(json, src.name, category).slice(0, 14);
          }
          const xml = await r.text();
          return parseRssOrAtomXml(xml, src.name, category, src.colors).slice(0, 14);
        })
      );
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }

      if (merged.length === 0) throw new Error('Empty news feed');
      const fullList = merged.slice(0, 36);
      feedCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: fullList });
      const start = (page - 1) * chunkSize;
      res.json({
        items: fullList.slice(start, start + chunkSize),
        source: 'live',
        page,
        hasMore: fullList.length > start + chunkSize,
      });
    } catch {
      const catBase = GENERAL_NEWS_FALLBACK_BY_CATEGORY[category];
      const allFallback = [
        ...catBase,
        ...GENERAL_NEWS_FALLBACK_ITEMS.filter((x) => x.category !== category),
      ];
      const start = (page - 1) * chunkSize;
      const items = allFallback.slice(start, start + chunkSize);
      res.json({
        items: items.length > 0 ? items : catBase,
        source: 'fallback',
        page,
        hasMore: allFallback.length > start + chunkSize,
      });
    }
  });

  // Full Article + Embedded Video Extractor for NSO / News Reader
  app.get('/api/feeds/article', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: 'Unsupported protocol' });
      return;
    }
    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(3000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      const html = await upstream.text();
      const extracted = extractArticleContentHtml(html, parsedUrl.toString());
      res.json({
        url: parsedUrl.toString(),
        paragraphs: extracted.paragraphs,
        heroImageUrl: extracted.heroImageUrl,
        videoUrl: extracted.videoUrl,
      });
    } catch {
      res.json({
        url: parsedUrl.toString(),
        paragraphs: [],
      });
    }
  });

  app.get('/api/feeds/image', async (req, res) => {
    const rawUrl = String(req.query.url ?? '');
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
      return;
    }
    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(4500),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: `${parsedUrl.origin}/`,
        },
      });
      if (!upstream.ok) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      const looksLikeImgExt = /\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(parsedUrl.pathname);
      if (!ct.startsWith('image/') && !looksLikeImgExt) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(FALLBACK_COVER_SVG);
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', ct.startsWith('image/') ? ct : 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FALLBACK_COVER_SVG);
    }
  });

  // Proxy stylesheets, fonts, and images for sites with Cross-Origin-Resource-Policy: same-site/same-origin
  app.get('/api/browser/asset', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim();
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).send('Invalid asset URL');
      return;
    }
    try {
      const parsed = new URL(rawUrl);
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          Referer: `${parsed.origin}/`,
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const finalAssetUrl = upstream.url || parsed.toString();
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      if (ct.toLowerCase().includes('text/css')) {
        const cssText = await upstream.text();
        res.send(rewriteCssForInAppProxy(cssText, finalAssetUrl));
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  // In-App Switch 2 Browser Proxy & Portal Handler (bypasses X-Frame-Options / CSP frame-ancestors)
  app.get('/api/browser/view', async (req, res) => {
    const rawUrl = String(req.query.url ?? '').trim() || 'https://www.nintendo.com';
    if (!isSafeExternalHttpUrl(rawUrl)) {
      res.status(400).send('Invalid or unsupported URL');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Malformed URL');
      return;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const renderPortalShell = (title: string, currentUrl: string, bodyHtml: string, dark = false) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${buildInAppBridgeScript(currentUrl)}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ${dark ? '#0f1014' : '#ffffff'}; color: ${dark ? '#f3f4f6' : '#1f2329'}; }
  a { color: inherit; text-decoration: none; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

    // 1. Google Search & Homepage
    if (host === 'google.com' || host.startsWith('google.')) {
      const query = parsed.searchParams.get('q')?.trim() || '';
      if (!query) {
        res.send(
          renderPortalShell(
            'Google',
            rawUrl,
            `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:#fff;">
              <div style="font-size:52px;font-weight:700;letter-spacing:-2px;margin-bottom:24px;">
                <span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span>
              </div>
              <form action="https://www.google.com/search" method="get" style="width:100%;max-width:560px;display:flex;gap:10px;">
                <input name="q" type="text" placeholder="Search Google or enter keywords..." style="flex:1;padding:12px 18px;border-radius:999px;border:1px solid #dfe1e5;font-size:15px;outline:none;box-shadow:0 1px 6px rgba(32,33,36,.12);" />
                <button type="submit" style="padding:12px 22px;border-radius:999px;border:0;background:#4285F4;color:#fff;font-weight:600;cursor:pointer;">Search</button>
              </form>
              <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">
                <a href="https://www.google.com/search?q=Retroid+Pocket+5+Pegasus" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Retroid Pocket 5</a>
                <a href="https://www.google.com/search?q=Nintendo+Switch+2+games" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Switch 2 Games</a>
                <a href="https://www.google.com/search?q=APKPorts+Android" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">APKPorts Android</a>
                <a href="https://www.nintendo.com" style="padding:8px 14px;border-radius:999px;background:#f8f9fa;border:1px solid #dadce0;font-size:13px;">Nintendo.com</a>
              </div>
            </div>`
          )
        );
        return;
      }

      let results = [] as { title: string; url: string; snippet: string }[];
      try {
        const ddg = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          },
        });
        if (ddg.ok) {
          results = parseDuckDuckGoHtmlResults(await ddg.text());
        }
      } catch {
        /* fallback below */
      }
      if (results.length === 0) {
        results = [
          { title: `${query} — Nintendo Official Site`, url: 'https://www.nintendo.com', snippet: 'Explore official console, games, and news.' },
          { title: `${query} — APKPorts Android Ports`, url: `https://www.apkports.com/games?q=${encodeURIComponent(query)}`, snippet: 'Search Android game ports and fan games for handheld devices.' },
          { title: `${query} — YouTube Video Search`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, snippet: 'Watch gameplay videos, trailers, and handheld setup guides.' },
        ];
      }

      const cardsHtml = results
        .map(
          (r) => `<div style="padding:14px 0;border-bottom:1px solid #eceff1;">
            <div style="font-size:12px;color:#5f6368;margin-bottom:4px;word-break:break-all;">${escapeHtml(r.url)}</div>
            <a href="${escapeHtml(r.url)}" style="font-size:17px;font-weight:600;color:#1a0dab;display:block;margin-bottom:4px;">${escapeHtml(r.title)}</a>
            <div style="font-size:13px;color:#4d5156;line-height:1.45;">${escapeHtml(r.snippet)}</div>
          </div>`
        )
        .join('');

      res.send(
        renderPortalShell(
          `${query} - Google Search`,
          rawUrl,
          `<div style="max-width:780px;margin:0 auto;padding:20px 24px;">
            <form action="https://www.google.com/search" method="get" style="display:flex;gap:10px;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:22px;font-weight:700;letter-spacing:-1px;"><span style="color:#4285F4">G</span><span style="color:#EA4335">o</span><span style="color:#FBBC05">o</span><span style="color:#4285F4">g</span><span style="color:#34A853">l</span><span style="color:#EA4335">e</span></span>
              <input name="q" value="${escapeHtml(query)}" style="flex:1;padding:9px 14px;border-radius:999px;border:1px solid #dfe1e5;font-size:14px;" />
              <button type="submit" style="padding:9px 18px;border-radius:999px;border:0;background:#4285F4;color:#fff;font-weight:600;cursor:pointer;">Search</button>
            </form>
            ${cardsHtml}
          </div>`
        )
      );
      return;
    }

    // 2. YouTube (Watch Embed + Home/Search Feed)
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
      const videoId = extractYouTubeVideoId(rawUrl);
      if (videoId) {
        res.send(
          renderPortalShell(
            'YouTube Video Player',
            rawUrl,
            `<div style="display:flex;flex-direction:column;height:100vh;background:#0f1014;">
              <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;background:#18191f;border-bottom:1px solid #2b2d36;">
                <a href="https://www.youtube.com" style="color:#ff0033;font-weight:700;font-size:16px;">▶ YouTube</a>
                <a href="https://www.youtube.com" style="padding:6px 12px;border-radius:999px;background:#272932;color:#f3f4f6;font-size:12px;">Back to Videos</a>
              </div>
              <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(videoId)}?autoplay=1&rel=0" style="flex:1;width:100%;border:0;" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            </div>`,
            true
          )
        );
        return;
      }

      const ytQuery = parsed.searchParams.get('search_query')?.trim() || '';
      let videos: YouTubeVideoCard[] = [];
      try {
        const target = ytQuery
          ? `https://www.youtube.com/results?search_query=${encodeURIComponent(ytQuery)}`
          : 'https://www.youtube.com/results?search_query=nintendo+switch+2+gameplay';
        const ytRes = await fetch(target, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (ytRes.ok) {
          videos = extractYouTubeVideosFromHtml(await ytRes.text());
        }
      } catch {
        /* fallback below */
      }
      if (videos.length === 0) {
        videos = [
          { videoId: '3pE23YTYEZM', title: 'Nintendo Switch 2 — First-Look Reveal Trailer', channel: 'Nintendo', thumbnail: 'https://i.ytimg.com/vi/3pE23YTYEZM/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=3pE23YTYEZM' },
          { videoId: 'mO2M8d_gX1A', title: 'Mario Kart World — Direct & Gameplay Overview', channel: 'Nintendo', thumbnail: 'https://i.ytimg.com/vi/mO2M8d_gX1A/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=mO2M8d_gX1A' },
          { videoId: 'J1gB3-7P0nE', title: 'Retroid Pocket 5 Handheld Setup & Pegasus Guide', channel: 'Retro Tech', thumbnail: 'https://i.ytimg.com/vi/J1gB3-7P0nE/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=J1gB3-7P0nE' },
        ];
      }

      const gridHtml = videos
        .map(
          (v) => `<a href="${escapeHtml(v.url)}" style="display:block;background:#1b1d24;border:1px solid #2b2e38;border-radius:12px;overflow:hidden;">
            <img src="${escapeHtml(v.thumbnail)}" alt="${escapeHtml(v.title)}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111;" />
            <div style="padding:10px 12px;">
              <div style="font-size:13px;font-weight:600;color:#f3f4f6;line-height:1.35;margin-bottom:4px;">${escapeHtml(v.title)}</div>
              <div style="font-size:11px;color:#9ca3af;">${escapeHtml(v.channel)}</div>
            </div>
          </a>`
        )
        .join('');

      res.send(
        renderPortalShell(
          ytQuery ? `${ytQuery} - YouTube` : 'YouTube',
          rawUrl,
          `<div style="padding:18px 22px;max-width:1100px;margin:0 auto;">
            <form action="https://www.youtube.com/results" method="get" style="display:flex;gap:10px;align-items:center;margin-bottom:18px;">
              <span style="color:#ff0033;font-weight:800;font-size:20px;white-space:nowrap;">▶ YouTube</span>
              <input name="search_query" value="${escapeHtml(ytQuery)}" placeholder="Search YouTube videos..." style="flex:1;padding:10px 14px;border-radius:999px;border:1px solid #353844;background:#181920;color:#fff;font-size:14px;" />
              <button type="submit" style="padding:10px 18px;border-radius:999px;border:0;background:#ff0033;color:#fff;font-weight:600;cursor:pointer;">Search</button>
            </form>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
              ${gridHtml}
            </div>
          </div>`,
          true
        )
      );
      return;
    }

    // 3. Live Reverse Proxy for Nintendo.com, APKPorts.com, News Articles & General Web Pages
    try {
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Retroid Pocket 5) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const finalUrl = upstream.url || parsed.toString();
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      const corpHeader = upstream.headers.get('cross-origin-resource-policy') || '';
      const hasCorpRestriction =
        /same-(?:origin|site)/i.test(corpHeader) || host.endsWith('apkports.com');
      if (!upstream.ok && upstream.status >= 400) {
        throw new Error(`HTTP ${upstream.status}`);
      }
      if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || ct === '') {
        const html = await upstream.text();
        if (!html || html.trim().length < 60) {
          throw new Error('Empty HTML');
        }
        const { rewrittenHtml } = rewriteHtmlForInAppFrame(html, finalUrl, {
          proxyAssets: hasCorpRestriction,
        });
        res.send(rewrittenHtml);
      } else {
        const textBody = await upstream.text();
        res.send(
          renderPortalShell(
            finalUrl,
            finalUrl,
            `<pre style="padding:20px;white-space:pre-wrap;font-size:13px;">${escapeHtml(textBody.slice(0, 50000))}</pre>`
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach site';
      res.send(
        renderPortalShell(
          parsed.hostname,
          rawUrl,
          `<div style="max-width:640px;margin:48px auto;padding:28px;border:1px solid #e5e7eb;border-radius:16px;text-align:center;">
            <h2 style="margin:0 0 8px;">${escapeHtml(parsed.hostname)}</h2>
            <p style="color:#6b7280;margin:0 0 18px;">Live embed blocked or timed out (${escapeHtml(msg)}).</p>
            <a href="${escapeHtml(rawUrl)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#0ea5e9;color:#fff;font-weight:600;">Retry Load</a>
          </div>`
        )
      );
    }
  });

  // Direct download for calibrated Pegasus Theme ZIP (Switch 2 layout + Eden direct boot fix)
  const sendThemeZip = async (req: express.Request, res: express.Response) => {
    const zipPath = path.resolve(__dirname, 'public', 'skylineos2-pegasus-theme.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).send('Theme ZIP not found on server');
      return;
    }
    try {
      const configParams = { ...(req.query ?? {}) };
      delete configParams._t;
      const hasCustomQuery = Object.keys(configParams).length > 0;
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      if (hasCustomQuery) {
        const config = parseSkylineConfigFromQuery(configParams as Record<string, unknown>);
        const buffer = await buildCalibratedPegasusThemeZip(zipPath, config);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-pegasus-theme.zip"');
        res.setHeader('Content-Length', String(buffer.length));
        res.send(buffer);
        return;
      }
      const stat = fs.statSync(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-pegasus-theme.zip"');
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(zipPath).pipe(res);
    } catch {
      res.download(zipPath, 'skylineos2-pegasus-theme.zip');
    }
  };

  // Direct download for legacy TAR.GZ
  const sendThemeTar = (_req: express.Request, res: express.Response) => {
    const tarPath = path.resolve(__dirname, 'public', 'skylineos2-project.tar.gz');
    if (fs.existsSync(tarPath)) {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="skylineos2-project.tar.gz"');
      res.setHeader('Cache-Control', 'public, max-age=300');
      fs.createReadStream(tarPath).pipe(res);
    } else {
      res.status(404).send('Theme TAR.GZ not found on server');
    }
  };

  const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

  // Read photos directly from a user-configured Photos Directory when accessible on local filesystem
  app.get('/api/album/photos', async (req, res) => {
    const rawDir = String(req.query.dir ?? '').trim();
    if (!rawDir || !path.isAbsolute(rawDir) || rawDir.includes('\0')) {
      res.json({ exists: false, dir: rawDir, photos: [] });
      return;
    }
    try {
      const resolvedDir = path.resolve(rawDir);
      const stat = await fs.promises.stat(resolvedDir);
      if (!stat.isDirectory()) {
        res.json({ exists: false, dir: resolvedDir, photos: [] });
        return;
      }
      const entries = await fs.promises.readdir(resolvedDir, { withFileTypes: true });
      const photos = entries
        .filter((e) => e.isFile() && IMAGE_EXT_RE.test(e.name))
        .slice(0, 60)
        .map((e, idx) => ({
          id: `dir-photo-${idx}-${e.name}`,
          name: e.name,
          url: `/api/album/file?dir=${encodeURIComponent(resolvedDir)}&name=${encodeURIComponent(e.name)}`,
          addedAt: resolvedDir,
        }));
      res.json({ exists: true, dir: resolvedDir, photos });
    } catch {
      res.json({ exists: false, dir: rawDir, photos: [] });
    }
  });

  app.get('/api/album/file', async (req, res) => {
    const rawDir = String(req.query.dir ?? '').trim();
    const rawName = path.basename(String(req.query.name ?? '').trim());
    if (!rawDir || !path.isAbsolute(rawDir) || !rawName || !IMAGE_EXT_RE.test(rawName)) {
      res.status(400).end();
      return;
    }
    try {
      const resolvedDir = path.resolve(rawDir);
      const fullPath = path.resolve(resolvedDir, rawName);
      if (path.dirname(fullPath) !== resolvedDir) {
        res.status(403).end();
        return;
      }
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile()) {
        res.status(404).end();
        return;
      }
      res.sendFile(fullPath);
    } catch {
      res.status(404).end();
    }
  });

  app.get('/api/download/pegasus-theme.zip', sendThemeZip);
  app.get('/skylineos2-pegasus-theme.zip', sendThemeZip);
  app.get('/api/download/skylineos2-project.tar.gz', sendThemeTar);
  app.get('/skylineos2-project.tar.gz', sendThemeTar);

  if (process.env.NODE_ENV !== 'production') {
    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};
export class ErrorOverlay extends BaseElement {}
`);
      });
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkylineOS 2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
