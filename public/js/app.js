console.log('Client side javascript file diproses');

// Ambil elemen-elemen dari HTML (hanya aktif jika form ada)
const weatherForm = document.querySelector('.search-form') || document.querySelector('form');
if (weatherForm) {
  const searchInput = weatherForm.querySelector('input[name="address"]') || weatherForm.querySelector('input');
  const submitBtn = weatherForm.querySelector('button[type="submit"]');
  const pesanSatu = document.querySelector('#pesan-1');
  const pesanDua = document.querySelector('#pesan-2');

  // Pembatasan pengiriman dari sisi klien untuk menghindari permintaan berulang cepat
  let lastSubmitAt = 0;
  const SUBMIT_COOLDOWN = 3000; // ms
  const RATE_LIMIT_COOLDOWN = 30 * 1000; // if server rate-limits, disable submit for 30s

  // fungsi pembantu untuk memasukkan nilai ke elemen bila ada
  function setIf(selector, value) {
    try {
      const el = document.querySelector(selector);
      if (el && typeof value !== 'undefined' && value !== null) el.textContent = value;
    } catch (e) {}
  }

  function populateWeather(data) {
  // fungsi pembantu untuk mengambil string deskriptif mentah dari beberapa field yang mungkin ada
    function getRawDescription(d) {
      if (!d) return null;
      if (typeof d.deskripsi === 'string' && d.deskripsi.trim()) return d.deskripsi.trim();
      if (typeof d.prediksi === 'string' && d.prediksi.trim()) return d.prediksi.trim();
      if (typeof d.description === 'string' && d.description.trim()) return d.description.trim();
      if (typeof d.prediksiCuaca === 'string' && d.prediksiCuaca.trim()) return d.prediksiCuaca.trim();
      if (d.prediksiCuaca && typeof d.prediksiCuaca === 'object') {
        if (typeof d.prediksiCuaca.deskripsi === 'string' && d.prediksiCuaca.deskripsi.trim()) return d.prediksiCuaca.deskripsi.trim();
        if (typeof d.prediksiCuaca.description === 'string' && d.prediksiCuaca.description.trim()) return d.prediksiCuaca.description.trim();
      }
      return null;
    }

  function getShortFromRaw(raw) {
      if (!raw || typeof raw !== 'string') return null;
      // split before the word 'Suhu' (case-insensitive) or first period
      const parts = raw.split(/suhu|Suhu|\.|\n/);
      let short = parts && parts.length ? parts[0] : raw;
      short = short.replace(/[:\-–]+$/,'').trim();
      return short || null;
    }

  // Peta terjemahan kecil di sisi klien untuk deskripsi umum (Inggris -> Indonesia)
    function translateDescription(text) {
      if (!text || typeof text !== 'string') return text;
      const key = text.trim();
      const map = new Map([
        ['partly cloudy', 'Berawan sebagian'],
        ['patchy light drizzle', 'Gerimis ringan'],
        ['light rain', 'Hujan ringan'],
        ['moderate rain', 'Hujan sedang'],
        ['overcast', 'Berawan tebal'],
        ['sunny', 'Cerah'],
        ['clear', 'Cerah'],
        ['thundery outbreaks possible', 'Kemungkinan badai petir'],
        ['mist', 'Berkabut']
      ]);
      // normalize for lookup
      const lower = key.toLowerCase();
      if (map.has(lower)) return map.get(lower);
      return text;
    }
  // Jika server mengembalikan satu string deskriptif (data.deskripsi atau data.prediksi),
  // coba ekstrak nilai suhu, indeks UV, dan visibilitas dari teks tersebut agar
  // nilai-nilai tersebut dapat ditampilkan di kartu statistik yang sesuai.
    try {
      const raw = (data.deskripsi || data.prediksi || data.description || '');
      if (typeof raw === 'string' && raw.trim().length > 0) {
        const txt = raw;
        // Attempt to extract temperature like "25°C" or "Suhu saat ini adalah 25"
        const tempMatch = txt.match(/(\d{1,3})(?:\s?°\s?C|\s?°C|\s?°|\s?c|\s?C)/i) || txt.match(/suhu[^\d]*(\d{1,3})/i);
        if (tempMatch && !data.temp && !data.temperature && !data.suhu) {
          data.temp = Number(tempMatch[1]);
        }

        // UV: match "0 nm" or "Index UV adalah 0" or standalone number with nm
        const uvMatch1 = txt.match(/(\d{1,3})\s?nm/i);
        const uvMatch2 = txt.match(/index\s*uv[^\d]*(\d{1,3})/i);
        const uvVal = uvMatch1 ? uvMatch1[1] : (uvMatch2 ? uvMatch2[1] : null);
        if (uvVal && !data.uv_index && !data.uv) data.uv_index = Number(uvVal);

        // Visibility: match "10 km" or "Visibilitas 10 km"
        const visMatch = txt.match(/(\d+(?:[\.,]\d+)?)\s?km/i) || txt.match(/visibilit[^\d]*(\d+(?:[\.,]\d+)?)/i);
        if (visMatch && !data.visibility && !data.vis) {
          data.visibility = Number(String(visMatch[1]).replace(',', '.'));
        }

        // Short weather description: take first sentence before 'Suhu' or before first period
        if (!data.deskripsi && !data.prediksi && !data.description) {
          let short = txt.split(/suhu|Suhu|\.|\n/)[0];
          short = short.replace(/[:\-–]+$/,'').trim();
          if (short) data.description = short;
        }
      }
    } catch (e) {
      // parsing best-effort; ignore errors
    }
  // Field utama — hanya timpa placeholder jika benar-benar memiliki nilai
  setIf('.weather-location', data.lokasi ?? data.location ?? data.city ?? undefined);
    // temperature may be number; keep degree styling in HTML
    if (data.temp || data.temperature || data.suhu) {
      const t = data.temp ?? data.temperature ?? data.suhu;
      const tempEl = document.querySelector('.weather-temp');
      if (tempEl) tempEl.innerHTML = `${t}<span class="deg">°C</span>`;
    }
  // Set the concise weather-desc (e.g., "Partly Cloudy"). Prefer a short parsed phrase.
  const rawDesc = getRawDescription(data);
  const shortDesc = getShortFromRaw(rawDesc) || (typeof data.description === 'string' ? data.description : null);
  const translatedShort = translateDescription(shortDesc);
  setIf('.weather-desc', translatedShort ?? undefined);
  // ikon jika tersedia — jika berbentuk URL tampilkan gambar, jika bukan tampilkan emoji/teks
    const iconEl = document.querySelector('.weather-icon');
    if (iconEl) {
      const iconCandidate = data.iconEmoji || data.icon || data.iconUrl || data.icon_url || '';
      // clear previous
      iconEl.innerHTML = '';
      if (iconCandidate && typeof iconCandidate === 'string' && /^(https?:)?\/\//i.test(iconCandidate)) {
        // treat as image URL
        try {
          const img = document.createElement('img');
          img.src = iconCandidate;
          img.alt = data.deskripsi ?? data.description ?? 'weather icon';
          img.className = 'weather-img';
          iconEl.appendChild(img);
        } catch (e) {
          iconEl.textContent = '';
        }
      } else {
        // plain text/emoji
        iconEl.textContent = iconCandidate || '';
      }
    }

  // Grid statistik: preferensi menggunakan atribut data-field pada setiap .stat-card
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
      const field = card.getAttribute('data-field');
      const valueEl = card.querySelector('.stat-value');
      if (!valueEl) return;
      let val = null;

      if (field) {
        if (field === 'description' || field === 'ringkasan') {
          val = data.deskripsi ?? data.prediksi ?? data.description ?? data.summary ?? null;
          if (val) val = translateDescription(String(val));
        } else if (field === 'temperature' || field === 'temp' || field === 'suhu') {
          val = data.temp ?? data.temperature ?? data.suhu ?? null;
        } else if (field === 'uv_index' || field === 'uv') {
          val = data.uv_index ?? data.uv ?? data.uvindex ?? null;
        } else if (field === 'visibility') {
          val = data.visibility ?? data.vis ?? data.visibility_km ?? null;
        } else {
          // generic attempt
          val = data[field];
        }
      }

  // Fallback akhir berbasis label dipertahankan untuk kompatibilitas mundur
      if (val === null || typeof val === 'undefined' || val === '') {
        const labelEl = card.querySelector('.stat-label');
        const label = labelEl ? labelEl.textContent.trim().toLowerCase() : '';
        if (label.includes('kelembab')) val = data.humidity ?? data.kelembaban ?? data.hum ?? null;
        else if (label.includes('angin')) val = data.wind_speed ?? data.windSpeed ?? data.wind ?? null;
        else if (label.includes('jarak') || label.includes('visibil')) val = data.visibility ?? data.vis ?? null;
      }

  // Format nilai untuk ditampilkan
      if (val === null || typeof val === 'undefined' || val === '') {
        valueEl.textContent = '—';
      } else {
        // Temperature -> append °C and round
        if (field === 'temperature' || field === 'temp' || field === 'suhu') {
          const n = Number(val);
          valueEl.textContent = Number.isFinite(n) ? `${Math.round(n)}°C` : String(val);
        } else if (field === 'uv_index' || field === 'uv') {
          const n = Number(val);
          valueEl.textContent = Number.isFinite(n) ? `${n} nm` : String(val);
        } else if (field === 'visibility') {
          const n = Number(val);
          // if it's numeric assume km
          valueEl.textContent = Number.isFinite(n) ? `${n} km` : String(val);
        } else {
          // description or other textual fields
          valueEl.textContent = String(val);
        }
      }
    });

  // Juga set area deskripsi lengkap jika ada (string deskriptif penuh)
    const fullDescEl = document.querySelector('.weather-full-desc');
    if (fullDescEl) {
      const full = rawDesc ?? data.summary ?? null;
      // avoid duplicating the short translated description — show full only when it's different
      const rawTrim = (rawDesc || '').trim();
      if (full && String(full).trim() && rawTrim && String(full).trim() !== rawTrim) {
        fullDescEl.textContent = String(full);
        fullDescEl.style.display = '';
      } else {
        // hide the element completely when there's no distinct full description
        fullDescEl.textContent = '';
        fullDescEl.style.display = 'none';
      }
    }
  }

  // Event listener: ketika form disubmit
  weatherForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Mencegah reload halaman

  // Cegah pengiriman berulang sangat cepat dari sisi klien
    const now = Date.now();
    if (now - lastSubmitAt < SUBMIT_COOLDOWN) {
      if (pesanSatu) pesanSatu.textContent = 'Tunggu sebentar sebelum mencoba lagi.';
      return;
    }
    lastSubmitAt = now;

    const location = (searchInput && searchInput.value) ? searchInput.value.trim() : '';

    if (!location) {
      if (pesanSatu) pesanSatu.textContent = 'Masukkan nama lokasi terlebih dahulu!';
      if (pesanDua) pesanDua.textContent = '';
      return;
    }

    if (pesanSatu) pesanSatu.textContent = 'Sedang mencari lokasi ...';
    if (pesanDua) pesanDua.textContent = '';
  // beri tanda sedang mengirim pada tombol untuk umpan balik segera
    if (submitBtn) {
      submitBtn.classList.add('is-submitting');
      submitBtn.setAttribute('aria-disabled', 'true');
      submitBtn.disabled = true;
    }

    try {
      const response = await fetch(`/infoCuaca?address=${encodeURIComponent(location)}`);
      const data = await response.json();

      if (data.error) {
          // deteksi pesan rate-limit / terlalu banyak permintaan dan tampilkan pesan UI yang lebih ramah
        const errMsg = String(data.error || 'Terjadi kesalahan.');
        const isRate = /429|too many requests|rate limit|rate-limited|rate limited|exceeded/i.test(errMsg.toLowerCase());
        if (isRate) {
          if (pesanSatu) pesanSatu.textContent = 'Layanan cuaca sedang sibuk. Coba lagi nanti.';
          // nonaktifkan submit untuk waktu singkat sebagai proteksi terhadap API dan pengalaman pengguna
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-disabled', 'true');
            submitBtn.classList.remove('is-submitting');
            // re-enable after RATE_LIMIT_COOLDOWN
            setTimeout(() => {
              try { submitBtn.disabled = false; submitBtn.removeAttribute('aria-disabled'); } catch(e) {}
            }, RATE_LIMIT_COOLDOWN);
          }
        } else {
          if (pesanSatu) pesanSatu.textContent = errMsg;
        }
      } else {
  // Normalisasi payload: gabungkan prediksiCuaca (bisa berupa string atau objek)
        let payload = { ...data };
        if (data.prediksiCuaca) {
          if (typeof data.prediksiCuaca === 'string') {
            payload.prediksi = data.prediksiCuaca;
            payload.deskripsi = data.prediksiCuaca;
          } else if (typeof data.prediksiCuaca === 'object') {
            // shallow merge so fields like temperature, humidity, sunrise, etc. become top-level
            payload = { ...payload, ...data.prediksiCuaca };
          }
        }

  // Isi pesan dan widget
        if (pesanSatu) pesanSatu.textContent = `Lokasi: ${payload.lokasi || payload.location || location}`;
        if (pesanDua) pesanDua.textContent = payload.deskripsi || payload.prediksi || payload.description || '';
        populateWeather(payload);
      }
    } catch (err) {
      if (pesanSatu) pesanSatu.textContent = 'Gagal mengambil data cuaca.';
      if (pesanDua) pesanDua.textContent = '';
    } finally {
      // clear submitting state regardless of success/failure
      if (submitBtn) {
        submitBtn.classList.remove('is-submitting');
        submitBtn.removeAttribute('aria-disabled');
        submitBtn.disabled = false;
      }
    }
  });

  // Buat tombol terasa 'tekan' saat mouse/touch menahan. Juga dukung penekanan keyboard.
  try {
    if (submitBtn) {
      // pointer interactions
      submitBtn.addEventListener('mousedown', () => submitBtn.classList.add('is-pressed'));
      document.addEventListener('mouseup', () => submitBtn.classList.remove('is-pressed'));
      submitBtn.addEventListener('touchstart', () => submitBtn.classList.add('is-pressed'), {passive: true});
      document.addEventListener('touchend', () => submitBtn.classList.remove('is-pressed'));

      // keyboard: show pressed while Space or Enter is down
      submitBtn.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') submitBtn.classList.add('is-pressed');
      });
      submitBtn.addEventListener('keyup', (ev) => {
        if (ev.key === ' ' || ev.key === 'Enter') submitBtn.classList.remove('is-pressed');
      });
    }
  } catch (e) {
    // ignore if any event wiring fails
  }

  // Efek ripple pada tombol/tautan: handler klik yang didelegasikan membuat elemen .ripple sementara.
  // Berlaku untuk .btn, .btn-pill, .btn-contact dan tautan navigasi header.
  try {
    document.addEventListener('click', (ev) => {
      const trigger = ev.target.closest('.btn, .btn-pill, .btn-contact, .nav-links a');
      if (!trigger) return;

      // don't create ripple for disabled buttons
      if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;

      const rect = trigger.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.4;
      const x = (ev.clientX || (rect.left + rect.width/2)) - rect.left - size / 2;
      const y = (ev.clientY || (rect.top + rect.height/2)) - rect.top - size / 2;

      const span = document.createElement('span');
      span.className = 'ripple';
      // Use darker ripple when button has light background (heuristic)
      const bg = window.getComputedStyle(trigger).backgroundColor || '';
      if (/rgba?\(.*\d+\,.*\d+\,.*\d+\,?\s*(0?\.?[0-9]+)?\)/.test(bg)) {
        // noop: keep default
      }
      // if the trigger currently has cyan background (hover state), use darker ripple
      if (bg && bg.indexOf('rgb(0, 209, 255)') !== -1) span.classList.add('ripple-dark');

      span.style.width = span.style.height = size + 'px';
      span.style.left = x + 'px';
      span.style.top = y + 'px';
      trigger.appendChild(span);
      span.addEventListener('animationend', () => {
        try { span.remove(); } catch (e) {}
      });
    }, {passive: true});
  } catch (e) {
    // ignore ripple wiring errors
  }
}

// Bungkus kata kedua pada .page-title dalam span.accent agar mendapatkan aksen cyan otomatis
document.addEventListener('DOMContentLoaded', () => {
  try {
    const titles = document.querySelectorAll('.page-title');
    titles.forEach(el => {
      // don't touch if it already contains HTML
      if (!el) return;
      const raw = el.textContent.trim();
      if (!raw) return;
      // If there's already a span.accent present via server markup, skip
      if (el.querySelector && el.querySelector('.accent')) return;

      const parts = raw.split(/\s+/);
      if (parts.length < 2) return;
      // Wrap only the second word
      parts[1] = `<span class="accent">${parts[1]}</span>`;
      el.innerHTML = parts.join(' ');
    });
  } catch (e) {
    // harmless fallback: don't break the page if something goes wrong
    // console.debug('page-title accent script failed', e);
  }
});

// Tandai tautan navigasi aktif berdasarkan pathname saat ini
document.addEventListener('DOMContentLoaded', () => {
  try {
    const navLinks = document.querySelectorAll('.nav-links a');
    if (!navLinks || navLinks.length === 0) return;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    navLinks.forEach(a => {
      const href = (a.getAttribute('href') || '').replace(/\/+$/, '') || '/';
      if (href === path || (href !== '/' && path.startsWith(href))) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  } catch (err) {
    // ignore
  }
});

// Help page behaviors: FAQ animation and chat modal wiring
document.addEventListener('DOMContentLoaded', () => {
  try {
  // FAQ: animasikan buka & tutup secara andal menggunakan event click pada summary
  // Pendekatan ini mencegah perilaku collapse instan yang mungkin terjadi
  // pada toggle <details> bawaan dan memastikan transisi max-height
  // berjalan pada interaksi pertama.
    const details = document.querySelectorAll('.faq details');
  // fungsi pembantu untuk menganimasikan penutupan elemen details
    const closeDetail = (el) => {
      const b = el.querySelector('.detail-body');
      const s = el.querySelector('summary');
      if (!b) return;
      // set explicit height then animate to zero
      b.style.maxHeight = b.scrollHeight + 'px';
      b.style.opacity = '1';
      // force layout
      // eslint-disable-next-line no-unused-expressions
      b.offsetHeight;
      requestAnimationFrame(() => {
        b.style.maxHeight = '0px';
        b.style.opacity = '0';
      });
      const onEnd = (ev) => {
        if (ev.propertyName === 'max-height') {
          el.open = false;
          if (s) s.setAttribute('aria-expanded', 'false');
          b.removeEventListener('transitionend', onEnd);
        }
      };
      b.addEventListener('transitionend', onEnd);
    };

    details.forEach(d => {
      const body = d.querySelector('.detail-body');
      const summary = d.querySelector('summary');
      if (!body || !summary) return;

  // sisipkan SVG chevron jika belum ada untuk rendering yang lebih tajam
      if (!summary.querySelector('.chev')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('chev');
        // slightly thicker stroke for crisper appearance
        svg.innerHTML = '<path d="M6.5 9.5 L12 14.5 L17.5 9.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>';
        summary.appendChild(svg);
      }

  // setel state ARIA yang sesuai pada awalnya
      summary.setAttribute('aria-expanded', d.hasAttribute('open') ? 'true' : 'false');
      // Ensure there's a polite live region for announcements
      let live = document.getElementById('faq-live');
      if (!live) {
        live = document.createElement('div');
        live.id = 'faq-live';
        live.className = 'visually-hidden';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        document.body.appendChild(live);
      }
      summary.setAttribute('role', 'button');

  // Inisialisasi state: tertutup -> maxHeight 0, terbuka -> tinggi terukur
      if (d.hasAttribute('open')) {
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.opacity = '1';
      } else {
        body.style.maxHeight = '0px';
        body.style.opacity = '0';
      }

  // Tangani klik pada summary untuk menganimasikan buka/tutup
      summary.addEventListener('click', (ev) => {
        ev.preventDefault(); // we will toggle manually to control timing

        if (!d.open) {
          // close any other open details (accordion behavior)
          details.forEach(other => {
            if (other !== d && other.open) {
              const otherSummary = other.querySelector('summary');
              if (otherSummary) otherSummary.setAttribute('aria-expanded', 'false');
              closeDetail(other);
              // announce closure
              const otherSummaryText = other.querySelector('summary') ? other.querySelector('summary').textContent.trim() : '';
              if (otherSummaryText) live.textContent = `Ditutup: ${otherSummaryText}`;
            }
          });

          // Opening: set the open attribute then animate to measured height
          d.open = true;
          summary.setAttribute('aria-expanded', 'true');
          requestAnimationFrame(() => {
            body.style.maxHeight = body.scrollHeight + 'px';
            body.style.opacity = '1';
          });
          // announce opening for screen readers
          const openText = summary.textContent ? summary.textContent.trim() : '';
          if (openText) live.textContent = `Terbuka: ${openText}`;
        } else {
          // Closing current
          summary.setAttribute('aria-expanded', 'false');
          const closeText = summary.textContent ? summary.textContent.trim() : '';
          closeDetail(d);
          if (closeText) live.textContent = `Ditutup: ${closeText}`;
        }
      });
      
  // izinkan Enter/Space untuk toggle saat summary terfokus
      summary.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          summary.click();
        }
      });
    });

    // Live chat removed: no wiring required
  } catch (e) {
    // ignore
  }
});