// O'rnatish: npm i telegraf
// Ishga tushirish: MAKER_TOKEN=123:ABC node index.js
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const MAKER_TOKEN = process.env.MAKER_TOKEN;
const DB = 'bots.json';
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : {};
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 2));
const running = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ===================== REKLAMA BOT (mijoz boti) ===================== */
function startClone(token) {
  if (running[token]) return;
  const cfg = db[token];
  const b = new Telegraf(token);
  const st = new Map(); // egasining holati
  const isOwner = (ctx) => ctx.from && ctx.from.id === cfg.owner;

  const menu = Markup.keyboard([
    ["➕ Kanal qo'shish", '📢 Yangi post'],
    ['📋 Kanallar', '📊 Statistika'],
  ]).resize();

  // /start
  b.start((ctx) => {
    if (!isOwner(ctx)) return ctx.reply('Bu bot faqat egasi uchun.');
    ctx.reply(
      "Salom! Avval kanal qo'shing:\n1) «➕ Kanal qo'shish» ni bosing\n2) Kanalni tanlang va botni admin qiling",
      menu
    );
  });

  // Kanal qo'shish
  b.hears("➕ Kanal qo'shish", (ctx) => {
    if (!isOwner(ctx)) return;
    const url = `https://t.me/${cfg.username}?startchannel=true&admin=post_messages`;
    ctx.reply(
      "Kanalingizga botni admin qiling 👇\n(Agar tugma ishlamasa: kanal → Adminlar → Admin qo'shish → shu bot)",
      Markup.inlineKeyboard([[Markup.button.url('📣 Kanalga admin qilish', url)]])
    );
  });

  // Bot kanalga admin bo'lsa / chiqarilsa
  b.on('my_chat_member', async (ctx) => {
    const u = ctx.myChatMember;
    if (u.chat.type !== 'channel') return;
    const status = u.new_chat_member.status;
    if (status === 'administrator') {
      cfg.channels[u.chat.id] = u.chat.title;
      save();
      await ctx.telegram.sendMessage(
        cfg.owner,
        `✅ «${u.chat.title}» kanali reklama botga qo'shildi!`
      );
    } else if (status === 'left' || status === 'kicked') {
      delete cfg.channels[u.chat.id];
      save();
      await ctx.telegram.sendMessage(cfg.owner, `❌ «${u.chat.title}» kanalidan chiqarildim.`);
    }
  });

  // Kanallar ro'yxati
  b.hears('📋 Kanallar', (ctx) => {
    if (!isOwner(ctx)) return;
    const list = Object.values(cfg.channels);
    ctx.reply(list.length ? list.map((t, i) => `${i + 1}. ${t}`).join('\n') : "Kanal yo'q.");
  });

  // Statistika
  b.hears('📊 Statistika', (ctx) => {
    if (!isOwner(ctx)) return;
    const s = cfg.stats;
    ctx.reply(
      `📊 Statistika\nKanallar: ${Object.keys(cfg.channels).length}\nYuborilgan postlar: ${s.posts}\nMuvaffaqiyatli: ${s.ok}\nXato: ${s.fail}`
    );
  });

  // Yangi post -> reklama turi
  b.hears('📢 Yangi post', (ctx) => {
    if (!isOwner(ctx)) return;
    if (!Object.keys(cfg.channels).length)
      return ctx.reply("Avval kanal qo'shing: «➕ Kanal qo'shish»");
    ctx.reply(
      'Reklama turini tanlang:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 Matn', 'type_text')],
        [Markup.button.callback('🖼 Rasm', 'type_photo')],
        [Markup.button.callback('🎬 Video', 'type_video')],
      ])
    );
  });

  b.action(/^type_(text|photo|video)$/, (ctx) => {
    if (!isOwner(ctx)) return;
    st.set(cfg.owner, { step: 'wait', type: ctx.match[1] });
    ctx.answerCbQuery();
    ctx.reply('Postni yuboring (reklama matni/rasmi/videosi):');
  });

  // Post qabul qilish
  b.on('message', (ctx) => {
    if (!isOwner(ctx)) return;
    const s = st.get(cfg.owner);
    if (!s || s.step !== 'wait') return;
    const m = ctx.message;
    const ok =
      (s.type === 'text' && m.text) ||
      (s.type === 'photo' && m.photo) ||
      (s.type === 'video' && m.video);
    if (!ok) return ctx.reply("Tanlangan turga mos post yuboring.");
    s.step = 'confirm';
    s.msgId = m.message_id;
    ctx.reply(
      `Post ${Object.keys(cfg.channels).length} ta kanalga yuboriladi. Tasdiqlaysizmi?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yuborish', 'send'), Markup.button.callback('❌ Bekor', 'cancel')],
      ])
    );
  });

  b.action('cancel', (ctx) => {
    st.delete(cfg.owner);
    ctx.answerCbQuery();
    ctx.editMessageText('Bekor qilindi.');
  });

  // Barcha kanallarga yuborish
  b.action('send', async (ctx) => {
    if (!isOwner(ctx)) return;
    const s = st.get(cfg.owner);
    if (!s || s.step !== 'confirm') return ctx.answerCbQuery();
    ctx.answerCbQuery();
    st.delete(cfg.owner);
    await ctx.editMessageText('Yuborilmoqda...');
    let ok = 0, fail = 0;
    for (const chId of Object.keys(cfg.channels)) {
      try {
        await ctx.telegram.copyMessage(chId, ctx.chat.id, s.msgId);
        ok++;
      } catch (e) {
        fail++;
      }
      await sleep(100);
    }
    cfg.stats.posts++;
    cfg.stats.ok += ok;
    cfg.stats.fail += fail;
    save();
    ctx.reply(`Tayyor ✅\nYuborildi: ${ok}\nXato: ${fail}`);
  });

  b.launch().catch((e) => console.log('Reklama bot xato:', e.message));
  running[token] = b;
}

/* ===================== MAKER BOT ===================== */
const maker = new Telegraf(MAKER_TOKEN);
const state = {};

const makerMenu = Markup.keyboard([['🤖 Bot ochish', '📂 Botlarim']]).resize();

maker.start((ctx) =>
  ctx.reply("Salom! Reklama bot ochish uchun «🤖 Bot ochish» ni bosing.", makerMenu)
);

maker.hears('🤖 Bot ochish', (ctx) => {
  state[ctx.from.id] = 'token';
  ctx.reply("@BotFather da yangi bot yarating va tokenini shu yerga yuboring:");
});

maker.hears('📂 Botlarim', (ctx) => {
  const list = Object.values(db)
    .filter((v) => v.owner === ctx.from.id)
    .map((v) => '@' + v.username);
  ctx.reply(list.length ? list.join('\n') : "Hali botingiz yo'q.");
});

maker.on('text', async (ctx) => {
  if (state[ctx.from.id] !== 'token') return;
  const token = ctx.message.text.trim();
  if (db[token]) return ctx.reply('Bu bot allaqachon ulangan.');
  try {
    const me = await new Telegraf(token).telegram.getMe();
    db[token] = {
      owner: ctx.from.id,
      username: me.username,
      channels: {},
      stats: { posts: 0, ok: 0, fail: 0 },
    };
    save();
    startClone(token);
    delete state[ctx.from.id];
    ctx.reply(
      `✅ @${me.username} tayyor!\nEndi o'sha botga o'tib /start bosing va kanal qo'shing.`
    );
  } catch {
    ctx.reply("Token noto'g'ri. Qayta yuboring.");
  }
});

// Qayta yoqilganda eski botlarni tiklash
Object.keys(db).forEach(startClone);

maker.launch();
console.log('Maker bot ishga tushdi');
process.once('SIGINT', () => maker.stop('SIGINT'));
process.once('SIGTERM', () => maker.stop('SIGTERM'));
