const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ==========================
// KONFIGURASI
// ==========================
const OWNER_ID = 8492860397;          // Ganti dengan ID owner
const botUsername = "ratepapcowoksdct_bot";  // Ganti dengan username bot (tanpa @)

// ==========================
// DATABASE CONNECTION
// ==========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==========================
// CREATE TABLE
// ==========================
(async () => {

  // Tabel admin
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins_review (
      id BIGINT PRIMARY KEY
    );
  `);

  // Insert owner sebagai admin pertama
  await pool.query(
    "INSERT INTO admins_review (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [OWNER_ID]
  );

  // Tabel untuk menyimpan kiriman user yang sudah disetujui
  // (untuk tombol Terima — bot kirim link ke user)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      user_name TEXT,
      media_type TEXT NOT NULL,         -- 'photo' atau 'video'
      file_id TEXT NOT NULL,
      caption TEXT,
      admin_message_id BIGINT,          -- message_id di chat admin
      status TEXT DEFAULT 'pending',    -- pending / accepted / rejected
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("✅ Database ready");

})();

// ==========================
// HELPER: CEK ADMIN
// ==========================
async function isAdmin(userId) {
  const res = await pool.query(
    "SELECT id FROM admins_review WHERE id=$1",
    [userId]
  );
  return res.rows.length > 0;
}

// ==========================
// HELPER: FORMAT INFO USER
// ==========================
function formatUserInfo(user, submissionId, caption) {
  let text = `📨 *Review Masuk!*\n\n`;
  text += `👤 Nama     : ${user.full_name || user.first_name}\n`;
  text += `🆔 User ID  : \`${user.id}\`\n`;
  text += `🔗 Username : @${user.username || '-'}\n`;
  text += `📌 ID Review: \`${submissionId}\`\n`;
  if (caption) text += `\n📝 *Caption:*\n${caption}`;
  text += `\n\n_Pilih tindakan di bawah:_`;
  return text;
}

// ==========================
// /start
// ==========================
bot.onText(/\/start$/, async msg => {
  const admin = await isAdmin(msg.chat.id);

  if (admin) {
    return bot.sendMessage(msg.chat.id,
      `📋 *Panel Admin — Bot Review*\n\n` +
      `Semua foto/video dari pengguna akan masuk ke sini.\n\n` +
      `📌 *Command:*\n` +
      `/listadmin — daftar admin\n` +
      `/addadmin (id) — tambah admin\n` +
      `/removeadmin (id) — hapus admin\n` +
      `/listsubmission — lihat semua review masuk\n` +
      `/myid — lihat ID kamu`,
      { parse_mode: "Markdown" }
    );
  }

  bot.sendMessage(msg.chat.id,
    `👋 Halo! Selamat datang di *RATE PAP COWOK SEDUCTEASE*.\n\n` +
    `Kirimkan *foto* atau *video* pap kamu.\n` +
    `Boleh tambahkan caption sebagai keterangan. WAJIB MENAMBAHKAN STIKER YANG DISEDIAKAN, JIKA TERLIHAT WAJAH HARAP TUTUP DENGAN STIKER SEDUCTEASE\n\n` +
    `📌 Pap kamu akan diproses oleh admin.`,
    { parse_mode: "Markdown" }
  );
});

// ==========================
// /myid
// ==========================
bot.onText(/\/myid/, msg => {
  bot.sendMessage(msg.chat.id, `🆔 ID kamu: \`${msg.chat.id}\``, {
    parse_mode: "Markdown"
  });
});

// ==========================
// /addadmin
// ==========================
bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "❌ Hanya owner.");

  const id = parseInt(match[1]);
  await pool.query(
    "INSERT INTO admins_review (id) VALUES ($1) ON CONFLICT DO NOTHING",
    [id]
  );
  bot.sendMessage(msg.chat.id, `✅ Admin \`${id}\` ditambahkan.`, {
    parse_mode: "Markdown"
  });
});

// ==========================
// /removeadmin
// ==========================
bot.onText(/\/removeadmin (\d+)/, async (msg, match) => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "❌ Hanya owner.");

  const id = parseInt(match[1]);
  if (id === OWNER_ID)
    return bot.sendMessage(msg.chat.id, "❌ Owner tidak bisa dihapus.");

  await pool.query("DELETE FROM admins_review WHERE id=$1", [id]);
  bot.sendMessage(msg.chat.id, `✅ Admin \`${id}\` dihapus.`, {
    parse_mode: "Markdown"
  });
});

// ==========================
// /listadmin
// ==========================
bot.onText(/\/listadmin/, async msg => {
  if (msg.chat.id !== OWNER_ID)
    return bot.sendMessage(msg.chat.id, "❌ Hanya owner.");

  const res = await pool.query("SELECT id FROM admins_review");
  let text = "📋 *Daftar Admin*\n\n";
  res.rows.forEach((r, i) => {
    text += `${i + 1}. \`${r.id}\`${r.id == OWNER_ID ? ' (OWNER)' : ''}\n`;
  });
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// ==========================
// /listsubmission
// ==========================
bot.onText(/\/listsubmission/, async msg => {
  const admin = await isAdmin(msg.chat.id);
  if (!admin) return bot.sendMessage(msg.chat.id, "❌ Hanya admin.");

  const res = await pool.query(
    "SELECT id, user_name, media_type, status, created_at FROM submissions ORDER BY created_at DESC LIMIT 20"
  );

  if (res.rows.length === 0)
    return bot.sendMessage(msg.chat.id, "📭 Belum ada submission.");

  let text = "📋 *Daftar Review (20 terbaru)*\n\n";
  res.rows.forEach((r, i) => {
    const icon = r.status === 'accepted' ? '✅' : r.status === 'rejected' ? '❌' : '⏳';
    text += `${i + 1}. ${icon} ID \`${r.id}\` — @${r.user_name || '-'} — ${r.media_type}\n`;
  });

  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// ==========================
// TERIMA FOTO DARI USER
// ==========================
bot.on("message", async msg => {
  if (!msg.photo) return;
  const admin = await isAdmin(msg.chat.id);
  if (admin) return; // admin tidak perlu diproses

  const user = msg.from;
  const caption = msg.caption || null;
  const fileId = msg.photo[msg.photo.length - 1].file_id; // resolusi tertinggi

  try {
    // Simpan ke database dulu (tanpa admin_message_id)
    const ins = await pool.query(
      `INSERT INTO submissions (user_id, user_name, media_type, file_id, caption)
       VALUES ($1, $2, 'photo', $3, $4) RETURNING id`,
      [user.id, user.username || null, fileId, caption]
    );
    const submissionId = ins.rows[0].id;

    // Kirim ke semua admin
    const admins = await pool.query("SELECT id FROM admins_review");
    const infoText = formatUserInfo(user, submissionId, caption);

    for (const a of admins.rows) {
      const sent = await bot.sendPhoto(a.id, fileId, {
        caption: infoText,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Terima", callback_data: `accept_${submissionId}` },
              { text: "❌ Tolak",  callback_data: `reject_${submissionId}` }
            ]
          ]
        }
      });

      // Simpan message_id pesan admin pertama (owner) untuk nanti di-edit
      if (a.id == OWNER_ID) {
        await pool.query(
          "UPDATE submissions SET admin_message_id=$1 WHERE id=$2",
          [sent.message_id, submissionId]
        );
      }
    }

    await bot.sendMessage(msg.chat.id,
      "✅ Foto review kamu sudah terkirim!\nTunggu konfirmasi dari admin ya. 🙏"
    );

  } catch (err) {
    console.error("Error handle photo:", err);
    bot.sendMessage(msg.chat.id, "❌ Gagal mengirim. Coba lagi nanti.");
  }
});

// ==========================
// TERIMA VIDEO DARI USER
// ==========================
bot.on("message", async msg => {
  if (!msg.video) return;
  const admin = await isAdmin(msg.chat.id);
  if (admin) return;

  const user = msg.from;
  const caption = msg.caption || null;
  const fileId = msg.video.file_id;

  try {
    const ins = await pool.query(
      `INSERT INTO submissions (user_id, user_name, media_type, file_id, caption)
       VALUES ($1, $2, 'video', $3, $4) RETURNING id`,
      [user.id, user.username || null, fileId, caption]
    );
    const submissionId = ins.rows[0].id;

    const admins = await pool.query("SELECT id FROM admins_review");
    const infoText = formatUserInfo(user, submissionId, caption);

    for (const a of admins.rows) {
      const sent = await bot.sendVideo(a.id, fileId, {
        caption: infoText,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Terima", callback_data: `accept_${submissionId}` },
              { text: "❌ Tolak",  callback_data: `reject_${submissionId}` }
            ]
          ]
        }
      });

      if (a.id == OWNER_ID) {
        await pool.query(
          "UPDATE submissions SET admin_message_id=$1 WHERE id=$2",
          [sent.message_id, submissionId]
        );
      }
    }

    await bot.sendMessage(msg.chat.id,
      "✅ Video review kamu sudah terkirim!\nTunggu konfirmasi dari admin ya. 🙏"
    );

  } catch (err) {
    console.error("Error handle video:", err);
    bot.sendMessage(msg.chat.id, "❌ Gagal mengirim. Coba lagi nanti.");
  }
});

// ==========================
// CALLBACK: TERIMA / TOLAK
// ==========================
bot.on("callback_query", async query => {
  const adminId = query.message.chat.id;
  const data = query.data;
  const messageId = query.message.message_id;

  const admin = await isAdmin(adminId);
  if (!admin) return bot.answerCallbackQuery(query.id, { text: "❌ Bukan admin." });

  // ── TERIMA ──────────────────────────────────
  if (data.startsWith("accept_")) {
    const submissionId = parseInt(data.replace("accept_", ""));

    const res = await pool.query(
      "SELECT * FROM submissions WHERE id=$1",
      [submissionId]
    );

    if (res.rows.length === 0)
      return bot.answerCallbackQuery(query.id, { text: "❌ Submission tidak ditemukan." });

    const sub = res.rows[0];

    if (sub.status !== 'pending')
      return bot.answerCallbackQuery(query.id, {
        text: `⚠️ Sudah diproses (${sub.status})`,
        show_alert: true
      });

    // Update status
    await pool.query(
      "UPDATE submissions SET status='accepted' WHERE id=$1",
      [submissionId]
    );

    // Buat link deep link ke bot video (ganti botUsername dengan bot video kamu)
    // Contoh: link ke konten di bot video
    const link = `https://t.me/${botUsername}?start=review_${submissionId}`;

    // Kirim notifikasi ke user
    try {
      await bot.sendMessage(sub.user_id,
        `🎉 *Review kamu diterima!*\n\n` +
        `Terima kasih sudah mengirimkan review.\n\n` +
        `🔗 Klik link berikut:\n${link}`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.error("Gagal kirim notif ke user:", e.message);
    }

    // Edit pesan di admin — hapus tombol & update status
    try {
      await bot.editMessageCaption(
        query.message.caption + `\n\n✅ *Diterima oleh admin \`${adminId}\`*`,
        {
          chat_id: adminId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] } // hapus tombol
        }
      );
    } catch (_) {}

    bot.answerCallbackQuery(query.id, { text: "✅ Review diterima & user sudah dinotifikasi." });

  // ── TOLAK ───────────────────────────────────
  } else if (data.startsWith("reject_")) {
    const submissionId = parseInt(data.replace("reject_", ""));

    const res = await pool.query(
      "SELECT * FROM submissions WHERE id=$1",
      [submissionId]
    );

    if (res.rows.length === 0)
      return bot.answerCallbackQuery(query.id, { text: "❌ Submission tidak ditemukan." });

    const sub = res.rows[0];

    if (sub.status !== 'pending')
      return bot.answerCallbackQuery(query.id, {
        text: `⚠️ Sudah diproses (${sub.status})`,
        show_alert: true
      });

    await pool.query(
      "UPDATE submissions SET status='rejected' WHERE id=$1",
      [submissionId]
    );

    // Kirim notifikasi ke user
    try {
      await bot.sendMessage(sub.user_id,
        `😔 *Review kamu tidak dapat diterima.*\n\n` +
        `Silakan coba kirimkan review lain yang sesuai.`,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.error("Gagal kirim notif ke user:", e.message);
    }

    // Edit pesan di admin
    try {
      await bot.editMessageCaption(
        query.message.caption + `\n\n❌ *Ditolak oleh admin \`${adminId}\`*`,
        {
          chat_id: adminId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] }
        }
      );
    } catch (_) {}

    bot.answerCallbackQuery(query.id, { text: "❌ Review ditolak & user sudah dinotifikasi." });
  }
});
