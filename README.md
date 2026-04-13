# SocialVit Web Automation

Platform otomasi pengujian Web **End-to-End (E2E)** yang dibangun menggunakan **Next.js 15**, **TypeScript**, dan **Selenium WebDriver**. Aplikasi ini dirancang khusus untuk mensimulasikan perjalanan pengguna (User Journey) yang paling kritikal di platform **SocialVit**, mulai dari registrasi akun baru hingga berpartisipasi dalam event komunitas dan loker.

Aplikasi ini tidak lagi berjalan sebagai *crawler* buta, melainkan difokuskan untuk menjalankan 3 Skenario BDD (*Behavior-Driven Development*) terstruktur. Seluruh log pergerakan robot akan disiarkan langsung (SSE) ke UI, dilengkapi tangkapan layar di setiap tahapan, dan perekaman sesi test penuh berbasis gdigrab/ffmpeg.

---

## 🚀 3 Fitur Flow Utama

### 1. Flow Register (`register`)
**Tujuan:** Menguji keandalan *entry point* pengguna perdana.
- Robot akan mengarahkan browser ke halaman Register (`/auth/register`).
- Melakukan pengisian data profil secara utuh (Nama Lengkap, Email test generate, Password).
- Mengeklik submit, dan mendeteksi berbagai jenis peringatan validasi (misal: *Email Already Exists*) maupun kesuksesan navigasi pasca-daftar.

### 2. Flow Apply Class (`applyClass`)
**Tujuan:** Menguji kelancaran konversi ekosistem *Learning & Community*.
- Bergerak menuju panggung `/app/learning/community` atau area kelas.
- Pemindaian algoritma pintar untuk mengenali spesifik bagian interior *Class Card* (teks *'Materi'* atau *'Harga'*) untuk mencegah misklik pada Sidebar Navigation.
- Menekan tombol **Daftar** pada *Overview/Detail Class* secara proaktif.
- **Auto-Stop Safely:** Jika diarahkan ke fase Pembayaran/Payment Dropoff, skrip akan memberi validasi `PASS` dan menghentikan diri. Ini memastikan database asli tidak disusupi oleh pembelian kelas palsu.

### 3. Flow Job Vacancy (`jobVacancy`)
**Tujuan:** Mengetes navigasi fitur Karir dan Loker spesifik.
- Robot akan mendarat di `/app/growth/job-vacancy` dan membuka menu sidebar filter melalui ikon *Blue Hamburger (Garis 3)*.
- Memproses *event bubbling* pada Radio Button untuk menyaring lowongan khusus pekerja **Full Time**.
- Memilih lowongan teratas, memicu navigasi *New Tab Detail Page*, dan mengeklik tombol "Lamar" (Apply).
- **Safe Evaluation:** Robot membuka wujud formulir modal lamaran / cover letter, memverifikasinya, namun berhenti sebelum menekan `Kirim Lamaran` agar perusahaan afiliasi tidak dibombardir data bodong.

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
