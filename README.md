# NexusAuto

NexusAuto adalah platform otomasi QA berbasis web yang dirancang untuk melakukan pengujian end-to-end secara otomatis. Dibangun menggunakan Next.js 15, Tailwind CSS v4, dan ditenagai oleh performa Selenium WebDriver.

## Fitur Utama

- Auto-fill Pintar: Otomatis mendeteksi tipe input (email, password, teks, angka, tanggal, dll) dan mengisinya dengan dummy data yang relevan. Tersedia juga opsi untuk memasukkan kredensial kustom jika dibutuhkan.
- Auto-klik Tombol: Mendeteksi dan melakukan klik pada semua tombol aksi, tombol submit, dan navigasi yang aktif.
- Deep Crawling: Tidak hanya menguji satu halaman, NexusAuto akan mencari semua internal link dalam satu domain dan menelusurinya hingga kedalaman maksimal 4 halaman.
- Progressive Scrolling: Melakukan scroll otomatis ke bawah halaman untuk memicu semua elemen lazy-load sebelum melakukan interaksi.
- Tangkapan Layar Otomatis: Mengambil gambar layar pada berbagai tahapan progres (saat halaman dimuat dan sesudah form diisi penuh). Gambar yang lama akan otomatis dibersihkan pada iterasi pengujian berikutnya.
- Intervensi Manual OAuth: Otomatis menghentikan sementara proses otomatisasi selama 30 detik saat mendeteksi halaman login seperti Google OAuth, memberikan waktu bagi pengguna untuk login secara manual.
- Log Real-time: Memanfaatkan Server-Sent Events (SSE) yang ringan untuk mendistribusikan log status ke antarmuka secara langsung.

## Tech Stack

- Framework: Next.js 15 (App Router, Turbopack)
- Styling: Tailwind CSS v4
- Otomasi Web: Selenium WebDriver dengan Selenium Manager
- UI Icons: Lucide React
- Bahasa: TypeScript

## Instalasi dan Persiapan

Pastikan kamu memiliki Node.js terinstal (minimal versi LTS/v20) serta browser Google Chrome. Tidak perlu menginstal ChromeDriver secara manual karena Selenium Manager sudah mengatasinya secara otomatis.

1. Clone repositori ini atau masuk ke root direktori
2. Instal dependencies:
   ```bash
   npm install
   ```
3. Mulai development server:
   ```bash
   npm run dev
   ```
4. Buka di browser: `http://localhost:3000` (atau port lain yang ditampilkan di terminal jika 3000 sedang terpakai).

## Cara Penggunaan

1. Ketik URL target pengujian pada kolom input (misal: `https://example.com`). Pastikan URL valid diawali dengan `http://` atau `https://`.
2. Jika perlu login, kamu bisa mengisi bagian Custom Login Credentials. Kredensial ini hanya diteruskan ke instance Selenium lokal dan tidak pernah disimpan.
3. Klik tombol Run Test.
4. Perhatikan panel log terminal untuk melihat proses yang sedang berjalan secara live.
5. Jika otomatisasi menemukan halaman OAuth (seperti akun Google), proses akan jeda selama 30 detik agar kamu bisa menyelesaikan login secara manual di browser yang terbuka.
6. Setelah selesai, cek Results Gallery untuk melihat rangkuman hasil dan tangkapan layar dari proses pengujian.

## Struktur Proyek

```text
web-automation/
├── app/                  # Route Next.js, layout utama, dan antarmuka
│   ├── globals.css       # Konfigurasi Tailwind dan styling global
│   └── api/run-test/     # Endpoint SSE untuk streaming log Selenium
├── components/           # Komponen UI modular
├── lib/
│   └── automator.ts      # Inti logika Selenium WebDriver
├── public/
│   └── screenshots/      # Lokasi penyimpanan hasil tangkapan layar (dibersihkan otomatis)
├── types/
│   └── index.ts          # Definisi tipe TypeScript
└── package.json          # Konfigurasi dependensi proyek
```
