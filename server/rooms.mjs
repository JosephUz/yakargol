import { randomBytes } from 'node:crypto';
import { createCinema } from '../src/cinema.js';
import { createWorld, startAim, step } from '../src/world.js';
import { PITCH } from '../src/config.js';
import { encodeSnapshot } from '../src/net/snapshot.js';
import { C2S, EDGES, NET, S2C, roomCode } from '../src/net/protocol.js';

/**
 * Odalar: kur / katıl / lobi / başlat / maç / bitiş (bitince oda lobiye döner, yönetici yeniden başlatabilir). On
 * koltuk (0-4 mavi, 5-9 turuncu; 4 ve 9 kaleci): herkes istediği boş koltuğa oturur, yönetici (kuran) oyuncuları
 * koltuktan koltuğa taşır (dolu koltuğa taşırsa ikisi yer değiştirir). Boş koltukları botlar doldurur. Maç sürerken de
 * odaya katılınabilir: boş (bot) koltuğa oturulur.
 *
 * Oda açık (varsayılan) ya da özeldir. Açık odalar ana ekrandaki listede görünür ve Hızlı katıl onlardan birine
 * oturtur (bkz. openRooms); özel odaya yalnız kodla / linkle girilir.
 *
 * Sunucu otoriterdir: her oda kendi dünyasını saniyede 60 adım koşturur (world.js, tarayıcıdakiyle aynı kurallar),
 * saniyede 30 durum paketi ve biriken olayları yayar. Hesap yok: bağlantı `token` ile tanınır, kopan oyuncu aynı
 * token'la koltuğuna geri döner; kopukken koltuğunu bot oynar. Oda bağlı kimse kalmayınca kapanır.
 *
 * Yakar pas ve rüzgar şutu sineması herkes için aynıdır (src/cinema.js): biri nişan alırken maç ağır çekime geçer
 * (rakipler bu sırada kayıp topu alabilir), uçuşta yine ağır çekim; evre durum paketinde gider.
 */
export function createRooms({ log = console.log, presence = () => 0 } = {}) {
  const rooms = new Map();   // code -> room
  const conns = new Set();   // canlı bağlantılar
  const byToken = new Map(); // token -> conn (kopmuş olsa da)

  const send = (conn, obj) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj)); };
  const error = (conn, msg) => send(conn, { t: S2C.ERROR, msg });

  /** Çevrim içi: açık sekme (WebSocket) + yalnız sinyal yollayan sekme (uygulama, bkz. server.mjs presence). */
  const online = () => conns.size + presence();
  let onlineSent = -1;
  function broadcastOnline() {
    const n = online();
    if (n === onlineSent) return;
    onlineSent = n;
    for (const c of conns) if (!c.room || c.room.state !== 'playing') send(c, { t: S2C.ONLINE, n });
  }
  const onlineTimer = setInterval(broadcastOnline, 2000);
  onlineTimer.unref?.();

  function lobbyMsg(room) {
    return { t: S2C.LOBBY, code: room.code, hostId: room.hostId, state: room.state, priv: room.priv,
      seats: room.seats.map(c => (c ? { id: c.id, nick: c.nick, online: Boolean(c.ws) } : null)) };
  }
  const members = room => room.seats.filter(Boolean);
  const broadcast = (room, obj) => { for (const c of members(room)) send(c, obj); };
  const broadcastLobby = room => { broadcast(room, lobbyMsg(room)); roomsChanged(); };

  // ---------- Açık oda listesi ----------
  /**
   * Listede ve hızlı katılda yalnız açık odalar: özel değil, boş koltuğu var, bağlı biri oturuyor. Önce lobide
   * bekleyenler (maç sürenlere de girilir: boş bot koltuğuna oturulur), sonra kalabalık olan — insanlar buluşsun.
   */
  const isOpen = r => !r.priv && members(r).length < NET.seats && members(r).some(c => c.ws);
  const byOffer = (a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || members(b).length - members(a).length;
  const openRooms = () => [...rooms.values()].filter(isOpen).sort(byOffer);
  /** Listenin en çok bu kadar odası gider (paket küçük kalsın). */
  const LIST_MAX = 20;
  function roomsMsg() {
    return JSON.stringify({ t: S2C.ROOMS, list: openRooms().slice(0, LIST_MAX).map(r => ({
      code: r.code, host: r.seats.find(c => c && c.id === r.hostId)?.nick || '', n: members(r).length, state: r.state })) });
  }
  const idle = c => !c.room && c.nick && c.ws && c.ws.readyState === 1;
  /** Liste değişince odada olmayan (ana ekrandaki) bağlantılara yollanır; aynı liste iki kez gitmez. */
  let roomsSent = '', roomsTimer = null;
  function roomsChanged() {
    if (roomsTimer) return;
    roomsTimer = setTimeout(() => {
      roomsTimer = null;
      const msg = roomsMsg();
      if (msg === roomsSent) return;
      roomsSent = msg;
      for (const c of conns) if (idle(c)) c.ws.send(msg);
    }, 200);
    roomsTimer.unref?.();
  }
  const sendRooms = conn => { if (idle(conn)) conn.ws.send(roomsMsg()); };
  const freeSeat = (room, prefer = []) => {
    for (const i of prefer) if (!room.seats[i]) return i;
    const order = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9]; // takımlar dengeli dolsun, kaleciler en son
    return order.find(i => !room.seats[i]) ?? -1;
  };

  /** Koltuğa oturt (maç sürüyorsa o koltuğun oyuncusu insana geçer, adı değişir). */
  function seat(room, conn, slot) {
    const old = room.seats.indexOf(conn);
    if (old >= 0) room.seats[old] = null;
    room.seats[slot] = conn;
    if (room.world) { syncHumans(room); }
  }
  /** Dünyadaki insan işaretleri ve adları koltuklardan: boş ya da kopuk koltuğu bot oynar. */
  function syncHumans(room) {
    const w = room.world;
    w.players.forEach((p, i) => {
      const c = room.seats[i];
      p.human = Boolean(c && c.ws && !c.left);
      p.name = c ? c.nick : 'Bot-' + i;
    });
  }
  const startMsg = (room, conn) => ({ t: S2C.START, you: room.seats.indexOf(conn), names: room.world.players.map(p => p.name), humans: room.world.players.map(p => p.human) });

  /** Maç sürerken koltuklar değişti: herkese güncel ad / insan listesi ve kendi koltuğu. */
  function roster(room) { syncHumans(room); for (const c of members(room)) send(c, startMsg(room, c)); }

  function leaveRoom(conn) {
    const room = conn.room; if (!room) return;
    const i = room.seats.indexOf(conn);
    if (i >= 0) room.seats[i] = null;
    conn.room = null; conn.input = blankInput();
    if (!members(room).length) { closeRoom(room, 'boşaldı'); return; }
    if (room.hostId === conn.id) room.hostId = members(room)[0].id;
    if (room.world) roster(room);
    broadcastLobby(room);
  }
  function closeRoom(room, why) {
    stopRoom(room); rooms.delete(room.code); log(`oda kapandı ${room.code} (${why})`);
    for (const c of members(room)) c.room = null;
    roomsChanged();
  }
  function closeIfEmpty(room) {
    if (members(room).some(c => c.ws)) return false;
    closeRoom(room, 'bağlı kimse kalmadı');
    return true;
  }
  function stopRoom(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }

  // ---------- Maç ----------
  const blankInput = () => ({ cmd: { x: 0, z: 0, aim: null, hold: false }, edges: {} });

  function startGame(room) {
    const seed = 1 + Math.floor(Math.random() * 1e6);
    room.world = createWorld(seed);
    room.state = 'playing'; room.cinema = createCinema(); room.acc = 0; room.clock = 0; room.stepNo = 0; room.events = [];
    room.last = performance.now();
    for (const c of members(room)) c.input = blankInput();
    syncHumans(room);
    for (const c of members(room)) send(c, startMsg(room, c));
    room.timer = setInterval(() => tick(room), 1000 / 60);
    roomsChanged();
    log(`başladı ${room.code}: ${members(room).length} insan`);
  }

  /** Bu adımın insan girdileri: sürekli durum + birikmiş basışlar (bir kez tüketilir). */
  function inputs(room) {
    const players = {};
    room.seats.forEach((c, i) => {
      if (!c || !c.ws) return;
      players[i] = { ...c.input.cmd, ...c.input.edges };
      c.input.edges = {};
    });
    return { players };
  }

  function tick(room) {
    const now = performance.now(), dt = Math.min(0.1, (now - room.last) / 1000);
    room.last = now; room.clock += dt;
    const w = room.world;
    room.acc += dt * room.cinema.scale();
    for (let n = 0; room.acc >= NET.step && n < 6; n++) {
      step(w, NET.step, inputs(room));
      room.acc -= NET.step;
      events(room);
    }
    room.cinema.tick(w, dt);
    if (++room.stepNo % NET.snapshotEvery === 0) flush(room);
    if (w.winner !== null) endGame(room);
    else closeIfEmpty(room);
  }

  /** Olayları biriktirir (sonraki pakette gider) ve sinemaya iletir. */
  function events(room) {
    const w = room.world;
    for (const e of w.events) { room.cinema.event(e); room.events.push(e); }
    w.events.length = 0;
  }

  function flush(room) {
    const snap = encodeSnapshot(room.world, room.cinema.state, room.clock, room.events.map(compactEvent));
    room.events = [];
    const msg = JSON.stringify({ t: S2C.SNAP, ...snap });
    for (const c of members(room)) if (c.ws && c.ws.readyState === 1) c.ws.send(msg);
  }
  /** Olayları küçült: sayılar yuvarlanır. */
  const compactEvent = e => {
    const o = {};
    for (const [k, v] of Object.entries(e)) o[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
    return o;
  };

  function endGame(room) {
    const w = room.world;
    flush(room);
    broadcast(room, { t: S2C.END, score: w.score, winner: w.winner, stats: w.players.map(p => p.stats), names: w.players.map(p => p.name), roles: w.players.map(p => p.role) });
    stopRoom(room);
    room.state = 'lobby'; room.world = null; room.cinema = null;
    log(`bitti ${room.code}: ${w.score[0]}-${w.score[1]}`);
    broadcastLobby(room);
  }

  // ---------- Kur / katıl ----------
  function createRoom(conn, priv) {
    if (conn.room) leaveRoom(conn);
    let code = roomCode(); while (rooms.has(code)) code = roomCode();
    const r = { code, hostId: conn.id, priv, seats: Array(NET.seats).fill(null), state: 'lobby', world: null, cinema: null, timer: null, events: [] };
    r.seats[0] = conn;
    rooms.set(code, r); conn.room = r;
    broadcastLobby(r); log(`oda kuruldu ${code} (${conn.nick}${priv ? ', özel' : ''})`);
  }
  function joinRoom(conn, r) {
    if (r.seats.includes(conn)) { broadcastLobby(r); if (r.world) send(conn, startMsg(r, conn)); return; }
    const slot = freeSeat(r);
    if (slot < 0) return error(conn, 'Oda dolu');
    if (conn.room) leaveRoom(conn);
    conn.input = blankInput();
    seat(r, conn, slot); conn.room = r;
    broadcastLobby(r);
    if (r.world) roster(r);
    log(`katıldı ${conn.nick} -> ${r.code}`);
  }

  // ---------- Mesajlar ----------
  const finite = v => (Number.isFinite(+v) ? +v : 0);
  function readInput(conn, msg) {
    const [x, z] = Array.isArray(msg.mv) ? msg.mv.map(finite) : [0, 0];
    const d = Math.hypot(x, z), k = d > 1 ? 1 / d : 1;
    const aim = Array.isArray(msg.aim) ? { x: Math.max(-PITCH.halfX * 3, Math.min(PITCH.halfX * 3, finite(msg.aim[0]))), z: Math.max(-PITCH.halfZ * 3, Math.min(PITCH.halfZ * 3, finite(msg.aim[1]))) } : null;
    conn.input.cmd = { x: x * k, z: z * k, aim, hold: Boolean(msg.hold), held2: Boolean(msg.h2) };
    for (const ch of String(msg.e || '').slice(0, 12)) {
      const name = EDGES[ch];
      if (name) conn.input.edges[name] = true;
    }
  }

  function onMessage(conn, data) {
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = conn.room;
    switch (msg.t) {
      case C2S.HELLO: {
        conn.nick = String(msg.nick || '').trim().slice(0, 16) || `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
        const old = msg.token && byToken.get(msg.token);
        if (old && old !== conn && old.room) {
          // Geri bağlanma: eski bağlantının kimliği ve koltuğu devralınır.
          conn.id = old.id; conn.token = old.token; conn.room = old.room;
          const r = old.room, i = r.seats.indexOf(old); if (i >= 0) r.seats[i] = conn;
          if (r.hostId === old.id) r.hostId = conn.id;
          byToken.set(conn.token, conn); conns.delete(old); old.room = null;
          send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
          if (r.world) { syncHumans(r); send(conn, startMsg(r, conn)); }
          broadcastLobby(r);
          log(`geri bağlandı ${conn.nick} (${r.code})`);
          return;
        }
        conn.token = conn.token || randomBytes(12).toString('base64url');
        byToken.set(conn.token, conn);
        send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
        send(conn, { t: S2C.ONLINE, n: online() });
        sendRooms(conn);
        return;
      }
      case C2S.CREATE: { createRoom(conn, Boolean(msg.priv)); return; }
      case C2S.JOIN: {
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return error(conn, 'Böyle bir oda yok');
        joinRoom(conn, r);
        return;
      }
      case C2S.ROOMS: { sendRooms(conn); return; }
      case C2S.QUICK: {
        // Hızlı katıl: en uygun açık oda (bkz. byOffer), yoksa yeni açık oda — kuran yönetici olur.
        if (!conn.nick) return;
        const r = openRooms().find(x => x !== room);
        if (r) joinRoom(conn, r); else createRoom(conn, false);
        return;
      }
      case C2S.SEAT: {
        // Boş koltuğa otur (lobide ya da maç sürerken).
        const slot = Math.round(+msg.slot);
        if (!room || !(slot >= 0 && slot < NET.seats)) return;
        if (room.seats[slot]) return error(conn, 'Koltuk dolu: yönetici yerini değiştirebilir');
        seat(room, conn, slot);
        broadcastLobby(room);
        if (room.world) roster(room);
        return;
      }
      case C2S.MOVE: {
        // Yönetici oyuncuyu koltuğa taşır; koltuk doluysa ikisi yer değiştirir.
        const slot = Math.round(+msg.slot);
        if (!room || room.hostId !== conn.id || !(slot >= 0 && slot < NET.seats)) return;
        const from = room.seats.findIndex(c => c && c.id === msg.id);
        if (from < 0 || from === slot) return;
        [room.seats[from], room.seats[slot]] = [room.seats[slot], room.seats[from]];
        if (room.world) roster(room);
        broadcastLobby(room);
        return;
      }
      case C2S.START: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        startGame(room); return;
      }
      case C2S.LEAVE: { if (room) leaveRoom(conn); send(conn, { t: S2C.ONLINE, n: online() }); sendRooms(conn); return; }
      case C2S.INPUT: { if (room && room.world) readInput(conn, msg); return; }
      case C2S.AIM: {
        // Yakar pas nişanı (sağ tık basılı); rüzgar nişanını dünya kendisi başlatır (sol tık basılı, bkz. world.js shoot).
        if (!room || !room.world) return;
        const id = room.seats.indexOf(conn);
        if (id >= 0) startAim(room.world, id, 'fire');
        return;
      }
      case C2S.PING: { send(conn, { t: S2C.PONG, at: msg.at }); return; }
      default: return;
    }
  }

  let nextId = 1;
  return {
    attach(ws) {
      const conn = { id: nextId++, token: null, nick: '', ws, room: null, input: blankInput() };
      conns.add(conn); broadcastOnline();
      ws.on('message', data => { try { onMessage(conn, data); } catch (err) { log('mesaj hatası', err); } });
      ws.on('close', () => {
        conns.delete(conn); conn.ws = null; broadcastOnline();
        const r = conn.room; if (!r) return;
        // Maçta koptu: koltuk tutulur, o sürede bot oynar. Lobide koptu: koltuk boşalır.
        if (r.world) { syncHumans(r); broadcastLobby(r); log(`koptu ${conn.nick} (${r.code})`); closeIfEmpty(r); }
        else leaveRoom(conn);
      });
      ws.on('error', () => {});
    },
    rooms,
    online: broadcastOnline,
    /** online: açık sekme (bağlı soket + sinyal), oyunda: bir odada oturan bağlı sekme. */
    stats() { let inRoom = 0; for (const c of conns) if (c.room) inRoom++; return { rooms: rooms.size, online: online(), inRoom }; },
    close() { clearInterval(onlineTimer); clearTimeout(roomsTimer); for (const r of rooms.values()) stopRoom(r); },
  };
}

