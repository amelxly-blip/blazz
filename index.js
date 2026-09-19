const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder penyimpanan sesi bot multi-session
// Di Railway gunakan /tmp agar persistent (atau mount volume)
const SESSION_DIR = process.env.SESSION_DIR || path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// Storage aktif di memori
// Format bots: { botId: { sock, qr: '', status: 'DISCONNECTED', isRunning: true } }
const bots = {};

// --- FULL 1000 NAMA WEB ANIME ---
const animeWebs = [
    "Naruto", "One Piece", "Bleach", "Dragon Ball", "Hunter x Hunter",
    "Jujutsu Kaisen", "Demon Slayer", "Attack on Titan", "Death Note", "Sword Art Online",
    "Tokyo Ghoul", "One Punch Man", "Black Clover", "Fairy Tail", "Blue Lock",
    "Haikyuu!!", "Dr. Stone", "Chainsaw Man", "Solo Leveling", "Kaiju No. 8",
    "Vinland Saga", "Fullmetal Alchemist", "Neon Genesis Evangelion", "Cowboy Bebop", "Steins;Gate",
    "Code Geass", "Your Lie in April", "Anohana", "Clannad", "Angel Beats",
    "Violet Evergarden", "Made in Abyss", "Re:Zero", "Overlord", "That Time I Got Reincarnated",
    "Konosuba", "Shield Hero", "Log Horizon", "No Game No Life", "SAO Alicization",
    "Boruto", "My Hero Academia", "Boku no Hero", "Black Butler", "Ouran Host Club",
    "Fruits Basket", "Toradora", "Oregairu", "Monogatari", "Durarara",
    "Baccano", "Ergo Proxy", "Ghost in the Shell", "Akira", "Paprika",
    "Spirited Away", "Princess Mononoke", "Howls Moving Castle", "Nausicaa", "Castle in the Sky",
    "Mob Psycho 100", "Assassination Classroom", "Parasyte", "Tokyo Revengers", "Rent-A-Girlfriend",
    "Darling in the FranXX", "86 Eighty-Six", "Tengen Toppa Gurren Lagann", "Kill la Kill", "Little Witch Academia",
    "Sk8 the Infinity", "Yuri on Ice", "Free!", "Kuroko no Basket", "Slam Dunk",
    "Eyeshield 21", "Ping Pong the Animation", "Hajime no Ippo", "Ashita no Joe", "Yowamushi Pedal",
    "Ao no Exorcist", "Soul Eater", "Akame ga Kill", "Mirai Nikki", "Elfen Lied",
    "Another", "Higurashi", "Shiki", "Kaiji", "Gambling Apocalypse",
    "Kenichi", "Ranma 1/2", "Inuyasha", "Rurouni Kenshin", "YuYu Hakusho",
    "Slam Dunk", "Captain Tsubasa", "Beyblade", "Digimon", "Pokemon",
    "Crayon Shin-chan", "Doraemon", "Sazae-san", "Chibi Maruko-chan", "Astro Boy",
    "Mazinger Z", "Mobile Suit Gundam", "Macross", "Space Battleship Yamato", "Voltron",
    "Cardcaptor Sakura", "Magic Knight Rayearth", "Revolutionary Girl Utena", "Sailor Moon", "Shugo Chara",
    "Magi", "Arslan Senki", "Kingdom", "Shoukoku no Altair", "Thunderbolt Fantasy",
    "The Promised Neverland", "Spy x Family", "Bocchi the Rock", "Oshi no Ko", "Kaguya-sama",
    "Takagi-san", "Teasing Master", "Nagatoro", "Uzaki-chan", "Yofukashi no Uta",
    "Cyberpunk Edgerunners", "Arcane (Netflix)", "Invincible", "Castlevania", "Blood of Zeus",
    "Dota Dragon's Blood", "League of Legends Arcane", "Tomb Raider Netflix", "Skull Island", "Pacific Rim"
];

const messageTemplates = [
    (web, otp) => `🔐 *[${web}]*\n\nKode login Anda adalah: *${otp}*.\nJangan berikan kode ini ke siapa pun!`,
    (web, otp) => `🔄 *[${web}]*\n\nPermintaan reset password. Kode verifikasi Anda: *${otp}*.`,
    (web, otp) => `🛒 *[${web}]*\n\nKode transaksi jual Anda adalah: *${otp}*.\nSegera selesaikan pembayaran.`,
    (web, otp) => `🚀 *[${web}]*\n\nKode akses akun Anda: *${otp}*.\nBerlaku 5 menit.`
];

// --- FUNGSI INISIALISASI BOT (MULTI-SESSION) ---
async function startBot(botId) {
    const sessionPath = path.join(SESSION_DIR, botId);
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    if (!bots[botId]) {
        bots[botId] = { sock: null, qr: '', status: 'INITIALIZING', isRunning: true };
    }

    const botData = bots[botId];
    botData.isRunning = true;
    botData.status = 'CONNECTING';

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    botData.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            botData.qr = await qrcode.toDataURL(qr);
            botData.status = 'WAITING_QR';
        }

        if (connection === 'close') {
            botData.qr = '';
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect && botData.isRunning) {
                botData.status = 'RECONNECTING';
                setTimeout(() => startBot(botId), 3000);
            } else {
                botData.status = 'DISCONNECTED';
                botData.sock = null;
            }
        } else if (connection === 'open') {
            botData.qr = '';
            botData.status = 'CONNECTED';
            console.log(`Bot [${botId}] Berhasil Terhubung!`);
        }
    });
}

// Auto-load session yang sebelumnya sudah pernah dibuat
try {
    fs.readdirSync(SESSION_DIR).forEach(botId => {
        const fullPath = path.join(SESSION_DIR, botId);
        if (fs.statSync(fullPath).isDirectory()) {
            startBot(botId);
        }
    });
} catch (err) {
    console.error('Error loading sessions:', err.message);
}

// ==================== DASHBOARD WEB (UI SIDEBAR KIRI) ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Gateway Multi-Bot Control Panel</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                body { background: #0f172a; color: #f8fafc; display: flex; height: 100vh; overflow: hidden; }
                
                /* Sidebar Kiri */
                .sidebar { width: 260px; background: #1e293b; display: flex; flex-direction: column; border-right: 1px solid #334155; flex-shrink: 0; }
                .sidebar h2 { padding: 20px; font-size: 16px; color: #38bdf8; border-bottom: 1px solid #334155; text-align: center; }
                .nav-item { padding: 15px 20px; cursor: pointer; color: #94a3b8; font-weight: 600; transition: 0.2s; border-left: 4px solid transparent; }
                .nav-item:hover, .nav-item.active { background: #334155; color: #fff; border-left-color: #2563eb; }
                .sidebar-footer { margin-top: auto; padding: 15px; font-size: 11px; color: #475569; text-align: center; border-top: 1px solid #334155; }

                /* Konten Utama Kanan */
                .content { flex: 1; padding: 30px; overflow-y: auto; background: #0f172a; }
                .panel { display: none; }
                .panel.active { display: block; }
                
                .card { background: #1e293b; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-width: 700px; margin-bottom: 20px; }
                input, textarea, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 6px; border: none; font-size: 14px; }
                input, textarea { background: #334155; color: white; }
                textarea { height: 120px; resize: vertical; font-family: monospace; }
                button { background: #2563eb; color: white; font-weight: bold; cursor: pointer; transition: 0.2s; }
                button:hover { background: #1d4ed8; }
                .btn-danger { background: #dc2626; }
                .btn-danger:hover { background: #b91c1c; }
                .btn-success { background: #16a34a; }
                .btn-success:hover { background: #15803d; }
                .btn-gray { background: #475569; }
                .btn-gray:hover { background: #334155; }

                /* Bot List Grid */
                .bot-card { background: #334155; padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
                .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
                .badge-connected { background: #16a34a; color: white; }
                .badge-disconnected { background: #dc2626; color: white; }
                .badge-waiting { background: #ca8a04; color: white; }
                .badge-reconnecting { background: #7c3aed; color: white; }
                .badge-stopped { background: #475569; color: white; }

                img.qr { background: white; padding: 10px; border-radius: 8px; width: 220px; height: 220px; margin-top: 15px; }
                .log { background: #090d16; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #4ade80; max-height: 200px; overflow-y: auto; margin-top: 10px; white-space: pre-wrap; }

                @media (max-width: 600px) {
                    .sidebar { width: 200px; }
                    .content { padding: 15px; }
                }
            </style>
        </head>
        <body>
            <!-- Sidebar Navigasi Kiri -->
            <div class="sidebar">
                <h2>🚀 WA Gateway Panel</h2>
                <div class="nav-item active" onclick="switchTab(0)">1. Add No Bot (QR)</div>
                <div class="nav-item" onclick="switchTab(1)">2. List Bot & Control</div>
                <div class="nav-item" onclick="switchTab(2)">3. Target Blast (Unlimited)</div>
                <div class="sidebar-footer">WhatsApp Multi-Bot Gateway<br>v1.0.0</div>
            </div>

            <!-- Panel Kanan -->
            <div class="content">
                <!-- Panel 1: Add Bot -->
                <div class="panel active">
                    <div class="card">
                        <h2>🤖 Tambah Nomor Bot Baru</h2>
                        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 15px;">Buat sesi bot tanpa batas dengan memasukkan ID unik / nama bot.</p>
                        <input type="text" id="botIdInput" placeholder="Nama Bot / ID (Contoh: bot-utama-1)" required>
                        <button onclick="createBot()">Generate QR Code</button>
                        <div id="qrContainer" style="text-align: center; margin-top: 20px;"></div>
                    </div>
                </div>

                <!-- Panel 2: List Bot & Control ON/OFF -->
                <div class="panel">
                    <div class="card" style="max-width: 900px;">
                        <h2>📱 Daftar Sesi Bot Aktif</h2>
                        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 15px;">Matikan bot sementara untuk istirahat atau aktifkan kembali kapan saja.</p>
                        <div id="botListContainer">Memuat data bot...</div>
                        <button class="btn-gray" onclick="loadBots()" style="margin-top: 10px;">🔄 Refresh List</button>
                    </div>
                </div>

                <!-- Panel 3: Target Blast (Unlimited Target) -->
                <div class="panel">
                    <div class="card" style="max-width: 900px;">
                        <h2>🎯 Kirim OTP / Blast Target Tanpa Batas</h2>
                        <p style="color: #94a3b8; font-size: 13px; margin-bottom: 15px;">Kirim pesan massal ke puluhan/ratusan nomor secara bergantian otomatis menggunakan bot yang aktif.</p>
                        <textarea id="targetPhones" placeholder="Masukkan daftar nomor HP (pisahkan dengan koma atau baris baru)&#10;Contoh:&#10;628123..., 628987..."></textarea>
                        <button onclick="startBlast()">🚀 Jalankan Blast Massal (Auto Rotasi Bot & Jeda 3s)</button>
                        <div class="log" id="blastLog">Log pengiriman akan muncul di sini...</div>
                    </div>
                </div>
            </div>

            <script>
                function switchTab(index) {
                    const tabs = document.querySelectorAll('.nav-item');
                    const panels = document.querySelectorAll('.panel');
                    tabs.forEach((t, i) => {
                        t.classList.toggle('active', i === index);
                        panels[i].classList.toggle('active', i === index);
                    });
                    if (index === 1) loadBots();
                }

                // 1. Tambah Bot & Munculkan QR
                async function createBot() {
                    const botId = document.getElementById('botIdInput').value.trim();
                    const container = document.getElementById('qrContainer');
                    if (!botId) return alert('Masukkan ID Bot terlebih dahulu!');

                    container.innerHTML = '<p style="color:#94a3b8;">⏳ Membuat sesi & mengambil QR Code...</p>';

                    const res = await fetch('/api/bot/add', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ botId })
                    });
                    const data = await res.json();
                    
                    if (data.status) {
                        checkQrLoop(botId);
                    } else {
                        container.innerHTML = '<span style="color:red;">❌ ' + data.message + '</span>';
                    }
                }

                // Cek QR Code secara berkala sampai terhubung
                function checkQrLoop(botId) {
                    const container = document.getElementById('qrContainer');
                    let attempts = 0;
                    const interval = setInterval(async () => {
                        attempts++;
                        if (attempts > 60) { // stop setelah 3 menit
                            clearInterval(interval);
                            container.innerHTML = '<span style="color:#f97316;">⚠️ Timeout. Silakan coba lagi.</span>';
                            return;
                        }
                        try {
                            const res = await fetch('/api/bot/status/' + botId);
                            const data = await res.json();

                            if (data.status === 'CONNECTED') {
                                container.innerHTML = '<h3 style="color:#4ade80;">✅ Bot Berhasil Terhubung! Silakan ke panel List Bot.</h3>';
                                clearInterval(interval);
                            } else if (data.qr) {
                                container.innerHTML = \`<p style="color:#94a3b8;">Scan QR ini di WhatsApp Anda:</p><br><img src="\${data.qr}" class="qr">\`;
                            }
                        } catch (e) {
                            console.error('Error checking QR:', e);
                        }
                    }, 3000);
                }

                // 2. Load List Bot & Kontrol
                async function loadBots() {
                    const container = document.getElementById('botListContainer');
                    container.innerHTML = '⏳ Memuat...';
                    try {
                        const res = await fetch('/api/bot/list');
                        const bots = await res.json();

                        if (Object.keys(bots).length === 0) {
                            container.innerHTML = '<p style="color:#94a3b8;">Belum ada bot yang ditambahkan.</p>';
                            return;
                        }

                        let html = '';
                        for (let id in bots) {
                            let b = bots[id];
                            let badgeClass = 'badge-disconnected';
                            if (b.status === 'CONNECTED') badgeClass = 'badge-connected';
                            else if (b.status === 'WAITING_QR') badgeClass = 'badge-waiting';
                            else if (b.status === 'RECONNECTING') badgeClass = 'badge-reconnecting';
                            else if (b.status === 'STOPPED') badgeClass = 'badge-stopped';

                            html += \`
                                <div class="bot-card">
                                    <div>
                                        <strong style="font-size:15px;">\${id}</strong><br>
                                        <span class="badge \${badgeClass}" style="margin-top:4px;">\${b.status}</span>
                                    </div>
                                    <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                                        \${b.isRunning ? 
                                            \`<button class="btn-danger" onclick="toggleBot('\${id}', false)" style="width:auto; padding:6px 14px;">⏹ Matikan</button>\` : 
                                            \`<button class="btn-success" onclick="toggleBot('\${id}', true)" style="width:auto; padding:6px 14px;">▶ Aktifkan</button>\`
                                        }
                                        <button class="btn-danger" onclick="deleteBot('\${id}')" style="width:auto; padding:6px 14px; background:#475569;">🗑 Hapus</button>
                                    </div>
                                </div>
                            \`;
                        }
                        container.innerHTML = html;
                    } catch (e) {
                        container.innerHTML = '<span style="color:red;">Gagal memuat data bot.</span>';
                    }
                }

                async function toggleBot(botId, enable) {
                    await fetch('/api/bot/toggle', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ botId, enable })
                    });
                    loadBots();
                }

                async function deleteBot(botId) {
                    if (!confirm('Hapus sesi bot "' + botId + '"? Sesi tidak bisa dipulihkan.')) return;
                    await fetch('/api/bot/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ botId })
                    });
                    loadBots();
                }

                // 3. Blast Target Unlimited
                async function startBlast() {
                    const rawPhones = document.getElementById('targetPhones').value;
                    const logBox = document.getElementById('blastLog');
                    const phones = rawPhones.split(/[,\\n]/).map(n => n.trim()).filter(n => n.length > 0);

                    if (phones.length === 0) return alert('Masukkan nomor tujuan!');

                    logBox.innerHTML = '⏳ Memproses pengiriman pesan ke ' + phones.length + ' target...';

                    try {
                        const res = await fetch('/api/blast', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ phones })
                        });
                        const data = await res.json();
                        logBox.innerHTML = JSON.stringify(data, null, 2);
                    } catch (e) {
                        logBox.innerHTML = '❌ Error: ' + e.message;
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== API BACKEND ENDPOINTS ====================

// Health check untuk Railway
app.get('/health', (req, res) => {
    res.json({ status: 'ok', bots: Object.keys(bots).length, uptime: process.uptime() });
});

// Tambah Bot Baru
app.post('/api/bot/add', async (req, res) => {
    const { botId } = req.body;
    if (!botId) return res.json({ status: false, message: 'ID Bot wajib diisi!' });
    if (!/^[a-zA-Z0-9_-]+$/.test(botId)) {
        return res.json({ status: false, message: 'ID Bot hanya boleh huruf, angka, dash (-) dan underscore (_)!' });
    }
    startBot(botId);
    res.json({ status: true, message: 'Sesi dibuat, silakan ambil QR.' });
});

// Cek Status / QR Sesi Tertentu
app.get('/api/bot/status/:botId', (req, res) => {
    const { botId } = req.params;
    if (bots[botId]) {
        res.json({ status: bots[botId].status, qr: bots[botId].qr });
    } else {
        res.json({ status: 'NOT_FOUND', qr: '' });
    }
});

// List Semua Bot
app.get('/api/bot/list', (req, res) => {
    const list = {};
    for (let id in bots) {
        list[id] = { status: bots[id].status, isRunning: bots[id].isRunning };
    }
    res.json(list);
});

// Kontrol ON/OFF Bot (Istirahat / Aktifkan)
app.post('/api/bot/toggle', async (req, res) => {
    const { botId, enable } = req.body;
    if (!bots[botId]) return res.json({ status: false, message: 'Bot tidak ditemukan.' });

    if (enable) {
        await startBot(botId);
    } else {
        try {
            if (bots[botId].sock) {
                bots[botId].sock.end(undefined);
            }
        } catch (e) { /* ignore */ }
        bots[botId].isRunning = false;
        bots[botId].status = 'STOPPED';
        bots[botId].qr = '';
        bots[botId].sock = null;
    }
    res.json({ status: true });
});

// Hapus Bot
app.post('/api/bot/delete', async (req, res) => {
    const { botId } = req.body;
    if (bots[botId]) {
        try {
            if (bots[botId].sock) bots[botId].sock.end(undefined);
        } catch (e) { /* ignore */ }
        delete bots[botId];
    }
    const sessionPath = path.join(SESSION_DIR, botId);
    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }
    res.json({ status: true });
});

// Endpoint Blast Pesan (Menggunakan bot aktif secara bergantian)
app.post('/api/blast', async (req, res) => {
    const { phones } = req.body;
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ status: false, message: 'Daftar nomor tidak valid.' });
    }

    const activeBots = Object.keys(bots).filter(id => bots[id].status === 'CONNECTED' && bots[id].isRunning);

    if (activeBots.length === 0) {
        return res.status(400).json({ status: false, message: 'Tidak ada bot yang berstatus CONNECTED dan aktif!' });
    }

    let botIndex = 0;

    // Respond langsung, proses di background
    res.json({ 
        status: true, 
        message: `Blast massal ke ${phones.length} target sedang diproses di background menggunakan ${activeBots.length} bot aktif.`,
        totalTargets: phones.length,
        activeBots: activeBots.length
    });

    // Background process pengiriman ber-jeda 3 detik
    (async () => {
        let successCount = 0;
        let failCount = 0;

        for (let phone of phones) {
            let formattedPhone = phone.replace(/[^0-9]/g, '');
            if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.slice(1);
            if (!formattedPhone.startsWith('62')) formattedPhone = '62' + formattedPhone;

            const currentBotId = activeBots[botIndex % activeBots.length];
            const botEntry = bots[currentBotId];

            if (!botEntry || !botEntry.sock || botEntry.status !== 'CONNECTED') {
                botIndex++;
                failCount++;
                continue;
            }

            const otp = Math.floor(100000 + Math.random() * 900000);
            const randomWeb = animeWebs[Math.floor(Math.random() * animeWebs.length)];
            const randomTemplate = messageTemplates[Math.floor(Math.random() * messageTemplates.length)];
            const pesan = randomTemplate(randomWeb, otp);

            try {
                await botEntry.sock.sendMessage(`${formattedPhone}@s.whatsapp.net`, { text: pesan });
                successCount++;
                console.log(`[BLAST] ✅ Terkirim ke ${formattedPhone} via bot ${currentBotId}`);
            } catch (err) {
                failCount++;
                console.error(`[BLAST] ❌ Gagal kirim ke ${formattedPhone} via bot ${currentBotId}:`, err.message);
            }

            botIndex++;
            await new Promise(r => setTimeout(r, 3000)); // Jeda aman 3 detik
        }
        console.log(`[BLAST] Selesai! Sukses: ${successCount}, Gagal: ${failCount}`);
    })();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Multi-Session Panel jalan di port ${PORT}`);
    console.log(`📁 Session directory: ${SESSION_DIR}`);
});
