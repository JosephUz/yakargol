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

/** Zıplama: havada kalma süresi ve tepe yüksekliği. Havadaki oyuncuya top değmez (yakar pas da). */
export const JUMP = { time: 0.7, height: 1.8 };

/**
 * Enerji: kayma (sağ tık, topsuz) ve hızlı koşu (Shift) tek bir enerjiyi paylaşır; hangisi kullanılırsa kullanılsın
 * `cooldown` saniye ikisi birden bekler. Yakar pas ve rüzgar şutu enerjiden bağımsızdır (yalnız takım hakkı).
 */
export const ENERGY = { cooldown: 3 };

/**
 * Kayma (sağ tık, topsuz): bakılan yöne kısa, hızlı atılma. Kayan oyuncu `steal` yarıçapındaki top taşıyanın topunu
 * **mutlaka** alır: taşıyanın zıplaması, korunması ya da kayanın şut beklemesi engel olmaz; boştaki normal topu da alır.
 * Kayma boyunca `guard` kadar yakar pas işlemez.
 */
export const DASH = { time: 0.45, speed: 18, guard: 0.5, steal: 1.6, lift: 0.18 };

/**
 * Hızlı koşu (Shift): `time` saniye koşu (ve topla sürme) hızı `mult` katına çıkar, sonra oyuncu yorulur, normale döner.
 * Enerji geri sayımı koşu bitince başlar (art arda basılarak durmadan koşulamaz).
 */
export const SPRINT = { time: 3, mult: 1.6 };

/**
 * Şut hızları: normal (sol tık, beyaz), rüzgar (sol tık `windCharge` saniye basılı → nişan → bırak), yakar pas (sağ tık
 * basılı → nişan → bırak; kırmızı ve alevli, nişana en yakın takım arkadaşına kilitlenir ve mutlaka ona varır, yol
 * boyunca değdiği her rakibi yakıp kenara yollar, durmaz; gol olmaz) ve pas (sağ tık kısa). Rüzgar topu bilerek daha
 * yavaştır: herkes kamerada izler. `reach` topun ayaktan çıktığı mesafe, `lock` şutu atanın topu hemen geri
 * yakalamaması için kısa kilit, `firePower` yakar pasın ateşli kalabileceği en uzun süre (güvenlik sınırı; normalde
 * arkadaşa varınca biter). Yakar pas da rüzgar şutu da özeldir: her **takım** maç boyunca `fireShots` yakar pas ve ayrıca `windShots` rüzgar şutu atabilir (takımdaki herkes aynı
 * haktan harcar; kalan haklar skor tabelasında iki takım için de görünür).
 */
export const KICK = { normal: 29, wind: 28, fire: 27, pass: 20, cooldown: 0.32, lock: 0.18, reach: 0.95, firePower: 4, windCharge: 1, fireShots: 5, windShots: 5 };

/**
 * Yakar pas ve rüzgar şutu sineması (bkz. cinema.js; simülasyon kuralları aynı kalır, yalnızca zaman ölçeklenir).
 * **Nişan**: top sendeyken sağ tık (yakar pas) ya da sol tık (rüzgar) `hold` saniye basılı kalınca oyun **ağır çekime**
 * (`aimScale`) geçer ve en çok `aim` gerçek saniye nişan alınır; tuş bırakılınca (ya da süre dolunca) vuruş çıkar.
 * Nişan sırasında nişan alan kıpırdamaz, herkes ağır çekimde oynamayı sürdürür: rakip **kayarak** topu ayağından alırsa
 * vuruş olmaz (yürüyerek alınamaz). Daha kısa basış: sağ tık pas, sol tık normal şut.
 * **Uçuş**: yakar pas `flightScale` hızında en çok `flightMax` gerçek saniye uçar, çarparsa çarpma `impact` saniye
 * `impactScale` hızında gösterilir; rüzgar topu `windScale` hızında en çok `windMax` saniye. İkisinde de herkesin
 * kamerası topu kovalar (omuzda topun `chase` birim gerisinden, gidiş yönüne `chaseTurn` hızıyla döner; izometrikte
 * kadraj topa kayar), sinema bitince kamera topa bakarak oyuncuya geçer. Botlar da dolum ve nişanla atar (bkz. BOT, ai.js).
 * Vurulan oyuncu kenara gitmeden önce `knock` simülasyon saniyesi çarpma noktasında geriye savrulur.
 */
export const CINEMA = { hold: 1, aim: 1.2, aimScale: 0.35, knock: 0.45, flightScale: 0.6, flightMax: 3, windScale: 1, windMax: 4, impact: 0.5, impactScale: 0.25, turn: 7, chase: 5, chaseTurn: 6 };

/**
 * Rüzgar topu **durdurulamaz**: yavaşlamaz (`friction`), kimse (kaleci ve takım arkadaşları dahil) onu tutamaz, değdiği
 * rakipleri havaya fırlatır: `air` saniye havada takla atarak yoluna dik yönde savrulur (`push` hızıyla `knock` saniye;
 * havadayken hiçbir şey yapamaz, topa da değemez) ve top hızının `keep` katıyla yoluna devam eder.
 * Kaleye nişan alındıysa her yerden gol olur; nişan kaleye değilse ilk duvara çarpınca normal topa döner. `power`
 * yalnız güvenlik sınırıdır (saniye).
 */
export const WIND = { power: 10, friction: 0, push: 9, knock: 0.8, air: 0.8, keep: 1 };

/**
 * Top: sürtünme (1/sn), duvar sekmeleri, boştaki topu yakalama yarıçapı (`catch`, oyuncudan topa), yakar pasın yaktığı ve
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
/**
 * Pas isteme: top ayağında değilken sol tık (dokunmatikte ŞUT / PAS İSTE) `time` saniye "PAS!" der; topu taşıyan takım
 * arkadaşı bot ise kısa bir tepkiyle (`BOT.reactMin`-`reactMax`) `BOT.callChance` ile ona pas verir.
 */
export const CALL = { time: 1.6 };

export const STEAL = { reach: 1.1, loserCooldown: 0.65, guard: 0.25, stun: 2, dashStun: 1.5, behindDot: -0.3, lock: 0.3 };

/** Yanma: kenarda bekleme, sahaya dönüşteki ve başlama vuruşundaki korunma (yakar pas yaktığında durmaz, yoluna devam eder). */
export const BURN = { time: 4, returnGuard: 1.5, kickoffGuard: 1 };

/**
 * Bot kararları: topa en yakın bot top `sprintRange`'den uzaksa ve enerjisi hazırsa hızlı koşar; rakip taşıyana
 * `dashRange` kadar yaklaşınca `dashChance` ile üstüne kayar (düz koşuyla arkadan top alınmaz). Top bendeyken `think` +
 * rastgele `thinkJitter` aralıkla karar verir. Kaleye `shootRange` kala şut, `fireRange` içindeki rakibe `fireChance` ile
 * yakar pas, `passChance` ile ileri pas. Üstüne rakip gelince (`pressure` içinde ve yaklaşıyor) `reactMin`-`reactMax`
 * saniye arası rastgele bir gecikmeyle `escape` ağırlıklarından birini seçer: sürmeye devam (baskı yapandan uzağa döner,
 * `commit` saniye kararında kalır; bu sürede önden kapılabilir), boştaki arkadaşa pas (`passRange` içinde), `wallAhead`
 * ileriye duvardan sektirme, şut (kaleye yakınsa çok daha olası) ya da yakar pas.
 * Botlar da yakar pas ve rüzgar şutunu insan gibi atar: önce `CINEMA.hold` saniye dolum (çevresinde alev / rüzgar), sonra
 * ağır çekimde `aimTime` simülasyon saniyesi nişan, sonra vuruş; bu arada kayılarak topu alınabilir. Rüzgarı rakip
 * kaleye `windRange` içinden `windChance` ile çeker. Takım arkadaşı pas isterse `callChance` ile ona verir.
 * Yakar pas üstüne gelirken (çarpmaya `fireJump.time` sn kala, `fireJump.miss` birimden yakın geçecekse) `fireJump.chance` ile
 * zıplayıp kurtulur (havadakini yakar pas yakmaz). Rakip yakar pas ya da rüzgar nişanı alırken `aimRush` içindeki saha
 * oyuncuları üstüne koşar, `aimDash` kadar yaklaşınca kayıp topu ayağından almaya çalışır. Kaleci top kalesine `keeperRange` yaklaşınca çıkar.
 * `chasers` topa koşan saha oyuncusu sayısı (1: yalnız en yakını; gösteri kipinde daha çok, bkz. GOSTERI.bot); topa
 * koşmayanlar evlerinden topa doğru `homeX` / `homeZ` oranında esner.
 */
export const BOT = { think: 0.5, thinkJitter: 0.35, threat: 9, shootRange: 16, fireRange: 7, fireChance: 0.24, pressure: 4.5, reactMin: 0.15, reactMax: 0.6, commit: 0.6, escape: { dribble: 3.5, pass: 2.5, wall: 1.5, shoot: 1.5, fire: 1 }, passRange: 26, wallAhead: 9, passChance: 0.2, fireJump: { time: 0.45, miss: 1.7, chance: 0.75 }, aimRush: 18, aimDash: 7, aimTime: 0.28, laneWidth: 1.6, windRange: 34, windChance: 0.1, callChance: 0.9, keeperRange: 5, sprintRange: 12, dashRange: 4, dashChance: 0.35, chasers: 1, homeX: 0.3, homeZ: 0.45 };

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
/** Kullanım ölçümü uç noktası (josephuz.com Worker → Analytics Engine). Yerelde / IP adresinden açılınca kapalı (platform.js → olcumUrl). */
export const OLCUM = 'https://www.josephuz.com/api/olay';

/**
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. src/gosteri.js): içerik klipleri için "kendi kendine oynayan" maç.
 * Menü atlanır, on koltuğun hepsini mevcut bot yapay zekâsı oynar, arayüz gizlenir, kamera topu ve çevresindeki
 * kalabalığı yumuşakça izler; ölçüm olayı gitmez ve sunucuya bağlanılmaz. Uygulamada (isApp) açılmaz, normal oyun
 * bu ayarlardan hiç etkilenmez.
 */
/**
 * **Otopilot** (yalnız web, `?otopilot=1`; bkz. src/otopilot.js): içerik videoları için gerçek bir maç, ama senin
 * oyuncunu da bot oynar. Gösteriden farkı maçın **normal** kurallarla ve normal bot ayarlarıyla koşmasıdır
 * (`w.gosteri` kurulmaz): burada yalnız kamera bakışının topa dönme hızı ve maç sonrası bekleme ayarlanır.
 */
export const OTOPILOT = {
  /** Maç bitince yeni maç kurulana kadar beklenen saniye (karne ekranı hiç açılmaz). */
  yenidenBasla: 2,
  /**
   * Omuz kamerasında bakışın topa dönme hızı (1/sn): otopilotun "faresi". Büyük değer kadrajı sert çevirir, küçük
   * değer topun gerisinde kalır; oyuncunun fareyle yaptığı takibe en yakın aralık 2-3'tür.
   */
  bakis: 2.6,
};

export const GOSTERI = {
  /** İlk düdük ve golden sonraki başlama beklemesi (normalde MATCH.kickoff / MATCH.restart): ilk saniyede aksiyon olsun. */
  kickoff: 0.25, restart: 0.5,
  /** Maç bitince yeni maç kurulana kadar beklenen saniye. */
  yenidenBasla: 3,
  /** Takım başına yakar pas hakkı (normalde KICK.fireShots): klip boyunca yakar pas bitmesin. */
  fireShots: 40,
  /**
   * Gösteride izometrik kadraj (CAMERA.iso üstüne yazılır): `half` normalde 14, burada daha yakın — klip telefon
   * ekranında izlendiğinde oyuncular ve top seçilsin. `lead` 0: kadraj oyuncunun ötesine değil, odağın tam üstüne bakar.
   */
  iso: { half: 10.5, lead: 0 },
  /**
   * Kamera odağı: topun ve çevresindeki oyuncuların ağırlık merkezi. `top` topun kendi ağırlığı (oyuncu başına 1'e
   * karşılık), `yayilma` oyuncunun topa uzaklığının ağırlığını yarıya indirdiği mesafe, `ilerisi` topun hızının kaç
   * saniye ötesine bakıldığı (uçan top kadrajdan kaçmasın), `yumusatma` geçişin yumuşaklığı (1/sn: büyük = daha çabuk
   * yetişir), `sinir` odağın sahada kalabileceği yarı boy.
   *
   * `sinir` neden böyle: izometrik kamera z eksenini ekranda yatay, x eksenini dikey gösterir. 16:9 kadrajda (half 10.5)
   * yatayda ±10.5·16/9 ≈ ±18.7 birim z, dikeyde ±10.5/sin(elevation) ≈ ±18.6 birim x görünür. Saha 26 x 40 yarı boyunda:
   * x'te ±9 (kamera en çok 27.6'ya bakar, yan duvarın azıcık ötesi — boş çayır dolmaz, top en kenarda bile kadrajda kalır),
   * z'de ±24 (kamera 42.7'ye kadar bakar: kale ağzı ve gol her zaman kadrajda).
   */
  kamera: { top: 6, yayilma: 8, ilerisi: 0.18, yumusatma: 2.2, sinir: { x: 9, z: 24 } },
  /**
   * Gösteride bot ayarları (yalnız bu kipte; normal oyun BOT'u kullanır, bkz. ai.js). Daha çok yakar pas, daha çok
   * kayma, daha uzaktan şut, topa iki oyuncu birden koşar ve takım topun çevresinde toplanır: klipte sürekli kargaşa olur.
   */
  bot: { ...BOT, think: 0.28, thinkJitter: 0.2, shootRange: 21, fireRange: 12, fireChance: 0.72, pressure: 6, fireJump: { time: 0.45, miss: 1.7, chance: 0.45 }, sprintRange: 7, dashRange: 5.5, dashChance: 0.75, passChance: 0.3, escape: { dribble: 2.5, pass: 2, wall: 1, shoot: 2.5, fire: 3.5 }, chasers: 2, homeX: 0.55, homeZ: 0.7 },
};

/**
 * **Rüzgar şutu gösteri sahnesi** (yalnız web, `?gosteri=ruzgar`; bkz. src/gosteri-ruzgar.js): içerik videosu için
 * sahnelenmiş tek bir vuruş — maç değil. Orta sahadaki bot rüzgar şutunu KICK.windCharge saniye yükler, kaleyle
 * arasına dizilmiş rakipleri tek tek savurur ve gol olur; sahne `bitis` saniye sonra yeniden kurulur. Kamera omuz
 * üstüdür (izometrik değil). Normal oyun ve `?gosteri=1` bu ayarlardan hiç etkilenmez.
 */
export const GOSTERI_RUZGAR = {
  /**
   * Evre süreleri (gerçek saniye): diziliş kurulduktan sonraki bekleme, golden sonraki bekleme (gol patlaması bu
   * süre boyunca sürer, bkz. gosteri-ruzgar.js olay), güvenlik üst sınırları. Toplam tur ≈ 9 sn (yükleme 1 sn + nişan; bekleme bunu dengeler): 25 sn'lik bir
   * klipte en az iki tam gol çıkar.
   */
  hazir: 2.6, bitis: 3.3, yuklemeEnCok: 4, ucusEnCok: 5,
  /**
   * Sahneye özel top ayarı: rüzgar topu normalde WIND.power (0,9 sn) sonra sıradan topa döner. Orta sahadan atılan
   * şutun kaleye varması bundan uzun sürer; rüzgar bitince kalan rakipler topu yakalar ve sahne golsüz kalırdı.
   * Burada top `ruzgar` saniye rüzgarlı kalır: dizilen beş rakibin hepsi savrulur ve her tur gol olur. Mekanik aynıdır
   * (savurur, tutulamaz, gol olur), yalnız süresi sahne için uzatılır — ve yalnız bu adreste.
   */
  ruzgar: 2.6,
  /** Savrulan rakip (yalnız bu sahnede): WIND.knock yerine `knock` saniye savrulur, `air` saniye havada takla atar. */
  savrulma: { knock: 0.8, air: 0.85 },
  /** Ağır çekim: ilk çarpmada ve golde `sure` gerçek saniye boyunca simülasyon `olcek` hızında akar. */
  agir: { olcek: 0.35, sure: 0.6 },
  /** Şutu atan: orta sahada, x'te ±`x`, z'de `z` ± `jitter` (dünyanın tohumlu rastgelesi; her tur hafif değişir). */
  atan: { x: 4, z: 3, jitter: 1.5 },
  /** Nişan: kale ağzında ±`x` (PITCH.goal 5,8'den içeride, top hep ağa girer), kale çizgisinin `pay` birim gerisi. */
  hedef: { x: 3, pay: 2 },
  /**
   * Rakip dizilişi: şut çizgisi üstünde, şutçuyla kale arasının `ilk` ile `son` oranları arasında eşit aralıklı beş
   * rakip (kaleci en sonda, kaleye en yakın). Her birinin yeri ±`jitter` oranında kayar ve çizgiden `sapma` birim
   * yana durur — BALL.hit (0,85) içinde kalır, yani top hepsine değer. Yan kayma sırayla sağa ve sola: rakipler
   * sıra sıra iki yana savrulur.
   */
  dizi: { ilk: 0.1, son: 0.86, jitter: 0.03, sapma: [0.3, 0.6] },
  /** Takım arkadaşları: şut çizgisinin `x` kadar yanında, `z` kadar ilerisinde durup izler (topa değmezler). */
  arkadas: { x: [9, 13], z: [3, 18] },
  /** Şutu atanın korunması (saniye): sahnelenmiş vuruş çalınamasın diye kimse topu kapamaz (bkz. ball.js carry). */
  koruma: 60,
  /** Bu sahnede omuz kamerası daha geride ve yukarıdadır (CAMERA.back / side / height üstüne yazılır). */
  omuz: { back: 7.6, side: 1.2, height: 3.9 },
  /**
   * Kamera: `pitch` eğim (rad), `sapma` her turdaki açı oynaması (rad), `iz` odağın topun kaç birim gerisinde
   * durduğu (top giderken kamera onu bu mesafeden izler), `yumusatma` odağın yumuşaklığı (1/sn), `sinir` odağın
   * sahada kalabileceği yarı boy (kamera ağın arkasına geçmesin).
   */
  kamera: { pitch: 0.12, sapma: 0.08, iz: 5.5, yumusatma: 4, sinir: { x: 14, z: 36 } },
  /** Yükleme sırasında şutu atanın çevresine saçılan rüzgar kıvılcımlarının aralığı (saniye). */
  kivilcim: 0.18,
};

/**
 * **"Rüzgar ile Ateş" gösteri sahnesi** (yalnız web, `?gosteri=ruzgar-ates`; bkz. src/gosteri-ates.js): dikey short
 * için **baştan sona sahnelenmiş**, saniyesi müziğe çivilenmiş bir anlatım — maç değil, hatta rüzgar sahnesi gibi
 * yarı sahnelenmiş bir vuruş da değil. Oyuncuların yeri, topun yeri ve kamera her karede sahne tarafından yazılır;
 * simülasyon koşmayı sürdürür ama sahneyi sürüklemez. Böylece çekim (ajanlar/icerik/short-uret.mjs, sahte saat +
 * kare kare ekran görüntüsü) kare kare yeniden üretilebilir ve müziğin vuruşlarından kaymaz.
 *
 * Saniyeler `calisma/icerik/muzik/short/liste.json` → `short-yakar-gol-ruzgar-ile-ates.isaretler` ile birebir aynıdır.
 * Normal oyun, `?gosteri=1` ve `?gosteri=ruzgar` bu ayarlardan hiç etkilenmez.
 */
export const GOSTERI_ATES = {
  /**
   * Müziğin işaretleri (saniye). `ilkTemas` topun yere **ilk** değdiği an — 128 BPM'de 3. vuruş. Müziğe hizalanan
   * tek temas budur: topun atılış hızı bunu tutturacak biçimde hesaplanır, kalan sekmeleri fizik belirler
   * (bkz. gosteri-ates.js dususYolu — sabit yerçekimi, her sekmede enerji kaybı). Sekmeleri tek tek vuruşlara
   * oturtmak yapay duruyordu (Yusuf, 8 Ekim).
   * `inis` top durur ve iki oyuncu yanlardan kayarak gelir; aynı karede **iki yükleme birden** başlar ve
   * `yapisma`ya kadar birlikte büyür. `hucum` topun kameraya doğru fırladığı an; `yapisma` topun lense çarptığı an;
   * `dusus` topun lensten aşağı düşmeye başlaması; `takimlar` 5'e 5 diziliş ve büyük "YAKAR GOL" başlığı;
   * `bitis` oyun görüntüsünün son saniyesi (sonrası ffmpeg'in josephuz.com kapanışı).
   * `tekrar` sahnenin baştan kurulduğu saniye: çekim `bitis`te kesildiği için yalnız tarayıcıda açık bırakıldığında
   * (ve duman testinde) işe yarar.
   */
  isaret: { inis: 3.75, ilkTemas: 1.40625, hucum: 11.05, yapisma: 11.25, dusus: 11.55, takimlar: 12.19, bitis: 16.2, tekrar: 18.7 },
  /**
   * Kadrajlar: `x,y,z` kameranın yeri, `tx,ty,tz` baktığı nokta (bkz. view/camera.js setPose — bu sahnede kamera
   * omuz kuralına değil doğrudan bu değerlere oturur).
   *  - `dusus` açılış: sahanın sağ üst köşesinden kaleye bakar; top tam buradan, lensin önünden ortaya iner.
   *  - `yan` → `yanSon` yükleme boyunca yandan: iki oyuncu yan profilde, top ortalarında; kamera yavaşça yaklaşır.
   *  - `takim` → `takimSon` kapanış: iki takım yanlarda, ortada başlık; kamera hafifçe geri ve yukarı kayar.
   * `gecis` düşüş kadrajından yan kadraja yumuşak geçişin başı ve sonu (saniye).
   */
  kamera: {
    dusus: { x: 5.5, y: 10.5, z: 15, tx: 0, ty: 1.2, tz: -5 },
    yan: { x: 0, y: 3.6, z: 8.4, tx: 0, ty: 1.1, tz: 0 },
    yanSon: { x: 0, y: 2.9, z: 6.2, tx: 0, ty: 1, tz: 0 },
    // Kapanış kadrajı sahanın ortasından 6 birim ileride durur: saha ortasındaki "YAKAR GOL" zemin tabelası
    // (bkz. view/pitch.js badge, z 5,9-8,1) kameranın arkasında kalsın — yoksa kadrajın altında yarım kesilirdi.
    takim: { x: 0, y: 6.2, z: 6, tx: 0, ty: 1.2, tz: -8.4 },
    takimSon: { x: 0, y: 6.8, z: 7.4, tx: 0, ty: 1.3, tz: -8.8 },
    gecis: [2.5, 3.6],
  },
  /**
   * Top: `ileri` / `alt` açılışta topun lensin kaç birim önünde ve altında doğduğu (lensin tam önünde doğsa ekranı
   * kaplar, kaleye bakan kadraj hiç görünmezdi), `yer` durduğu nokta, `havada` yükleme boyunca yerden kalktığı
   * yükseklik (yüklenen top iki oyuncunun arasında havalanır), `lens` yapışma anında kameraya uzaklığı. 0,95'te
   * 0,38 yarıçaplı top kadrajı enine tamamen, boyuna üçte ikisinden fazla kaplar: ekranı doldurur ama topluluğu
   * da gösterir — daha yakında (0,6) kadraj soyut renk lekelerine dönüyor, top olduğu anlaşılmıyordu.
   *
   * Açılıştaki düşüşün fiziği (bkz. gosteri-ates.js dususYolu):
   *  - `yercekimi` sabit yerçekimi (birim/sn²). Oyunun kendi değeri: parçacıklar `vy -= dt * 12` ile düşer
   *    (bkz. view/effects.js). Simülasyonun topu hep yerde yuvarlandığı için ball.js'te dikey eksen yoktur.
   *  - `sekme` dikey geri sıçrama katsayısı: her temasta dikey hızın kalan oranı, yani her sekme bir öncekinden
   *    daha alçak ve daha kısa olur.
   *  - `yatay` her temasta yatay hızın kalan oranı (sürtünme): top sekerken yavaşlar.
   *  - `durak` bu dikey hızın altında artık sekmez, son parçayı yuvarlanarak alır ve `inis`te tam `yer`de durur.
   */
  top: { ileri: 1.5, alt: 0.55, yer: { x: 0, z: 0 }, yercekimi: 12, sekme: 0.52, yatay: 0.6, durak: 1.2,
    havada: 0.55, lens: 0.95, son: { x: 0, z: -5.5 } },
  /**
   * Karşılıklı iki oyuncu: topun `x` birim solunda ve sağında, `giris` birim uzaktan `kayma` saniyede kayarak gelir
   * (kayma pozu için bkz. view/actors.js `p.dash`). `dolum` yüklemenin `yapisma` anındaki değeri: iki yükleme de
   * `inis`te **aynı karede** başlar, birlikte büyür ve burada birlikte dolar (Yusuf, 8 Ekim: sırayla gelen
   * sahneleme kaldırıldı). `taban` yüklemenin ilk karedeki değeri: sıfırdan başlasaydı iki çevre de ilk saniyelerde
   * görünürlük eşiğinin (view/actors.js, 0,12) altında kalır ve "aynı anda başladı" hiç görülmezdi. `egri`
   * büyümenin üssü: 1'den büyük olduğu için dolum sona doğru hızlanır — tırmanış duygusu buradan gelir.
   */
  ikili: { x: 1.15, giris: 4.2, kayma: 0.55, dolum: 1, taban: 0.22, egri: 1.3 },
  /**
   * Kapanış dizilişi: her takımın beş oyuncusu kameradan uzaklaşan bir sıra hâlinde, soldakiler -x'te sağdakiler
   * +x'te. İlk oyuncu (`ilkX`, `ilkZ`) kameraya en yakın; her sıradaki bir sonraki `adimX` kadar daha kenara,
   * `adimZ` kadar daha uzağa durur — dikey kadrajda ortada başlığa yer kalır. `uzak` düşüş ve yükleme evrelerinde
   * sahnede olmayan sekiz oyuncunun kalenin önünde beklediği z.
   */
  dizilis: { ilkX: 1.5, adimX: 0.75, ilkZ: -5.5, adimZ: -1.5, uzak: -19 },
};
