# 🚀 WhatsApp Gateway Multi-Bot Control Panel

Panel kontrol WhatsApp Gateway berbasis web dengan fitur multi-session bot, QR login, blast massal, dan auto-rotasi bot.

## ✨ Fitur

- **Multi-Session Bot** — Tambah bot WhatsApp tanpa batas
- **QR Login via Web** — Scan QR langsung dari browser
- **Blast Massal** — Kirim pesan ke ratusan nomor dengan auto-rotasi bot
- **Load Balancing** — Pesan dibagi rata ke semua bot aktif
- **Auto Reconnect** — Bot otomatis reconnect jika terputus
- **Control Panel** — Aktifkan/matikan/hapus bot dari UI
- **Health Check** — Endpoint `/health` untuk monitoring Railway

---

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **WhatsApp**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **QR Generator**: qrcode
- **Logger**: pino

---

## 🚀 Deploy ke Railway (Rekomendasi)

### Cara 1: Deploy via GitHub

1. **Push ke GitHub** (ikuti langkah di bawah)
2. Buka [railway.app](https://railway.app) → **New Project**
3. Pilih **Deploy from GitHub repo**
4. Pilih repo ini → Railway otomatis detect dan deploy
5. Set environment variable jika perlu (lihat bagian Environment Variables)
6. Akses via URL Railway yang diberikan

### Cara 2: Deploy via Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## 💻 Cara Push ke GitHub

```bash
# 1. Init git (jika belum)
git init

# 2. Add semua file
git add .

# 3. Commit pertama
git commit -m "feat: initial WhatsApp Gateway multi-bot panel"

# 4. Buat repo baru di github.com, lalu hubungkan:
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# 5. Push
git branch -M main
git push -u origin main
```

---

## 🏠 Jalankan Lokal

```bash
# Install dependencies
npm install

# Jalankan server
npm start

# Development mode (auto-reload)
npm run dev
```

Buka browser: `http://localhost:3000`

---

## 🌍 Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | Port server (Railway auto-set) |
| `SESSION_DIR` | `./sessions` | Folder penyimpanan sesi bot |

> ⚠️ **Penting**: Di Railway, data di `/sessions` akan **terhapus saat restart** karena Railway menggunakan ephemeral storage. Gunakan **Railway Volume** untuk sesi permanen.

---

## 📁 Struktur File

```
wa-gateway/
├── index.js          # Server utama
├── package.json      # Dependensi Node.js
├── railway.toml      # Konfigurasi Railway
├── Procfile          # Process file
├── .gitignore        # File yang diabaikan git
├── .env.example      # Contoh environment variables
├── README.md         # Dokumentasi ini
└── sessions/         # Folder sesi bot (auto-dibuat, tidak di-commit)
```

---

## ⚠️ Disclaimer

Gunakan tools ini secara bertanggung jawab dan sesuai dengan Terms of Service WhatsApp. Penggunaan untuk spam, penipuan, atau aktivitas ilegal sepenuhnya menjadi tanggung jawab pengguna.

---

## 📡 API Endpoints

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/` | Dashboard web |
| `GET` | `/health` | Health check |
| `POST` | `/api/bot/add` | Tambah bot baru |
| `GET` | `/api/bot/status/:botId` | Status & QR bot |
| `GET` | `/api/bot/list` | List semua bot |
| `POST` | `/api/bot/toggle` | ON/OFF bot |
| `POST` | `/api/bot/delete` | Hapus bot |
| `POST` | `/api/blast` | Kirim pesan massal |
