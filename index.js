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

async function sendMedia(chatId, fileId, mediaType) {
  if (mediaType === 'photo') {
    await bot.sendPhoto(chatId, fileId, { protect_content: true });
  } else if (mediaType === 'video') {
    await bot.sendVideo(chatId, fileId, { protect_content: true });
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
      "Upload foto/video lalu ketik judul, link langsung muncul.\n\n" +
      "Command:\n" +
      "/listmedia - lihat semua media\n" +
      "/hapus_(id) - hapus media, contoh: /hapus_1\n" +
      "/batal - batalkan upload\n" +
      "/listadmin - daftar admin\n" +
      "/addadmin (id) - tambah admin\n" +
      "/removeadmin (id) - hapus admin\n" +
      "/myid - lihat ID kamu"
    );
  }

  const joined = await checkMembership(msg.chat.id);

  if (joined) {
    return bot.sendMessage(msg.chat.id,
      "Kamu sudah join! Klik link dari channel kami untuk melihat konten.",
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "Ke Channel", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }
          ]]
        }
      }
    );
  }

  bot.sendMessage(msg.chat.id,
    "Halo! Untuk melihat konten, join channel & grup kami dulu ya!",
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
      "Kamu harus join channel & grup kami dulu untuk melihat konten!",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Join Channel", url: `https://t.me/${CHANNEL_USERNAME.replace('@', '')}` }],
            [{ text: "Join Grup",    url: GROUP_INVITE_LINK }],
            [{ text: "Saya sudah join", callback_data: `ck_${kode}` }]
          ]
        }
      }
    );
  }

  const res = await pool.query(
    "SELECT file_id, media_type FROM media_papcowok WHERE kode=$1", [kode]
  );

  if (res.rows.length === 0)
    return bot.sendMessage(chatId, "Konten tidak ditemukan.");

  const { file_id, media_type } = res.rows[0];
  await sendMedia(chatId, file_id, media_type);
});

// ==========================
// CALLBACK: CEK ULANG JOIN
// ==========================
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const data   = query.data;

  if (!data.startsWith('ck_')) return;

  const kode   = data.slice(3);
  const joined = await checkMembership(chatId);

  if (!joined) {
    return bot.answerCallbackQuery(query.id, {
      text: "Kamu belum join channel/grup!",
      show_alert: true
    });
  }

  const res = await pool.query(
    "SELECT file_id, media_type FROM media_papcowok WHERE kode=$1", [kode]
  );

  if (res.rows.length === 0) {
    return bot.answerCallbackQuery(query.id, {
      text: "Konten tidak ditemukan.",
      show_alert: true
    });
  }

  const { file_id, media_type } = res.rows[0];
  await sendMedia(chatId, file_id, media_type);
  bot.answerCallbackQuery(query.id);
});

// ==========================
// ADMIN UPLOAD FOTO
// ==========================
bot.on('message', async msg => {
  if (!msg.photo) return;
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  pendingMedia[msg.chat.id] = {
    file_id:    msg.photo[msg.photo.length - 1].file_id,
    media_type: 'photo'
  };

  bot.sendMessage(msg.chat.id,
    "Foto diterima! Sekarang ketik judul untuk foto ini:\n\n(ketik /batal untuk membatalkan)"
  );
});

// ==========================
// ADMIN UPLOAD VIDEO
// ==========================
bot.on('message', async msg => {
  if (!msg.video) return;
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  pendingMedia[msg.chat.id] = {
    file_id:    msg.video.file_id,
    media_type: 'video'
  };

  bot.sendMessage(msg.chat.id,
    "Video diterima! Sekarang ketik judul untuk video ini:\n\n(ketik /batal untuk membatalkan)"
  );
});

// ==========================
// TERIMA JUDUL DARI ADMIN
// ==========================
bot.on('message', async msg => {
  if (!pendingMedia[msg.chat.id]) return;
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  const { file_id, media_type } = pendingMedia[msg.chat.id];
  const judul = msg.text.trim();
  const kode  = generateCode();

  delete pendingMedia[msg.chat.id];

  await pool.query(
    "INSERT INTO media_papcowok (kode, file_id, media_type, judul) VALUES ($1, $2, $3, $4)",
    [kode, file_id, media_type, judul]
  );

  const link = `https://t.me/${botUsername}?start=${kode}`;

  bot.sendMessage(msg.chat.id,
    "Media berhasil disimpan!\n\n" +
    "Judul : " + judul + "\n" +
    "Tipe  : " + media_type + "\n" +
    "Link  : " + link
  );
});

// ==========================
// /batal
// ==========================
bot.onText(/\/batal/, async msg => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return;

  if (!pendingMedia[msg.chat.id])
    return bot.sendMessage(msg.chat.id, "Tidak ada upload yang aktif.");

  delete pendingMedia[msg.chat.id];
  bot.sendMessage(msg.chat.id, "Upload dibatalkan.");
});

// ==========================
// /listmedia
// ==========================
bot.onText(/\/listmedia/, async msg => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return bot.sendMessage(msg.chat.id, "Hanya admin.");

  const res = await pool.query(
    "SELECT id, judul, media_type, kode FROM media_papcowok ORDER BY created_at DESC"
  );

  if (res.rows.length === 0)
    return bot.sendMessage(msg.chat.id, "Belum ada media.");

  let text = "Daftar Media - Pap Cowok\n\n";
  res.rows.forEach((r, i) => {
    const icon = r.media_type === 'photo' ? '🖼' : '🎥';
    text += `${i + 1}. ${icon} ${r.judul} (ID: ${r.id})\n`;
    text += `https://t.me/${botUsername}?start=${r.kode}\n\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

// ==========================
// /hapus_(id)
// ==========================
bot.onText(/\/hapus_(\d+)/, async (msg, match) => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return bot.sendMessage(msg.chat.id, "Hanya admin.");

  const id  = parseInt(match[1]);
  const res = await pool.query("SELECT judul FROM media_papcowok WHERE id=$1", [id]);

  if (res.rows.length === 0)
    return bot.sendMessage(msg.chat.id, "Media tidak ditemukan.");

  await pool.query("DELETE FROM media_papcowok WHERE id=$1", [id]);
  bot.sendMessage(msg.chat.id, "Media " + res.rows[0].judul + " berhasil dihapus.");
});

// ==========================
// /myid
// ==========================
bot.onText(/\/myid/, msg => {
  bot.sendMessage(msg.chat.id, "ID kamu: " + msg.chat.id);
});

// ==========================
// /addadmin
// ==========================
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "Hanya owner.");

  await pool.query(
    "INSERT INTO admins_papcowok (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [parseInt(match[1])]
  );
  bot.sendMessage(msg.chat.id, "Admin " + match[1] + " ditambahkan.");
});

// ==========================
// /removeadmin
// ==========================
bot.onText(/\/removeadmin (\d+)/, async (msg, match) => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "Hanya owner.");

  const id = parseInt(match[1]);
  if (id === OWNER_ID)
    return bot.sendMessage(msg.chat.id, "Owner tidak bisa dihapus.");

  await pool.query("DELETE FROM admins_papcowok WHERE id=$1", [id]);
  bot.sendMessage(msg.chat.id, "Admin " + id + " dihapus.");
});

// ==========================
// /listadmin
// ==========================
bot.onText(/\/listadmin/, async msg => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "Hanya owner.");

  const res = await pool.query("SELECT id FROM admins_papcowok");
  let text = "Daftar Admin - Pap Cowok\n\n";
  res.rows.forEach((r, i) => {
    text += `${i + 1}. ${r.id}${r.id == OWNER_ID ? ' (OWNER)' : ''}\n`;
  });
  bot.sendMessage(msg.chat.id, text);
});
