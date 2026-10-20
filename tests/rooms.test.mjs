import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRooms } from '../server/rooms.mjs';
import { S2C } from '../src/net/protocol.js';

// Sahte soket: sunucunun yolladıklarını biriktirir, istemci mesajı `say` ile gider.
function fakeWs() {
  const handlers = {}, got = [];
  return {
    readyState: 1, got,
    on(ev, fn) { handlers[ev] = fn; },
    send(data) { got.push(JSON.parse(data)); },
    say(obj) { handlers.message(Buffer.from(JSON.stringify(obj))); },
    close() { this.readyState = 3; handlers.close(); },
    last(t) { return [...got].reverse().find(m => m.t === t); },
  };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function setup() {
  const rooms = createRooms({ log: () => {} });
  const join = nick => { const ws = fakeWs(); rooms.attach(ws); ws.say({ t: 'hello', nick }); return ws; };
  return { rooms, join };
}

test('oda kurulur, katılan boş koltuğa oturur, istediği koltuğa geçer', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  const code = a.last(S2C.LOBBY).code;
  b.say({ t: 'join', code });
  let lobby = b.last(S2C.LOBBY);
  assert.equal(lobby.seats[0].nick, 'Ali');
  assert.equal(lobby.seats[5].nick, 'Ayşe', 'ikinci gelen karşı takıma oturur');
  b.say({ t: 'seat', slot: 3 });
  lobby = a.last(S2C.LOBBY);
  assert.equal(lobby.seats[3].nick, 'Ayşe'); assert.equal(lobby.seats[5], null);
  b.say({ t: 'seat', slot: 0 });
  assert.match(b.last(S2C.ERROR).msg, /dolu/);
  rooms.close();
});

test('yönetici oyuncuları taşır, dolu koltukta yer değiştirir; yönetici olmayan taşıyamaz', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  b.say({ t: 'join', code: a.last(S2C.LOBBY).code });
  const bId = b.last(S2C.WELCOME).id, aId = a.last(S2C.WELCOME).id;
  a.say({ t: 'move', id: bId, slot: 9 });
  assert.equal(a.last(S2C.LOBBY).seats[9].nick, 'Ayşe');
  a.say({ t: 'move', id: bId, slot: 0 });
  const lobby = a.last(S2C.LOBBY);
  assert.equal(lobby.seats[0].nick, 'Ayşe'); assert.equal(lobby.seats[9].nick, 'Ali', 'yer değiştirdiler');
  b.say({ t: 'move', id: aId, slot: 2 });
  assert.equal(b.last(S2C.LOBBY).seats[9].nick, 'Ali', 'yönetici olmayanın taşıması yok sayılır');
  rooms.close();
});

test('maç başlar: herkes kendi koltuğunu öğrenir, girdisi kendi oyuncusunu yürütür, durum paketi gelir', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  b.say({ t: 'join', code: a.last(S2C.LOBBY).code });
  b.say({ t: 'start' });
  assert.equal(b.last(S2C.START), undefined, 'yalnız yönetici başlatır');
  a.say({ t: 'start' });
  assert.equal(a.last(S2C.START).you, 0); assert.equal(b.last(S2C.START).you, 5);
  assert.deepEqual(a.last(S2C.START).humans.map(Number), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const room = [...rooms.rooms.values()][0];
  room.world.kickoff = 0;
  const x0 = room.world.players[0].x;
  for (let i = 0; i < 20; i++) { a.say({ t: 'in', mv: [1, 0], aim: [0, 0], hold: false, e: '' }); await wait(16); }
  assert.ok(room.world.players[0].x > x0 + 1, 'Ali sağa yürüdü');
  const snap = a.last(S2C.SNAP);
  assert.ok(snap && snap.p.length === 10 && snap.h[5] === 1, 'durum paketi on oyuncuyla ve insan işaretleriyle gelir');
  rooms.close();
});

test('kopan oyuncunun koltuğu tutulur, o sürede bot oynar; token ile geri döner', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe');
  a.say({ t: 'create' });
  b.say({ t: 'join', code: a.last(S2C.LOBBY).code });
  a.say({ t: 'start' });
  const room = [...rooms.rooms.values()][0], token = b.last(S2C.WELCOME).token;
  b.close();
  assert.equal(room.world.players[5].human, false, 'kopan oyuncuyu bot oynar');
  const b2 = fakeWs(); rooms.attach(b2); b2.say({ t: 'hello', nick: 'Ayşe', token });
  assert.equal(b2.last(S2C.START).you, 5, 'aynı koltuğa döndü');
  assert.equal(room.world.players[5].human, true);
  rooms.close();
});

test('yakar top nişanı: maç ağır çekime geçer, bırakınca yakar top uçar (herkes için ağır çekim)', async () => {
  const { rooms, join } = setup();
  const a = join('Ali');
  a.say({ t: 'create' }); a.say({ t: 'start' });
  const room = [...rooms.rooms.values()][0], w = room.world, p = w.players[0];
  w.kickoff = 0; Object.assign(p, { x: 0, z: 10, energyCd: 0, kickCd: 0, stun: 0 });
  Object.assign(w.ball, { owner: 0, x: 0, z: 10 });
  for (const q of w.players.slice(1)) q.stun = 5;
  a.say({ t: 'aim' });
  assert.equal(w.aim?.kind, 'fire');
  const t0 = w.time;
  await wait(300);
  assert.equal(room.cinema.state?.phase, 'aim');
  const slow = w.time - t0;
  assert.ok(slow > 0.02 && slow < 0.2, 'nişanda maç ağır çekimde sürer: ' + slow.toFixed(3));
  a.say({ t: 'in', mv: [0, 0], aim: [0, -20], hold: false, e: 'f' });
  await wait(80);
  assert.equal(w.fireLeft[0], 4, 'yakar top hakkı düştü');
  assert.ok(['flight', 'impact'].includes(room.cinema.state?.phase) || w.ball.kind === 'fire', 'yakar top uçuşta');
  assert.equal(a.last('s').cine[0] !== undefined, true, 'evre durum paketinde');
  rooms.close();
});

test('bağlı kimse kalmayınca oda kapanır; çevrim içi sayısı bağlantılar + sinyal', async () => {
  let beats = 2;
  const rooms = createRooms({ log: () => {}, presence: () => beats });
  const a = fakeWs(); rooms.attach(a); a.say({ t: 'hello', nick: 'Ali' });
  assert.equal(a.last(S2C.ONLINE).n, 3);
  a.say({ t: 'create' }); a.say({ t: 'start' });
  assert.equal(rooms.rooms.size, 1);
  a.close();
  await wait(40);
  assert.equal(rooms.rooms.size, 0);
  beats = 0;
  assert.equal(rooms.stats().online, 0);
  rooms.close();
});

// ---------- Açık oda listesi ve hızlı katıl ----------
const list = ws => ws.last(S2C.ROOMS)?.list;

test('açık oda listede görünür, özel oda görünmez; liste değişince ana ekrandakilere kendiliğinden gelir', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can');
  assert.deepEqual(list(c), [], 'merhabada boş liste gelir');
  a.say({ t: 'create' });
  b.say({ t: 'create', priv: true });
  assert.equal(a.last(S2C.LOBBY).priv, false); assert.equal(b.last(S2C.LOBBY).priv, true);
  await wait(300);
  assert.deepEqual(list(c), [{ code: a.last(S2C.LOBBY).code, host: 'Ali', n: 1, state: 'lobby' }], 'yalnız açık oda');
  assert.equal(a.got.filter(m => m.t === S2C.ROOMS).length, 1, 'odadakine liste gitmez (yalnız merhabadaki)');
  c.say({ t: 'rooms' });
  assert.equal(list(c).length, 1, 'istenince de gelir');
  // Özel odaya kodla girilir.
  c.say({ t: 'join', code: b.last(S2C.LOBBY).code });
  assert.equal(c.last(S2C.LOBBY).seats[5].nick, 'Can');
  rooms.close();
});

test('hızlı katıl ikinci oyuncuyu ilkinin bekleyen odasına oturtur; uygun oda yoksa yeni açık oda kurar', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), c = join('Can');
  a.say({ t: 'quick' });
  const mine = a.last(S2C.LOBBY);
  assert.equal(mine.hostId, a.last(S2C.WELCOME).id, 'oda yoktu: kurdu, yönetici o');
  assert.equal(mine.priv, false);
  b.say({ t: 'create', priv: true });
  c.say({ t: 'quick' });
  const lobby = c.last(S2C.LOBBY);
  assert.equal(lobby.code, mine.code, 'özel odaya değil, açık bekleyen odaya');
  assert.equal(lobby.seats[5].nick, 'Can');
  assert.equal(rooms.rooms.size, 2);
  rooms.close();
});

test('hızlı katıl kalabalık odayı, lobide bekleyeni maç sürene yeğler', () => {
  const { rooms, join } = setup();
  const a = join('Ali'), b = join('Ayşe'), b2 = join('Bora'), d = join('Deniz'), e = join('Ece');
  a.say({ t: 'create' });
  b.say({ t: 'create' }); b2.say({ t: 'join', code: b.last(S2C.LOBBY).code });
  d.say({ t: 'create' }); d.say({ t: 'start' }); // maç sürüyor
  e.say({ t: 'quick' });
  assert.equal(e.last(S2C.LOBBY).code, b.last(S2C.LOBBY).code, 'iki kişilik bekleyen oda');
  e.say({ t: 'rooms' }); // odadayken liste gelmez
  assert.equal(e.got.filter(m => m.t === S2C.ROOMS).length, 1);
  rooms.close();
});

test('dolu oda listede yok, hızlı katıl ona oturtmaz; maç süren oda "playing" diye listelenir', async () => {
  const { rooms, join } = setup();
  const host = join('Ali');
  host.say({ t: 'create' });
  const code = host.last(S2C.LOBBY).code;
  for (let i = 1; i < 10; i++) join('O' + i).say({ t: 'join', code });
  const p = join('Pelin'), q = join('Kaan');
  q.say({ t: 'create' }); q.say({ t: 'start' });
  await wait(300);
  assert.deepEqual(list(p).map(r => [r.code, r.state]), [[q.last(S2C.LOBBY).code, 'playing']], 'dolu oda yok, maç süren var');
  p.say({ t: 'quick' });
  assert.equal(p.last(S2C.START).you, 5, 'tek açık oda maçtaydı: boş bot koltuğuna oturdu');
  const z = join('Zeki');
  z.say({ t: 'quick' });
  assert.notEqual(z.last(S2C.LOBBY).code, code, 'dolu odaya oturmaz');
  rooms.close();
});

test('boşalan oda listeden düşer', async () => {
  const { rooms, join } = setup();
  const a = join('Ali'), c = join('Can');
  a.say({ t: 'create' });
  await wait(300);
  assert.equal(list(c).length, 1);
  a.close();
  await wait(300);
  assert.deepEqual(list(c), []);
  rooms.close();
});
