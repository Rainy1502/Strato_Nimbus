import nodeFetch from 'node-fetch';
const fetch = globalThis.fetch ?? nodeFetch;

// Cache in-memory untuk hasil berita
const newsCache = new Map();
const NEWS_TTL = 10 * 60 * 1000; // 10 menit

export const getCachedNews = (key = 'mediastack:latest') => {
  const entry = newsCache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.stamp) < NEWS_TTL) return entry.value;
  newsCache.delete(key);
  return null;
};

export const setCachedNews = (key = 'mediastack:latest', value) => {
  try { newsCache.set(key, { stamp: Date.now(), value }); } catch (e) { /* best-effort */ }
};

/**
 * Ambil berita dari MediaStack, peta ke view model, dan cache hasilnya.
 * Mengembalikan objek { data: Array, error: null|string }.
 * Catatan: komentar dan pesan kesalahan ditulis dalam Bahasa Indonesia (Clean Code).
 */
export async function fetchNews(mediaKey, opts = {}) {
  if (!mediaKey) return { data: [], error: 'Tidak ada MEDIASTACK_KEY di environment.' };
  const fetchLimit = opts.fetchLimit || 100;

  try {
    const url = `http://api.mediastack.com/v1/news?access_key=${encodeURIComponent(mediaKey)}&limit=${fetchLimit}`;
    const r = await fetch(url);
    let body = null;
    try { body = await r.json(); } catch (e) { body = null; }

    if (!r.ok) {
      const bodyText = body ? JSON.stringify(body) : await r.text().catch(() => '');
      const msg = `MediaStack HTTP ${r.status} ${r.statusText} ${bodyText}`;
      // Jika rate-limit (429), kembalikan cache yang tersedia sebagai fallback
      if (r.status === 429) {
        const cached = getCachedNews();
        if (cached && cached.length) {
          return { data: cached, error: 'rate_limit_reached: Menyajikan hasil cache karena batas rate tercapai.' };
        }
      }
      return { data: [], error: msg };
    }

    const data = Array.isArray(body && body.data ? body.data : []) ? body.data : [];

    const formatTanggal = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const mapped = data.map((it) => {
      const rawDate = it.published_at || null;
      let formatted = null;
      try { if (rawDate) formatted = formatTanggal.format(new Date(rawDate)); } catch (e) { formatted = rawDate; }
      return {
        title: it.title || '',
        description: it.description || '',
        url: it.url || it.source_url || '#',
        image: it.image || null,
        source: it.source || it.source_id || '',
        published_at: rawDate,
        formatted_date: formatted,
        category: it.category || 'lainnya',
        language: it.language || null
      };
    });

    // Cache hasil pemetaan
    setCachedNews('mediastack:latest', mapped);
    return { data: mapped, error: null };
  } catch (e) {
    const msg = `Gagal mem-fetch MediaStack: ${e && e.message ? e.message : String(e)}`;
    return { data: [], error: msg };
  }
}
