import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import hbs from 'hbs';
import geocode from './utils/geocode.js';
import forecast from './utils/prediksiCuaca.js';
import { getCachedNews, fetchNews } from './utils/berita.js';
import nodeFetch from 'node-fetch';
const fetch = globalThis.fetch ?? nodeFetch;

// Pengambilan berita dan mekanisme cache dipindahkan ke src/utils/berita.js

// Konversi __filename / __dirname untuk ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// -----------------------------
// Konfigurasi direktori & view
// -----------------------------
const direktoriPublic = path.join(__dirname, '../public');
const direktoriViews = path.join(__dirname, '../templates/views');
const direktoriPartials = path.join(__dirname, '../templates/partials');

app.set('view engine', 'hbs');
app.set('views', direktoriViews);
hbs.registerPartials(direktoriPartials);
app.use(express.static(direktoriPublic));

// -----------------------------
// Route: halaman statis dan API
// -----------------------------

// Halaman utama
app.get('', (req, res) => {
  res.render('index', { judul: 'Strato Nimbus', nama: 'Fattan Naufan Islami' });
});

// Halaman bantuan (FAQ)
app.get('/bantuan', (req, res) => {
  res.render('bantuan', { judul: 'Halaman Bantuan', nama: 'Fattan Naufan Islami' });
});

// Endpoint API: /infoCuaca?address=...
// Mengembalikan JSON konsisten: { prediksiCuaca, lokasi, address }
app.get('/infoCuaca', (req, res) => {
  if (!req.query.address) {
    return res.status(400).send({ error: 'Kamu harus memasukkan lokasi yang ingin dicari' });
  }

  geocode(req.query.address, (error, dataGeocode = {}) => {
    if (error) return res.status(500).send({ error });

    const { latitude, longitude, location } = dataGeocode;

    forecast(latitude, longitude, (error, dataPrediksi) => {
      if (error) return res.status(500).send({ error });

      // Pastikan bentuk respons konsisten (objek prediksi)
      const prediksiWrapped = typeof dataPrediksi === 'string' ? { deskripsi: dataPrediksi } : dataPrediksi;

      res.send({ prediksiCuaca: prediksiWrapped, lokasi: location, address: req.query.address });
    });
  });
});

// Halaman tentang
app.get('/tentang', (req, res) => {
  res.render('tentang', { judul: 'Tentang', nama: 'Fattan Naufan Islami' });
});

// Halaman Berita - fetch dari MediaStack, map ke bentuk yang dibutuhkan berita.hbs
app.get('/berita', async (req, res) => {
  const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 12));
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

  const cached = (!refresh) ? getCachedNews() : null;
  if (cached) {
    console.log(`[berita] Serve from cache (${cached.length} items), page=${page}, limit=${limit}`);
    const total = cached.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = cached.slice(start, start + limit);
    return res.render('berita', { judul: 'Berita Terkini', news: pageItems, page, limit, total, totalPages, nama: 'Fattan Naufan Islami', newsError: null });
  }

  if (!MEDIASTACK_KEY) {
    const msg = 'Tidak ada MEDIASTACK_KEY di environment. Set env var MEDIASTACK_KEY.';
    console.log(`[berita] ${msg}`);
    return res.render('berita', { judul: 'Berita Terkini', news: [], page: 1, limit, total: 0, totalPages: 0, nama: 'Fattan Naufan Islami', newsError: msg });
  }

  try {
    const { data: mapped, error } = await fetchNews(MEDIASTACK_KEY, { fetchLimit: 100 });
    if (error) {
      console.log('[berita] fetch error:', error);
      return res.render('berita', { judul: 'Berita Terkini', news: [], page: 1, limit, total: 0, totalPages: 0, nama: 'Fattan Naufan Islami', newsError: error });
    }

    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = mapped.slice(start, start + limit);
    return res.render('berita', { judul: 'Berita Terkini', news: pageItems, page, limit, total, totalPages, nama: 'Fattan Naufan Islami', newsError: null });
  } catch (e) {
    const msg = `Gagal mem-fetch MediaStack: ${e && e.message ? e.message : String(e)}`;
    console.log('[berita] exception:', e);
    return res.render('berita', { judul: 'Berita Terkini', news: [], page: 1, limit, total: 0, totalPages: 0, nama: 'Fattan Naufan Islami', newsError: msg });
  }
});

// JSON API untuk berita (digunakan klien AJAX)
app.get('/api/berita', async (req, res) => {
  const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY || '';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 12));
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

  const cached = (!refresh) ? getCachedNews() : null;
  if (cached) {
    const total = cached.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = cached.slice(start, start + limit);
    return res.json({ news: pageItems, page, limit, total, totalPages, newsError: null });
  }

  if (!MEDIASTACK_KEY) {
    const msg = 'Tidak ada MEDIASTACK_KEY di environment. Set env var MEDIASTACK_KEY.';
    console.log(`[api/berita] ${msg}`);
    return res.json({ news: [], page: 1, limit, total: 0, totalPages: 0, newsError: msg });
  }

  try {
    const { data: mapped, error } = await fetchNews(MEDIASTACK_KEY, { fetchLimit: 100 });
    if (error) {
      console.log('[api/berita] fetch error:', error);
      return res.json({ news: [], page: 1, limit, total: 0, totalPages: 0, newsError: error });
    }

    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = mapped.slice(start, start + limit);
    return res.json({ news: pageItems, page, limit, total, totalPages, newsError: null });
  } catch (e) {
    const msg = `Gagal mem-fetch MediaStack: ${e && e.message ? e.message : String(e)}`;
    console.log('[api/berita] exception:', e);
    return res.json({ news: [], page: 1, limit, total: 0, totalPages: 0, newsError: msg });
  }
});

// Handler untuk /bantuan/:artikel (contoh fallback spesifik)
app.get('/bantuan/:artikel', (req, res) => {
  res.status(404).render('404', { judul: '404', nama: 'Fattan Naufan Islami', pesanKesalahan: 'Artikel yang dicari tidak ditemukan.' });
});

// Handler 404 umum
app.use((req, res) => {
  res.status(404).render('404', { judul: '404', nama: 'Fattan Naufan Islami', pesanKesalahan: 'Halaman tidak ditemukan.' });
});

// Jalankan server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server berjalan pada port ${PORT}.`);
  // Indikasikan apakah MEDIASTACK_KEY tersedia (tanpa menampilkan nilai kunci)
  console.log(`MEDIASTACK_KEY present: ${process.env.MEDIASTACK_KEY ? 'yes' : 'no'}`);
});