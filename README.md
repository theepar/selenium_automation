# SocialVit Web Automation

Platform otomasi pengujian Web **End-to-End (E2E)** yang dibangun menggunakan **Next.js 15**, **TypeScript**, dan **Selenium WebDriver**. Aplikasi ini dirancang khusus untuk mensimulasikan perjalanan pengguna (User Journey) yang paling kritikal di platform **SocialVit**, mulai dari registrasi akun baru hingga berpartisipasi dalam event komunitas dan loker.

Aplikasi ini tidak lagi berjalan sebagai *crawler* buta, melainkan difokuskan untuk menjalankan 3 Skenario BDD (*Behavior-Driven Development*) terstruktur. Seluruh log pergerakan robot akan disiarkan langsung (SSE) ke UI, dilengkapi tangkapan layar di setiap tahapan, dan perekaman sesi test penuh berbasis gdigrab/ffmpeg.

---

## 🚀 6 Skenario Flow Utama

Sistem ini mendukung 6 skenario BDD (*Behavior-Driven Development*) terstruktur yang mencakup kasus positif dan negatif:

### 1. Flow Register
- **Skenario 1: Kasus Positif (`register`)**: Menguji pendaftaran akun baru dengan data unik. Robot mengisi form dan memverifikasi keberhasilan navigasi ke dashboard.
- **Skenario 2: Kasus Negatif (`register_error`)**: Menguji ketahanan validasi sistem dengan memasukkan password yang terlalu pendek. Robot memverifikasi bahwa pesan error muncul.

### 2. Flow Apply Class
- **Skenario 3: Kasus Positif (`applyClass`)**: Menguji alur pendaftaran kelas. Robot memilih kelas dari katalog, masuk ke detail, dan mengeklik tombol daftar hingga mencapai tahap pembayaran/konfirmasi.
- **Skenario 4: Kasus Negatif (`applyClass_error`)**: Menguji proteksi akses kelas. Robot mencoba mendaftar tanpa login dan memverifikasi sistem melakukan redirect ke halaman login atau menampilkan peringatan.

### 3. Flow Job Vacancy
- **Skenario 5: Kasus Positif (`jobVacancy`)**: Menguji fitur karir. Robot melakukan filter tipe pekerjaan "Full Time", membuka detail lowongan, dan mengeklik tombol lamar hingga muncul formulir aplikasi.
- **Skenario 6: Kasus Negatif (`jobVacancy_error`)**: Menguji penanganan kondisi error/kosong pada lowongan. Robot memverifikasi pesan "Lowongan tidak ditemukan" atau kewajiban login saat melamar.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| User Interface | Next.js 15 (App Router, Turbopack) & Tailwind CSS v4 |
| Engine | TypeScript 5 |
| Driver Otomasi | Selenium WebDriver 4 dengan Persistent Chrome |
| Screen Recording | ffmpeg-static (GDI Grab) |

---

## ⚙️ Persyaratan Sistem

- **Node.js** v20 LTS ke atas.
- **Google Chrome** atau **Brave Browser** — Script telah dioptimalkan untuk memprioritaskan profil lokal `.chrome_profile` sehingga status *Login Default* otomatis terus tersimpan melampaui antar-sesi tes.
- **Sistem Operasi** — Fitur screen recorder sementara dikonfigurasikan menggunakan input API Windows GDI (`gdigrab`). Penggunaan di atas Linux/Mac perlu mengubah args `ffmpeg` di `lib/recorder.ts`.

---

## 🏁 Memulai Test (Getting Started)

1. Lakukan instalasi seluruh *dependencies* pendukung:
   ```bash
   npm install
   ```
2. Jalankan aplikasi menggunakan mode lokal turbopack:
   ```bash
   npm run dev
   ```
3. Akses laman dasbor kontrol otomasi di [http://localhost:3000](http://localhost:3000)
4. Pastikan browser anda di-login-kan secara manual pada SocialVit terlebih dahulu pada tes putaran pertama (*Sistem akan mengingat sesi login di test ke-2 dan seterusnya*).
5. Pilih salah satu model flow **Register**, **Apply Class**, atau **Job Vacancy** pada dropdown panel sebelah kiri.
6. Pantau **Log Terminal SSE** menyala dan amati robot bekerja menyelesaikan target-target BDD secara *Real-time*. Hasil tangkapan layar/video akan otomatis terbit begitu tes rampung.
