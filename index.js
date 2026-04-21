const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const crypto = require("crypto");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ==========================
// KONFIGURASI
// ==========================
const botUsername = "ratepapceweksdct_bot";
const OWNER_ID = 8492860397;

// 🔥 MULTI CHANNEL
const CHANNELS = [
  "@SeducteaseCH",
  "@Ratepapcewek_SDCT"
];

// 🔥 1 GRUP
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

// 🔥 CHECK MULTI CHANNEL + GROUP
async function checkMembership(userId) {
  try {
    const allowed = ['member', 'administrator', 'creator'];

    // cek semua channel
    for (let ch of CHANNELS) {
      const res = await bot.getChatMember(ch, userId);
      if (!allowed.includes(res.status)) return false;
    }

    // cek grup
    const group = await bot.getChatMember(GROUP_ID, userId);
    if (!allowed.includes(group.status)) return false;

    return true;
  } catch {
    return false;
  }
}

// 🔥 BUTTON JOIN
function getJoinKeyboard() {
  const buttons = [];
  let row = [];

  CHANNELS.forEach((ch, i) => {
    row.push({
      text: "Join Channel", // biar ga semua "Join Channel"
      url: `https://t.me/${ch.replace('@', '')}`
    });

    // tiap 2 tombol → masuk baris
    if (row.length === 2) {
      buttons.push(row);
      row = [];
    }
  });

  // kalau sisa 1
  if (row.length > 0) {
    buttons.push(row);
  }

  // grup (1 baris sendiri)
  buttons.push([
    { text: "Join Grup", url: GROUP_INVITE_LINK }
  ]);

  // tombol cek
  buttons.push([
    { text: "✅ Saya sudah join", callback_data: "cek_join" }
  ]);

  return { inline_keyboard: buttons };
}

// ==========================
// SEND MEDIA
// ==========================
async function sendMedia(chatId, fileId, mediaType, caption) {
  if (mediaType === 'photo') {
    await bot.sendPhoto(chatId, fileId, {
      caption,
      protect_content: true
    });
  } else {
    await bot.sendVideo(chatId, fileId, {
      caption,
      protect_content: true
    });
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
      "Panel Admin\n\nUpload media + caption langsung jadi link."
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
// CALLBACK BUTTON
// ==========================
bot.on("callback_query", async query => {
  const chatId = query.message.chat.id;

  // 🔥 tombol cek join
  if (query.data === "cek_join") {
    const joined = await checkMembership(chatId);

    if (joined) {
      await bot.answerCallbackQuery(query.id, {
        text: "Berhasil! ✅"
      });

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
// ADMIN UPLOAD
// ==========================
bot.on("message", async msg => {
  const chatId = msg.chat.id;

  if (msg.text && msg.text.startsWith("/")) return;

  const admin = await isAdmin(chatId);
  if (!admin) return;

  if (msg.photo) {
    const fileId = msg.photo.pop().file_id;
    const judul = msg.caption || "Tanpa judul";
    const kode = generateCode();

    await pool.query(
      "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
      [kode, fileId, "photo", judul]
    );

    const link = `https://t.me/${botUsername}?start=${kode}`;
    bot.sendMessage(chatId, `Link:\n${link}`);
  }

  if (msg.video) {
    const fileId = msg.video.file_id;
    const judul = msg.caption || "Tanpa judul";
    const kode = generateCode();

    await pool.query(
      "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1,$2,$3,$4)",
      [kode, fileId, "video", judul]
    );

    const link = `https://t.me/${botUsername}?start=${kode}`;
    bot.sendMessage(chatId, `Link:\n${link}`);
  }
});
