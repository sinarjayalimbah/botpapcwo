const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const crypto = require("crypto");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==========================
// KONFIGURASI
// ==========================
const botUsername = "ratepapceweksdct_bot";
const OWNER_ID = 8492860397;

const CHANNELS = [
  "@SeducteaseCH",
  "@Ratepapcewek_SDCT"
];

const GROUP_ID = -1003521400775;
const GROUP_INVITE_LINK = "https://t.me/+WFBU_2WGIURmY2Nl";

// ==========================
// DATABASE
// ==========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const pendingMedia = {};

// ==========================
// INIT DATABASE
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

  console.log("Database ready - Bot Pap Cowok");
})();

// ==========================
// HELPER
// ==========================
function generateCode() {
  return crypto.randomBytes(24).toString('base64')
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=/g, '');
}

async function isAdmin(userId) {
  const res = await pool.query(
    "SELECT id FROM admins_papcowok WHERE id=$1",
    [userId]
  );
  return res.rows.length > 0;
}

async function checkMembership(userId) {
  try {
    const allowed = ['member', 'administrator', 'creator'];

    for (let ch of CHANNELS) {
      const res = await bot.getChatMember(ch, userId);
      if (!allowed.includes(res.status)) return false;
    }

    const group = await bot.getChatMember(GROUP_ID, userId);
    if (!allowed.includes(group.status)) return false;

    return true;
  } catch {
    return false;
  }
}

function getJoinKeyboard() {
  const buttons = [];
  let row = [];

  CHANNELS.forEach((ch) => {
    row.push({
      text: "Join Channel",
      url: `https://t.me/${ch.replace('@', '')}`
    });

    if (row.length === 2) {
      buttons.push(row);
      row = [];
    }
  });

  if (row.length > 0) buttons.push(row);

  buttons.push([{ text: "Join Grup", url: GROUP_INVITE_LINK }]);
  buttons.push([{ text: "✅ Saya sudah join", callback_data: "cek_join" }]);

  return { inline_keyboard: buttons };
}

async function sendMedia(chatId, fileId, mediaType, caption) {
  if (mediaType === 'photo') {
    await bot.sendPhoto(chatId, fileId, { caption, protect_content: true });
  } else {
    await bot.sendVideo(chatId, fileId, { caption, protect_content: true });
  }
}

// ==========================
// /start TANPA KODE
// ==========================
bot.onText(/\/start$/, async msg => {
  const chatId = msg.chat.id;
  const admin = await isAdmin(chatId);

  if (admin) {
    return bot.sendMessage(chatId,
      "Panel Admin - Bot Pap Cowok\n\n" +
      "Upload foto/video dengan caption → link langsung muncul.\n" +
      "Upload tanpa caption → bot minta judul dulu.\n\n" +
      "Command:\n" +
      "/listmedia - lihat 20 media terbaru\n" +
      "/hapus_(id) - hapus media berdasarkan ID\n" +
      "/batal - batalkan upload yang sedang pending\n"
    );
  }

  const joined = await checkMembership(chatId);

  if (joined) {
    return bot.sendMessage(chatId, "Kamu sudah join semua ✅");
  }

  bot.sendMessage(chatId,
    "Join semua channel & grup dulu ya!",
    { reply_markup: getJoinKeyboard() }
  );
});

// ==========================
// /start DENGAN KODE
// ==========================
bot.onText(/\/start (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const kode = match[1];

  const joined = await checkMembership(chatId);

  if (!joined) {
    return bot.sendMessage(chatId,
      "Join dulu semua ya!",
      { reply_markup: getJoinKeyboard() }
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

  bot.sendMessage(msg.chat.id, `✅ Media "${res.rows[0].judul}" berhasil dihapus.`);
});

// ==========================
// CALLBACK BUTTON
// ==========================
bot.on("callback_query", async query => {
  const chatId = query.message.chat.id;

  if (query.data === "cek_join") {
    const joined = await checkMembership(chatId);

    if (joined) {
      await bot.answerCallbackQuery(query.id, { text: "Berhasil! ✅" });
      await bot.sendMessage(chatId, "Sekarang kamu bisa akses link 👍");
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: "Masih belum join semua ❌",
        show_alert: true
      });
    }
  }
});

// ==========================
// HANDLER MESSAGE UTAMA
// ==========================
bot.on("message", async msg => {
  const chatId = msg.chat.id;

  // Abaikan semua command
  if (msg.text && msg.text.startsWith("/")) return;

  const admin = await isAdmin(chatId);
  if (!admin) return;

  // Admin upload FOTO
  if (msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    // Ada caption → langsung simpan
    if (msg.caption) {
      const judul = msg.caption;
      const kode = generateCode();

      await pool.query(
        "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
        [kode, fileId, "photo", judul]
      );

      const link = `https://t.me/${botUsername}?start=${kode}`;
      return bot.sendMessage(chatId, `✅ Berhasil!\n\nJudul: ${judul}\nTipe: photo\nLink: ${link}`);
    }

    // Tidak ada caption → minta judul
    pendingMedia[chatId] = { file_id: fileId, media_type: "photo" };
    return bot.sendMessage(chatId, "Ketik judul untuk foto ini:");
  }

  // Admin upload VIDEO
  if (msg.video) {
    const fileId = msg.video.file_id;

    // Ada caption → langsung simpan
    if (msg.caption) {
      const judul = msg.caption;
      const kode = generateCode();

      await pool.query(
        "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
        [kode, fileId, "video", judul]
      );

      const link = `https://t.me/${botUsername}?start=${kode}`;
      return bot.sendMessage(chatId, `✅ Berhasil!\n\nJudul: ${judul}\nTipe: video\nLink: ${link}`);
    }

    // Tidak ada caption → minta judul
    pendingMedia[chatId] = { file_id: fileId, media_type: "video" };
    return bot.sendMessage(chatId, "Ketik judul untuk video ini:");
  }

  // Terima judul (untuk foto/video tanpa caption)
  if (msg.text && pendingMedia[chatId]) {
    const { file_id, media_type } = pendingMedia[chatId];
    const judul = msg.text;
    const kode = generateCode();

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
