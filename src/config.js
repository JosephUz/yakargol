// Tüm ayar sayıları tek yerde. Uzunluk birimi saha birimi, hız birim/sn, süreler saniye.

/**
 * Saha: yarı boylar (x yan duvara, z kale çizgisine) ve kale ağzının yarı genişliği. Mavi takım +z yarısında başlar
 * ve -z kalesine hücum eder; turuncu tersine. Duvarlar oyunun parçasıdır: aut yoktur, top sekerek oyunda kalır.
 */
export const PITCH = { halfX: 26, halfZ: 40, goal: 5.8 };

/**
 * Maç: süre, takım başı oyuncu (4. rol kaleci), ilk düdüğe ve golden sonraki başlama vuruşuna kadar bekleme.
 * Süre bitince eşitlikte altın gol: sonraki gol kazanır. `seed` bot kararlarının tohumu (testler buna dayanır).
 */
export const MATCH = { duration: 300, teamSize: 5, kickoff: 1.2, restart: 1.2, seed: 61 };

/**
 * Gol patlaması (Rocket League usulü): gol olunca kalede patlama olur ve bütün oyuncular patlamadan uzağa fırlar;
 * `time` saniye sonra yeniden dizilip santra yapılır. Fırlama hızı yakındakinde `speed`, uzaklaştıkça `falloff`
 * birim başına azalır (en az `min`); hız `drag` ile söner. Havada kalma en çok `air` saniye, tepe `height`.
 * Görünüm: şok dalgası `wave` saniyede `waveRadius`'a yayılır, ışık `flash` saniye çakar, kamera `shake` kadar sarsılır.
 */
export const GOAL_BLAST = { time: 2.2, speed: 30, falloff: 0.5, min: 6, drag: 1.4, air: 1.3, height: 4.5, wave: 0.9, waveRadius: 38, flash: 0.7, shake: 0.55 };

/**
 * Golden sonraki diziliş: saha oyuncularının rolleri karılır (insan oyuncu hep başka role geçer) ve her birinin evi
 * x'te yarı boyun `shiftX`, z'de `shiftZ` katına kadar rastgele kayar.
 */
export const LINEUP = { shiftX: 0.22, shiftZ: 0.12 };

/** Koşu, topla sürme hızı (top taşıyan yavaşlamaz), hedef hıza yaklaşma katsayısı (1/sn) ve oyuncunun duvara en çok yaklaşması. */
export const MOVE = { speed: 7, dribble: 7, accel: 16, margin: 0.6 };

/** Zıplama: havada kalma süresi ve tepe yüksekliği. Havadaki oyuncuya top değmez (yakar top da). */
export const JUMP = { time: 0.7, height: 1.8 };

/**
 * Enerji: dört beceri tek bir enerjiyi paylaşır: kayma (sağ tık, topsuz), yakar top (sağ tık, top sende), hızlı koşu
 * (Shift) ve rüzgar şutu (sol tık basılı). Hangisi kullanılırsa kullanılsın `cooldown` saniye hepsi birden bekler.
 */
export const ENERGY = { cooldown: 3 };

/**
 * Kayma (sağ tık, topsuz): bakılan yöne kısa, hızlı atılma. Kayan oyuncu `steal` yarıçapındaki top taşıyanın topunu
 * **mutlaka** alır: taşıyanın zıplaması, korunması ya da kayanın şut beklemesi engel olmaz; boştaki normal topu da alır.
 * Kayma boyunca `guard` kadar yakar top işlemez.
 */
export const DASH = { time: 0.45, speed: 18, guard: 0.5, steal: 1.6, lift: 0.18 };

/**
 * Hızlı koşu (Shift): `time` saniye koşu (ve topla sürme) hızı `mult` katına çıkar, sonra oyuncu yorulur, normale döner.
 * Enerji geri sayımı koşu bitince başlar (art arda basılarak durmadan koşulamaz).
 */
export const SPRINT = { time: 3, mult: 1.6 };

/**
 * Şut hızları: normal (sol tık, beyaz), rüzgar (sol tık `windCharge` saniye basılı), yakar top (sağ tık basılı,
 * kırmızı ve alevli, gol olmaz, rakibi yakar) ve pas (sağ tık kısa). `reach` topun ayaktan çıktığı mesafe, `lock`
 * şutu atanın topu hemen geri yakalamaması için kısa kilit, `firePower` yakar topun ateşli kaldığı süre. Yakar top
 * özeldir: her **takım** maç boyunca yalnızca `fireShots` kez atabilir (takımdaki herkes aynı haktan harcar; kalan
 * haklar skor tabelasında iki takım için de görünür).
 */
export const KICK = { normal: 29, wind: 38, fire: 27, pass: 20, cooldown: 0.32, lock: 0.18, reach: 0.95, firePower: 1.25, windCharge: 2, fireShots: 5 };

/**
 * Yakar top sineması (yalnızca görünüm; simülasyon aynı kalır, yalnızca zaman ölçeklenir). Yakar top çıkınca oyun
 * `ignite` saniye donar ve top ayakta alev alır; sonra top `flightScale` hızında (ağır çekim) uçar, en çok `flightMax`
 * gerçek saniye; birine çarparsa çarpma `impact` saniye `impactScale` hızında (daha ağır) gösterilir. Bu sırada kamera
 * topa döner, sinema bitince eski bakışına geri döner. Süreler gerçek saniyedir.
 * İnsan oyuncu için tutuşma nişan evresidir: top sendeyken sağ tık `hold` saniyeden uzun basılı kalınca oyun donar,
 * en çok `aim` saniye fareyle nişan alınır; sağ tık bırakılınca (ya da sol tık / süre dolunca) yakar top çıkar. Daha kısa
 * basış pastır. Vurulan oyuncu kenara gitmeden önce `knock` simülasyon saniyesi çarpma noktasında geriye savrulur.
 */
export const CINEMA = { hold: 2, aim: 2.5, knock: 0.45, ignite: 0.8, flightScale: 0.35, flightMax: 2.6, impact: 0.9, impactScale: 0.15, turn: 7 };

/**
 * Rüzgar topu: `power` saniye boyunca rüzgarlıdır. Bu sürede yavaşlaması azdır (`friction`), değdiği rakipleri
 * yoluna dik yönde savurur (`push` hızıyla `knock` saniye) ve rakipler onu tutamaz; her savuruşta hızının `keep`
 * katı kalır. Gol olur. Süre bitince normal topa döner.
 */
export const WIND = { power: 0.9, friction: 0.1, push: 12, knock: 0.35, keep: 0.85 };

/**
 * Top: sürtünme (1/sn), duvar sekmeleri, boştaki topu yakalama yarıçapı (`catch`, oyuncudan topa), yakar topun yaktığı ve
 * rüzgar topunun savurduğu yarıçap (`hit`, daha dar), taşırken ayak önündeki mesafe, ateşi sönen topun yavaşlaması
 * ve yakalayanın kısa korunması. Hızlı top adımı `substep` uzunluğunda parçalara bölünür (oyuncuların içinden geçmesin).
 */
export const BALL = { friction: 0.38, sideBounce: 0.88, endBounce: 0.8, catch: 1.3, hit: 0.85, hold: 0.7, fireFade: 0.65, catchGuard: 0.22, substep: 0.3 };

/**
 * Top kapma: yürüyen oyuncu taşınan **topa** `reach` kadar yaklaşınca kapar; topu kaptıran `stun` saniye sersemler
 * (kayarak çalınırsa `dashStun`): yerinden kıpırdayamaz, şut / pas / kayma / koşu / zıplama yapamaz, topu geri kapamaz ve
 * yakalayamaz. `loserCooldown` topu kaybedenin şut beklemesi, `guard` kapanın kısa korunması. Düz koşuyla top yalnızca
 * taşıyanın önünden ya da yanından kapılır:
 * kapan taşıyanın bakışına göre `behindDot` gerisindeyse (arkadan) ancak hızlı koşudaysa kapar; kayma her yönden çalar.
 * Çalınan top `lock` saniye kimse tarafından yeniden çalınamaz (karşılıklı kaymalar topu her karede el değiştirmesin).
 */
export const STEAL = { reach: 1.1, loserCooldown: 0.65, guard: 0.25, stun: 2, dashStun: 1.5, behindDot: -0.3, lock: 0.3 };

/** Yanma: kenarda bekleme, çarpan topun kalan hızı ve kilidi, sahaya dönüşteki ve başlama vuruşundaki korunma. */
export const BURN = { time: 4, ballKeep: 0.12, ballLock: 0.2, returnGuard: 1.5, kickoffGuard: 1 };

/**
 * Bot kararları: topa en yakın bot top `sprintRange`'den uzaksa ve enerjisi hazırsa hızlı koşar; rakip taşıyana
 * `dashRange` kadar yaklaşınca `dashChance` ile üstüne kayar (düz koşuyla arkadan top alınmaz). Top bendeyken `think` +
 * rastgele `thinkJitter` aralıkla karar verir. Kaleye `shootRange` kala şut, `fireRange` içindeki rakibe `fireChance` ile
 * yakar top, `passChance` ile ileri pas. Üstüne rakip gelince (`pressure` içinde ve yaklaşıyor) `reactMin`-`reactMax`
 * saniye arası rastgele bir gecikmeyle `escape` ağırlıklarından birini seçer: sürmeye devam (baskı yapandan uzağa döner,
 * `commit` saniye kararında kalır; bu sürede önden kapılabilir), boştaki arkadaşa pas (`passRange` içinde), `wallAhead`
 * ileriye duvardan sektirme, şut (kaleye yakınsa çok daha olası) ya da yakar top.
 * Yakar top `dodgeRange` içindeyse `dodgeChance` ile kaçar. Kaleci top kalesine `keeperRange` yaklaşınca çıkar.
 */
export const BOT = { think: 0.5, thinkJitter: 0.35, threat: 9, shootRange: 16, fireRange: 7, fireChance: 0.24, pressure: 4.5, reactMin: 0.15, reactMax: 0.6, commit: 0.6, escape: { dribble: 3.5, pass: 2.5, wall: 1.5, shoot: 1.5, fire: 1 }, passRange: 26, wallAhead: 9, passChance: 0.2, dodgeRange: 10, dodgeChance: 0.25, keeperRange: 5, sprintRange: 12, dashRange: 4, dashChance: 0.35 };

/**
 * Omuz kamerası: oyuncunun `back` gerisinde, `side` sağında ve `height` yukarıda. Fare kilitliyken yatay / dikey bakış
 * döner; nişan ekran ortasından zemine inen ışındır (`aimMax` ötesi ya da gökyüzü için `aimFallback` uzaklık). Hızlı
 * koşuda görüş açısı `sprintFov`'a genişler. Telefonda varsayılan izometrik kamera (`iso`, bkz. view/camera.js).
 */
export const CAMERA = { fov: 66, sprintFov: 77, far: 240, back: 4.6, side: 0.65, height: 2.8, pitch: 0.13, pitchMin: -0.1, pitchMax: 0.55, yawSpeed: 0.003, pitchSpeed: 0.002, aimMax: 100, aimFallback: 50,
  /**
   * İzometrik (telefonda varsayılan): futbol yayını gibi **sabit** yan açı; kamera tribün tarafında (+x) sahaya bakar, saha
   * ekranda yatay uzanır (kaleler sağda ve solda), fare / parmak açıyı değiştirmez. Kadrajın yarı yüksekliği, uzaklık, eğim
   * (rad), kadraj oyuncunun `lead` birim ötesine bakar; nişan uzaklığı ve (fare yokken) kaleye kilitlenme açısı (rad).
   */
  iso: { yaw: -Math.PI / 2, half: 14, dist: 70, elevation: 0.6, lead: 3, aimDist: 22, goalAssist: 0.5 } };

/**
 * Dokunmatik kontroller (telefon / tablet): sol yarıda parmağın değdiği yerde beliren joystick (yarıçap `stick` px,
 * `dead` altı yok sayılır); hızlı koşu yalnız KOŞ düğmesiyle başlar. Sağ yarıda ve düğmelerin üstünde parmak kaydırmak bakış / nişandır (`look` px çarpanı).
 * Mobilde görüntü hafifler: piksel oranı en çok `pixelRatio`, gölge haritası `shadow`.
 */
export const TOUCH = { stick: 60, dead: 0.14, look: 1.9, pixelRatio: 1.35, shadow: 1024 };

export const TEAMS = { names: ['MAVİ', 'TURUNCU'], colors: ['#39c2cf', '#f5825b'] };

/**
 * Çok oyunculu özellikler hangi platformda açık: tarayıcıda (web) açık; Android uygulamasında (app) kapalı, giriş
 * ekranında oda düğmeleri "Yakında" yazar. Webde de sunucuya bağlanılamazsa (evdeki PC ya da tünel kapalı) "Yakında".
 */
export const ONLINE = Object.freeze({ web: true, app: false });
/**
 * Çevrim içi oyun sunucusu (WebSocket, Cloudflare Tunnel ile evdeki PC). Oyun dosyaları Cloudflare'deki statik siteden
 * (yakargol.josephuz.com) gelir; sayfa sunucunun kendisinden açıldıysa (yerelde, Docker, aynı ağ) aynı adres kullanılır.
 */
export const SERVER = 'yakargol-sunucu.josephuz.com';
