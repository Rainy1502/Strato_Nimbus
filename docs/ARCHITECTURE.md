# Arsitektur Ringkas — Strato Nimbus

Dokumentasi arsitektur singkat (Bahasa Indonesia). Menjelaskan komponen utama, alur data, strategi fallback/caching, dan rekomendasi operasional.

## 1) Komponen utama
- Server (Express)
  - `src/app.js` — pengaturan route, rendering Handlebars, dan endpoint API internal (`/infoCuaca`, `/berita`, `/api/berita`).
- Utilitas
  - `src/utils/geocode.js` — melakukan geocoding (Photon) dan menyediakan callback `(error, result)`.
  - `src/utils/prediksiCuaca.js` — mengambil data cuaca dengan strategi:
    - Jika `WEATHERSTACK_KEY` tersedia, coba Weatherstack.
    - Jika Weatherstack mengembalikan error/limit, fallback ke Open‑Meteo.
    - Gunakan cache in-memory per koordinat untuk mengurangi panggilan berulang.
  - `src/utils/berita.js` — mengambil berita dari MediaStack, memetakan hasil ke view model, dan melakukan cache in-memory. Menangani 422 (validation error) dan 429 (rate_limit) dengan retry/fallback ke cache.
- Frontend statis
  - `public/js/app.js` — logika UI: form pencarian, AJAX ke `/infoCuaca` dan `/api/berita`, dan update DOM.
  - `public/css/styles.css` — styling tema, panel, dan komponen UI.
- Views
  - `templates/views/*.hbs` — halaman yang dirender server (index, tentang, berita, bantuan, 404).
  - `templates/partials/*` — header, footer, head.

## 2) Alur permintaan cuaca (ringkas)
1. Klien mengirim permintaan ke endpoint `/infoCuaca?address=...`.
2. Server memanggil `geocode(address, callback)` untuk mendapat koordinat.
3. Dengan koordinat, server memanggil `prediksiCuaca(latitude, longitude, callback)`.
   - Jika data tersedia di cache (key = "lat,lon"), kembalikan dari cache.
   - Jika ada `WEATHERSTACK_KEY`, coba Weatherstack.
   - Jika Weatherstack gagal (HTTP error atau response.error), simpan error singkat ke cache (negative cache) dan fallback ke Open‑Meteo.
   - Jika tidak ada `WEATHERSTACK_KEY`, langsung panggil Open‑Meteo.
4. Server merespons JSON yang distandarisasi: { prediksiCuaca, lokasi, address }

## 3) Alur permintaan berita (ringkas)
1. Halaman `/berita` (server-side rendering) atau AJAX `/api/berita` memicu pemanggilan util `fetchNews`.
2. `fetchNews` memanggil MediaStack:
   - Jika validasi (422) terkait parameter (mis. `languages`), util melakukan retry tanpa parameter tersebut.
   - Jika status 429 (rate limit), util akan mencoba mengembalikan data dari cache (`getCachedNews`) jika tersedia.
3. Hasil dipetakan ke bentuk ringkas (title, description, url, image, source, formatted_date) lalu di-cache.

## 4) Diagram arsitektur (Mermaid)
Berikut diagram arsitektur dalam format Mermaid (flowchart). Anda dapat menyalin blok ini ke editor yang mendukung Mermaid untuk merendernya.

```mermaid
flowchart LR
  Browser[Browser / Mobile App] -->|HTTP| Express[Express<br/>src/app.js]
  Express --> CacheLocal1[In-process cache<br/>(Map) - prediksi]
  Express --> CacheLocal2[In-process cache<br/>(Map) - berita]
  Express --> Prediksi[prediksiCuaca<br/>src/utils/prediksiCuaca.js]
  Express --> Berita[berita.js<br/>src/utils/berita.js]
  Prediksi -->|try| Weatherstack[Weatherstack API]
  Prediksi -->|fallback| OpenMeteo[Open-Meteo API]
  Berita --> MediaStack[MediaStack API]
  Redis[(Redis - optional shared cache)] --- CacheLocal1
  Redis --- CacheLocal2
  Express --- Redis
  subgraph ExternalAPIs
    Weatherstack
    OpenMeteo
    MediaStack
  end

  classDef extApi fill:#f9f,stroke:#333,stroke-width:1px;
  class Weatherstack,OpenMeteo,MediaStack extApi;
```

Catatan: blok Mermaid di atas dapat dirender di Markdown viewer yang mendukung Mermaid (mis. VS Code + extension, GitHub README setelah diubah ke mermaid-enabled viewer, atau di layanan diagram online).

## 5) Strategi Cache & Negative Caching
- Prediksi cuaca: cache per koordinat dengan TTL default 10 menit. Jika terjadi error/negatif dari provider, simpan error selama 1 menit (negative caching) untuk menghindari retry berulang.
- Berita: cache hasil mapping MediaStack selama 10 menit; pada 429 fallback ke cache bila tersedia.

## 6) Perluasan operasional (Redis, Circuit Breaker, Backoff, Monitoring)
Berikut catatan praktis untuk meningkatkannya menjadi sistem produksi-ready.

- Redis (shared cache)
  - Mengapa: in-memory Map tidak shared antar proses/pod. Redis memberi cache lintas-proses, TTL yang andal, dan operasi atomik.
  - Apa yang disimpan: key per endpoint, mis. `weather:lat,lon` dan `news:top:page1`.
  - Contoh TTL: cuaca = 600s, berita = 600s, negative-cache-error = 60s.
  - Implementasi singkat (pseudo):
    - Gunakan `ioredis` atau `redis` client.
    - Sebelum memanggil provider, cek Redis; bila ada, kembalikan hasil.
    - Setelah mendapat hasil dari provider, simpan ke Redis dengan TTL.

- Circuit breaker & exponential backoff
  - Gunakan library seperti `opossum` atau implementasi sederhana:
    - Circuit breaker memutus panggilan ke provider setelah X kegagalan berturut-turut selama jangka waktu T.
    - Setelah terbuka, coba ulang (half-open) secara berkala untuk memeriksa pemulihan.
    - Kombinasikan dengan exponential backoff pada retry (mis. 100ms, 200ms, 400ms).
  - Fokus: external APIs (Weatherstack, MediaStack). Ini mencegah gangguan menyebar ke aplikasi.

- Rate limiting & throttling (pada server)
  - Terapkan limit per IP pada endpoint publik (mis. 10 req/menit untuk `/api/berita` atau `/infoCuaca`) saat di fronting.
  - Untuk internal calls, batasi retry logic agar tidak membanjiri provider saat down.

- Monitoring & alerting
  - Hitung metrik: request/second, error rate, cache hit ratio, latency ke provider.
  - Ekspos metrics via Prometheus client dan buat dashboard Grafana.
  - Alert jika error rate provider > threshold atau latency meningkat tiba-tiba.

- Logging dan korelasi
  - Sertakan request-id (trace id) pada permintaan dan distribusikan ke log sehingga tracing antar service lebih mudah.

## 7) Deployment & scaling
- Untuk horizontal scale:
  - Gunakan Redis untuk cache bersama.
  - Pastikan sessionless server (tidak menyimpan state penting di memori proses).
  - Pertimbangkan autoscaling berdasarkan antrean (latency/CPU) bukan hanya CPU.

## 8) Langkah-langkah pengembangan cepat untuk integrasi Redis + Circuit Breaker
1. Tambahkan dependency: `npm install ioredis opossum --save`.
2. Buat wrapper cache kecil: `src/utils/cache.js` yang expose `get/set` tersederhana (wrap Redis, fallback ke Map saat Redis tidak tersedia).
3. Bungkus panggilan provider dengan `opossum` (circuit breaker) dan gunakan backoff untuk retries (3 percobaan).
4. Uji lokal: jalankan beberapa instance dan verifikasi Redis cache share berhasil.

## 9) File & titik perhatian
- `src/app.js` — load `dotenv` awal, tempat integrasi cache global (Redis client) dan circuit-breaker.
- `src/utils/prediksiCuaca.js` / `src/utils/berita.js` — titik untuk menambahkan Redis / opossum wrappers.

## 10) Diagram tambahan — versi RESTful (Mermaid)
Di bawah ini versi diagram yang menonjolkan konsep RESTful: resource URIs, HTTP verbs, dan peran API Gateway / caching layer.

```mermaid
flowchart LR
  Browser[Browser / Mobile App] -->|GET /infoCuaca?address=...| APIGW[API Gateway / Reverse Proxy]
  Browser -->|GET /api/berita?page=1| APIGW
  APIGW -->|forward| Express[Express<br/>src/app.js]

  subgraph EdgeCache[CDN / Edge Cache]
    APIGW -->|may cache (Cache-Control, ETag)| EdgeCache
  end

  Express -->|GET /infoCuaca| Prediksi[prediksiCuaca util]
  Express -->|GET /api/berita| Berita[berita util]

  Prediksi -->|call provider| Weatherstack[Weatherstack API]
  Prediksi -->|fallback| OpenMeteo[Open-Meteo API]
  Berita -->|call| MediaStack[MediaStack API]

  Redis[(Redis - shared cache)] --- Prediksi
  Redis --- Berita

  %% Error handling / rate-limit behavior
  Weatherstack -.->|429 / rate_limit| Prediksi
  MediaStack -.->|429 / rate_limit| Berita
  Prediksi -->|serve cached when rate-limited| Redis
  Berita -->|serve cached when rate-limited| Redis

  classDef gateway fill:#eef,stroke:#333,stroke-width:1px;
  class APIGW gateway;
  classDef cache fill:#efe,stroke:#333,stroke-width:1px;
  class Redis,EdgeCache cache;
```

Catatan singkat:
- Node `APIGW` mewakili reverse-proxy / API Gateway (Nginx, CloudFront+Lambda@Edge, atau API Gateway managed). Di sini tempat kita terapkan rate-limiting, IP throttling, caching header rewrite, dan auth.
- Diagram ini menekankan resource/URI dan perilaku ketika provider mengembalikan 429 (fallback ke cache). Anda bisa menambahkan detail header (Cache-Control, ETag) atau response schemas di samping node Express jika perlu.

---