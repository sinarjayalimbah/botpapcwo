const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const crypto = require('crypto');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ==========================
// KONFIGURASI
// ==========================
const botUsername       = "ratepapceweksdct_bot";
const OWNER_ID          = 8492860397;
const CHANNEL_USERNAME  = "@SeducteaseCH";
const GROUP_ID          = -1003521400775;
const GROUP_INVITE_LINK = "https://t.me/+WFBU_2WGIURmY2Nl";

// ==========================
// DATABASE
// ==========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const pendingMedia = {};

function generateCode() {
  return crypto.randomBytes(24).toString('base64')
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=/g, '');
}

// ==========================
// CREATE TABLE
// ==========================
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_papcowok (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE,
      file_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      judul TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins_papcowok (
      id BIGINT PRIMARY KEY
    );
  `);

  await pool.query(
    "INSERT INTO admins_papcowok (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [OWNER_ID]
  );

  console.log('Database ready - Bot Pap Cowok');
})();

// ==========================
// HELPER FUNCTIONS
// ==========================
async function isAdmin(userId) {
  const res = await pool.query("SELECT id FROM admins_papcowok WHERE id=$1", [userId]);
  return res.rows.length > 0;
}

async function checkMembership(userId) {
  try {
    const channel = await bot.getChatMember(CHANNEL_USERNAME, userId);
    const group   = await bot.getChatMember(GROUP_ID, userId);
    const allowed = ['member', 'administrator', 'creator'];
    if (!allowed.includes(channel.status)) return false;
    if (!allowed.includes(group.status))   return false;
    return true;
  } catch {
    return false;
  }
}

async function sendMedia(chatId, fileId, mediaType, caption) {
  if (mediaType === 'photo') {
    await bot.sendPhoto(chatId, fileId, {
      caption: caption,
      protect_content: true
    });
  } else if (mediaType === 'video') {
    await bot.sendVideo(chatId, fileId, {
      caption: caption,
      protect_content: true
    });
  }
}

// ==========================
// /start biasa
// ==========================
bot.onText(/\/start$/, async msg => {
  const admin = await isAdmin(msg.chat.id);

  if (admin) {
    return bot.sendMessage(msg.chat.id,
      "Panel Admin - Bot Pap Cowok\n\n" +
      "Upload foto/video lalu ketik judul, link langsung muncul.\n" +
      "Atau forward foto/video yang sudah ada caption, langsung tersimpan otomatis.\n\n" +
      "Command:\n" +
      "/listmedia - lihat semua media\n" +
      "/hapus_(id) - hapus media\n" +
      "/batal - batalkan upload\n"
    );
  }

  const joined = await checkMembership(msg.chat.id);

  if (joined) {
    return bot.sendMessage(msg.chat.id,
      "Kamu sudah join! Klik link dari channel kami untuk melihat konten."
    );
  }

  bot.sendMessage(msg.chat.id,
    "Join channel & grup dulu ya!",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }],
          [{ text: "Join Grup",    url: GROUP_INVITE_LINK }]
        ]
      }
    }
  );
});

// ==========================
// /start dengan kode
// ==========================
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const kode   = match[1];

  const joined = await checkMembership(chatId);

  if (!joined) {
    return bot.sendMessage(chatId,
      "Join dulu ya!",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }],
            [{ text: "Join Grup",    url: GROUP_INVITE_LINK }]
          ]
        }
      }
    );
  }

  const res = await pool.query(
    "SELECT file_id, media_type, judul FROM media_papcowok WHERE kode=$1",
    [kode]
  );

  if (res.rows.length === 0)
    return bot.sendMessage(chatId, "Konten tidak ditemukan.");

  const { file_id, media_type, judul } = res.rows[0];
  await sendMedia(chatId, file_id, media_type, judul);
});

// ==========================
// /batal
// ==========================
bot.onText(/\/batal/, async msg => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  if (pendingMedia[msg.chat.id]) {
    delete pendingMedia[msg.chat.id];
    bot.sendMessage(msg.chat.id, "Upload dibatalkan.");
  } else {
    bot.sendMessage(msg.chat.id, "Tidak ada upload yang sedang berjalan.");
  }
});

// ==========================
// /listmedia
// ==========================
bot.onText(/\/listmedia/, async msg => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  const res = await pool.query(
    "SELECT id, judul, media_type, created_at FROM media_papcowok ORDER BY created_at DESC LIMIT 20"
  );

  if (res.rows.length === 0)
    return bot.sendMessage(msg.chat.id, "Belum ada media.");

  let text = "Daftar Media (20 terbaru):\n\n";
  for (const row of res.rows) {
    const tgl = new Date(row.created_at).toLocaleDateString('id-ID');
    text += `ID: ${row.id} | ${row.media_type.toUpperCase()} | ${row.judul} | ${tgl}\n`;
  }

  bot.sendMessage(msg.chat.id, text);
});

// ==========================
// /hapus_(id)
// ==========================
bot.onText(/\/hapus_(\d+)/, async (msg, match) => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  const id = parseInt(match[1]);
  const res = await pool.query(
    "DELETE FROM media_papcowok WHERE id=$1 RETURNING judul",
    [id]
  );

  if (res.rows.length === 0) {
    return bot.sendMessage(msg.chat.id, `Media ID ${id} tidak ditemukan.`);
  }

  bot.sendMessage(msg.chat.id, `Media "${res.rows[0].judul}" berhasil dihapus.`);
});

// ==========================
// CALLBACK CEK JOIN
// ==========================
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data   = query.data;

  if (!data.startsWith('ck_')) return;

  const kode = data.slice(3);

  const res = await pool.query(
    "SELECT file_id, media_type, judul FROM media_papcowok WHERE kode=$1",
    [kode]
  );

  if (res.rows.length === 0) return;

  const { file_id, media_type, judul } = res.rows[0];
  await sendMedia(chatId, file_id, media_type, judul);
  bot.answerCallbackQuery(query.id);
});

// ==========================
// HANDLER MESSAGE UTAMA
// ==========================
bot.on('message', async msg => {
  const chatId = msg.chat.id;

  // Abaikan semua command
  if (msg.text && msg.text.startsWith('/')) return;

  const admin = await isAdmin(chatId);
  if (!admin) return;

  // Admin upload FOTO
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    // Ada caption → langsung simpan
    if (msg.caption) {
      const judul = msg.caption;
      const kode  = generateCode();

      await pool.query(
        "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
        [kode, fileId, 'photo', judul]
      );

      const link = `https://t.me/${botUsername}?start=${kode}`;
      return bot.sendMessage(chatId,
        `✅ Berhasil!\n\nJudul: ${judul}\nTipe: photo\nLink: ${link}`
      );
    }

    // Tidak ada caption → minta judul
    pendingMedia[chatId] = { file_id: fileId, media_type: 'photo' };
    return bot.sendMessage(chatId, "Ketik judul untuk foto ini:");
  }

  // Admin upload VIDEO
  if (msg.video) {
    const fileId = msg.video.file_id;

    // Ada caption → langsung simpan
    if (msg.caption) {
      const judul = msg.caption;
      const kode  = generateCode();

      await pool.query(
        "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
        [kode, fileId, 'video', judul]
      );

      const link = `https://t.me/${botUsername}?start=${kode}`;
      return bot.sendMessage(chatId,
        `✅ Berhasil!\n\nJudul: ${judul}\nTipe: video\nLink: ${link}`
      );
    }

    // Tidak ada caption → minta judul
    pendingMedia[chatId] = { file_id: fileId, media_type: 'video' };
    return bot.sendMessage(chatId, "Ketik judul untuk video ini:");
  }

  // Terima judul (untuk foto/video tanpa caption)
  if (msg.text && pendingMedia[chatId]) {
    const { file_id, media_type } = pendingMedia[chatId];
    const judul = msg.text;
    const kode  = generateCode();

    delete pendingMedia[chatId];

    await pool.query(
      "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
      [kode, file_id, media_type, judul]
    );

    const link = `https://t.me/${botUsername}?start=${kode}`;
    return bot.sendMessage(chatId,
      `✅ Berhasil!\n\nJudul: ${judul}\nTipe: ${media_type}\nLink: ${link}`
    );
  }
});
