import { MATCH } from './config.js';
import { NET, normCode } from './net/protocol.js';
import { paylasti } from './olcum.js';

/**
 * Çok oyunculu ekranlar, josephuz oda standardına göre (josephuz docs/oda-standardi.md): giriş ekranında ADIN, tek
 * başına düğmesi, ÇEVRİM İÇİ bölümü (HIZLI KATIL → · ODA KUR · ODAYA KATIL + kod satırı, durum satırı, çevrim içi
 * sayısı) ve AÇIK ODALAR listesi; bekleme odası (oda kodu, link, iki takımın beşer koltuğu, ODA: Herkese açık / Özel).
 * Herkes boş (bot) koltuğa tıklayıp oturur. Kuran oyuncuları taşır: sürükleyip bir koltuğa bırakır ya da oyuncuya,
 * sonra koltuğa tıklar; dolu koltukta ikisi yer değiştirir.
 * Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış) üç çevrim içi düğme "YAKINDA" yazar ve
 * basılmaz, açık odalar listesi gizlenir. Liste sunucudan gelir: ana ekrandayken değiştikçe kendiliğinden yenilenir.
 */
export function createLobby(root, app) {
  const $ = id => root.querySelector('#yg-' + id);
  const el = {
    nick: $('nick'), create: $('create'), join: $('join'), joinRow: $('joinrow'), code: $('code'), joinGo: $('join-go'),
    online: $('online'), status: $('home-status'),
    rooms: $('rooms'), roomsList: $('rooms-list'), roomsCount: $('rooms-count'), quick: $('quick'), lobbyVis: $('lobby-vis'),
    lobbyCode: $('lobby-code'), seats: [$('seats-0'), $('seats-1')], hint: $('lobby-hint'), lobbyStatus: $('lobby-status'), start: $('lobby-start'),
    eyebrow: $('lobby-eyebrow'), info: $('lobby-info'), pub: $('lobby-pub'), priv: $('lobby-priv'), copy: $('lobby-copy'),
  };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
  const defaultNick = () => `Oyuncu-${Math.floor(1000 + Math.random() * 9000)}`;
  el.nick.value = store('yg.nick') || defaultNick();
  const nick = () => { const v = el.nick.value.trim().slice(0, 16) || defaultNick(); el.nick.value = v; store('yg.nick', v); return v; };
  let lobby = null, picked = null;

  function setServer(up) {
    for (const b of [el.quick, el.create, el.join, el.joinGo]) {
      b.disabled = !up; b.classList.toggle('soon', !up); b.title = up ? '' : 'Çok oyunculu yakında';
      if (b === el.joinGo) continue;
      const tag = b.querySelector('.soon-tag');
      if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">YAKINDA</em>'); else if (up) tag?.remove();
    }
    if (!up) { el.joinRow.hidden = true; el.online.textContent = ''; }
    el.rooms.hidden = !up;
  }
  setServer(false);

  el.create.onclick = () => { el.status.textContent = 'Oda kuruluyor…'; app.create(nick()); };
  el.quick.onclick = () => { el.status.textContent = 'Oda aranıyor…'; app.quick(nick()); };
  el.join.onclick = () => { el.joinRow.hidden = !el.joinRow.hidden; if (!el.joinRow.hidden) el.code.focus(); };
  const joinGo = () => {
    const code = normCode(el.code.value);
    if (!/^[A-Z]{4}/.test(code)) { el.status.textContent = 'Oda kodunu yaz'; return; }
    el.code.value = code;
    el.status.textContent = 'Odaya bağlanıyor…'; app.join(nick(), code);
  };
  el.joinGo.onclick = joinGo;
  el.code.addEventListener('keydown', e => { if (e.key === 'Enter') joinGo(); });
  el.nick.addEventListener('change', nick);
  // Oyun tuşları (WASD, Boşluk) ad / kod yazarken oyuna gitmesin.
  for (const i of [el.nick, el.code]) i.addEventListener('keydown', e => e.stopPropagation());

  let copiedTimer = 0;
  el.copy.onclick = () => {
    const url = `${location.origin}${location.pathname}?oda=${encodeURIComponent(lobby?.code || '')}`;
    const done = () => {
      el.copy.textContent = 'Link kopyalandı';
      clearTimeout(copiedTimer); copiedTimer = setTimeout(() => { el.copy.textContent = 'Linki kopyala'; }, 1500);
    };
    paylasti();
    try { navigator.clipboard.writeText(url).then(done, () => { el.lobbyStatus.textContent = url; }); } catch { el.lobbyStatus.textContent = url; }
  };
  el.start.onclick = () => app.start();
  $('lobby-leave').onclick = () => app.leave();
  for (const b of [el.pub, el.priv]) b.onclick = () => { if (lobby && lobby.hostId === app.id()) app.settings(b.dataset.priv === '1'); };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const roleName = slot => (slot % 5 === 4 ? 'Kaleci' : 'Oyuncu ' + (slot % 5 + 1));
  /** Oda ayar özeti (listede ve bekleme odasının gözünde): kaça kaç ve süre. */
  const ROOM_META = `${MATCH.teamSize}v${MATCH.teamSize} · ${Math.round(MATCH.duration / 60)} dk`;
  el.eyebrow.textContent = `ODA · ${ROOM_META}`;

  function render(next) {
    lobby = next; if (!lobby) return;
    const me = app.id(), host = lobby.hostId === me;
    el.lobbyCode.textContent = lobby.code;
    el.lobbyVis.textContent = lobby.priv ? 'ÖZEL ODA · yalnız kodla' : 'AÇIK ODA · listede görünür';
    el.lobbyVis.classList.toggle('priv', Boolean(lobby.priv));
    if (picked != null && !lobby.seats.some(s => s && s.id === picked)) picked = null;
    for (const team of [0, 1]) {
      el.seats[team].innerHTML = Array.from({ length: NET.seats / 2 }, (_, k) => {
        const slot = team * 5 + k, s = lobby.seats[slot];
        const cls = ['seat', s ? 'taken' : 'free', s && s.id === me ? 'me' : '', s && !s.online ? 'off' : '', s && s.id === picked ? 'picked' : ''].filter(Boolean).join(' ');
        const tags = s ? [s.id === lobby.hostId && 'kuran', s.id === me && 'sen', !s.online && 'koptu'].filter(Boolean) : [];
        const who = s ? `${esc(s.nick)}${tags.map(t => ` <small class="tag ${t}">${t}</small>`).join('')}`
          : '<i class="free-l">Bot · boş koltuk</i><i class="free-h">Buraya otur</i>';
        return `<li class="${cls}" data-slot="${slot}"${s ? ` data-id="${s.id}"` : ''}${host && s ? ' draggable="true"' : ''}><em>${roleName(slot)}</em><span>${who}</span></li>`;
      }).join('');
    }
    for (const li of root.querySelectorAll('#yg-lobby .seat')) wire(li, host);
    const playing = lobby.state === 'playing';
    el.hint.textContent = (playing ? 'Maç sürüyor: boş bir koltuğa oturunca oyuna girersin. ' : 'Boş koltuğa tıklayıp otur; boş kalanları botlar oynar. ')
      + (host ? 'Oyuncuları sürükleyip bırak (ya da oyuncuya, sonra koltuğa tıkla); dolu koltukta yer değiştirirler.' : '');
    // Ayar: yalnız kuran değiştirir, ötekilerde kapalı görünür.
    el.pub.classList.toggle('on', !lobby.priv); el.priv.classList.toggle('on', Boolean(lobby.priv));
    el.pub.disabled = el.priv.disabled = !host;
    const humans = lobby.seats.filter(Boolean).length;
    el.info.textContent = `${humans} insan · ${NET.seats - humans} bot`;
    // Kuranda MAÇI BAŞLAT ↗; ötekilerde kapalı düğme "Kuranın başlatması bekleniyor". Maç sürerken düğme yok.
    el.start.hidden = playing;
    el.start.disabled = !host;
    el.start.innerHTML = host ? 'MAÇI BAŞLAT <span>↗</span>' : 'Kuranın başlatması bekleniyor';
    el.lobbyStatus.textContent = host && picked != null ? 'Taşınacak koltuğa tıkla' : '';
  }

  function wire(li, host) {
    const slot = Number(li.dataset.slot), id = li.dataset.id ? Number(li.dataset.id) : null;
    li.onclick = () => {
      if (host && picked != null) { if (picked !== id) app.move(picked, slot); picked = null; render(lobby); return; }
      if (host && id != null) { picked = id; render(lobby); return; }
      if (id == null) app.seat(slot);
    };
    if (!host) return;
    li.ondragstart = e => { if (id == null) return; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); li.classList.add('dragging'); };
    li.ondragend = () => { li.classList.remove('dragging'); for (const x of root.querySelectorAll('#yg-lobby .drop')) x.classList.remove('drop'); };
    li.ondragover = e => { e.preventDefault(); li.classList.add('drop'); };
    li.ondragleave = () => li.classList.remove('drop');
    li.ondrop = e => { e.preventDefault(); li.classList.remove('drop'); const from = Number(e.dataTransfer.getData('text/plain')); if (from && from !== id) app.move(from, slot); };
  }

  /**
   * Açık odalar: her satır tek düğme — kuranın adı, "5v5 · 5 dk · n/10 oyuncu", LOBİDE / MAÇTA, KATIL → (doluysa DOLU).
   * Maç süren odaya girilince boş bot koltuğuna oturulur.
   */
  function setRooms(list) {
    el.roomsCount.textContent = list.length ? String(list.length) : '';
    if (!list.length) { el.roomsList.innerHTML = '<p class="rooms-empty">Şu an açık oda yok. Hızlı katıl yeni bir oda kurar.</p>'; return; }
    el.roomsList.innerHTML = list.map(r => {
      const playing = r.state === 'playing', full = r.n >= NET.seats;
      return `<button class="room${playing ? ' playing' : ''}" data-code="${esc(r.code)}"${full ? ' disabled' : ''}>`
        + `<span class="room-info"><b>${esc(r.host || 'Oda')}</b><small>${ROOM_META} · ${r.n}/${NET.seats} oyuncu</small></span>`
        + `<em class="room-state">${playing ? 'MAÇTA' : 'LOBİDE'}</em>`
        + `<span class="room-go">${full ? 'DOLU' : 'KATIL →'}</span></button>`;
    }).join('');
    for (const b of el.roomsList.querySelectorAll('button[data-code]')) {
      b.onclick = () => { el.status.textContent = 'Odaya bağlanıyor…'; app.join(nick(), b.dataset.code); };
    }
  }
  setRooms([]);

  return {
    nick, setServer, render, setRooms,
    setOnline(n) { el.online.textContent = n > 0 ? `● ${n} çevrim içi` : ''; el.online.title = 'Oyunu şu an açık tutan sekme sayısı'; },
    status(text) { el.status.textContent = text; el.lobbyStatus.textContent = text; },
    /** Linkteki oda kodu (?oda=KOD): kod alanı dolu gelir; tiresiz yazılmışsa düzeltilir. */
    urlCode() {
      const raw = new URLSearchParams(location.search).get('oda');
      const c = raw ? normCode(raw) : null;
      if (c) el.code.value = c;
      return c || null;
    },
    showJoin() { el.joinRow.hidden = false; },
  };
}
