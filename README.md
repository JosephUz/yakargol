# Yakar Gol

Three.js ile tarayıcıda çalışan, omuz kamerasından oynanan **5v5 mahalle futbolu + yakar top**. Bir insan ve dört takım
botu, beş rakip bota karşı; her takımda bir bot kaleci var. Webde **çok oyunculu** oynanır: oda kurulur, en çok on kişi
istediği koltuğa oturur, boş koltukları botlar oynar (bkz. Çok oyunculu).

## Başlatma

`Baslat.cmd` dosyasına çift tıklayın: gerekirse `npm install` yapar, sunucuyu açar ve oyunu tarayıcıda başlatır.
Alternatif: bu klasörde `npm install` ve `npm start`, ardından http://127.0.0.1:5186. Node.js gerekir.
Port değiştirmek için PowerShell'de `$env:PORT=5187; npm start`.

**Docker ile (compose)**: `docker compose up -d --build`; oyun http://localhost:5186 adresinde (yalnızca bu bilgisayardan).
`docker compose down` kapatır. Kaynak değişince yalnızca `--build` yeter, bağımlılık katmanı önbellekten gelir.
Sunucu oyun dosyalarını `no-store` ile verir; `/health` yanıtındaki `surum` alanı ayakta olan yapının damgasıdır.

**Yayın**: oyun dosyaları Cloudflare Worker'da statik site olarak durur (`npm run deploy:web`, `wrangler.jsonc` →
yakargol.josephuz.com). Evdeki PC yalnızca çevrim içi sunucudur (WebSocket odaları, çevrim içi sayısı).

**Cloudflare Tunnel (yakargol-sunucu.josephuz.com)**: `.env.example` dosyasını `.env` olarak kopyalayıp `TUNNEL_TOKEN=...` yaz ve
`docker compose --profile tunnel up -d --build`: `cloudflared` (`yakargol-tunnel`) oyun sağlıklı olunca tünele bağlanır.
Tünel konteyneri oyunun ağ alanını paylaşır (`network_mode: service:game`), bu yüzden Zero Trust → Networks → Tunnels →
tünel → **Published application routes** içindeki rota `yakargol-sunucu.josephuz.com` → `http://localhost:5186` olarak kalır.
`.env` git'e ve Docker imajına girmez. Güncelleme için aynı komut yeter; tüneli kapatmak için `docker compose --profile tunnel down`.

**Testler**: `npm test` kural testlerini (Node, tarayıcısız) koşar. Tarayıcı dumanı testi çalışan sunucuya bağlanır:
`node tests/browser-smoke.mjs` (Playwright gerekir; yolu `PLAYWRIGHT_MODULE` ile verilebilir), ekran görüntüleri `artifacts/`.
Dokunmatik kontroller için `node tests/touch-smoke.mjs` (yatay telefon taklidi, çoklu parmak). Çevrim içi için
`node tests/online-smoke.mjs` (iki sekme: oda, koltuk, taşıma, maç, yakar top nişanı, mola; uygulama kipinde "Yakında").

## Çok oyunculu

Giriş ekranında ad yazılır, **Oda kur** ya da **Odaya katıl** (kod ya da `?oda=KOD` linki). Lobide iki takımın beşer
koltuğu vardır (her takımın beşincisi kaleci): herkes boş (bot) koltuğa tıklayıp oturur, **yönetici** (kuran) oyuncuları
sürükleyip bırakır ya da oyuncuya sonra koltuğa tıklar; dolu koltukta ikisi yer değiştirir. Maçı yönetici başlatır; maç
sürerken de odaya girilir (boş koltuğa). Maçı sunucu koşturur (`server/rooms.mjs`, tarayıcıdakiyle aynı `world.js`),
sayfa girdiyi yollar, gelen durumu ara değerle çizer, kendi oyuncunu gecikmesiz göstermek için yerel girdiden kısa bir
öne kayma ekler (`src/net/`). Yakar top nişanı herkes için maçı dondurur, uçuş herkes için ağır çekimdir. Mola maçı
durdurmaz; kopan oyuncunun koltuğunu o sürede bot oynar, aynı sekmeyle geri dönünce yerine oturur. Maç bitince oda
lobiye döner. Giriş ekranı sunucuya bağlıyken çevrim içi sayısını yazar; sunucu (PC ya da tünel) kapalıysa oda düğmeleri
**Yakında** olur. Android uygulamasında çok oyunculu kapalıdır (`config.js` → `ONLINE`), düğmeler hep "Yakında"; uygulama
çevrim içi sayısına sinyalle (`/presence`) katılır.

**Android APK (Android Studio gerekmez)**: JDK 21 ve Android SDK komut satırı araçları yeter. Bu bilgisayarda
`%USERPROFILE%android` altında taşınabilir olarak kurulu (`jdk-21…`, `sdk`: platform-tools, platforms;android-36,
build-tools;36.0.0); başka yerdeyse `JAVA_HOME` / `ANDROID_HOME` ayarla. `npm run apk` oyun dosyalarını `dist/`e toplar,
Capacitor ile `android/` projesine kopyalar, Gradle ile derler: telefona kurulacak imzalı **`apk/YakarGol.apk`**, Play
Store için `apk/YakarGol.aab` ve incelemek için `apk/YakarGol-debug.apk`. Yayın anahtarı `android/yakargol-release.jks`,
şifresi `android/keystore.properties` (ikisi de git'e girmez; **yedeklenmeli**, kaybolursa Play Store'da güncelleme
yayınlanamaz). APK'yı telefona atıp açmak yeter ("bilinmeyen kaynaklardan yükleme" izni istenir; Samsung'da önce
Ayarlar → Güvenlik ve gizlilik → **Otomatik Engelleyici** kapatılmalı). USB hata ayıklama açık telefona doğrudan kurmak için
`npm run apk -- --install`. Uygulama oyunu kendi içinden açar (internetsiz oynanır), yatay ve tam ekrandır, Android
geri tuşu mola / devam olur; çok oyunculu "Yakında", çevrim içi sinyali canlı sunucuya gider. Kimlik `com.josephuz.yakargol` (Play Store'da
değiştirilemez). Simge ve açılış görseli `node scripts/icons.mjs` ile üretilir; Play Store görselleri `store/`.

## Tuşlar

| Tuş | İş |
| --- | --- |
| WASD / oklar | Baktığın yöne göre hareket. Topa yaklaşınca otomatik alırsın. |
| Fare | Bak ve nişan al (fare kilitlenir; nişan ekran ortasındaki nişangah). |
| Sol tık | Bırakınca nişangaha doğru normal (beyaz) şut. |
| Sol tık basılı (2 sn) | **Rüzgar topu**: şarj dolunca kendiliğinden çıkar. |
| Sağ tık | Top sendeyken **kısa bas: pas**, **2 sn basılı tut: yakar top** (oyun durur, 2,5 sn nişan al, bırak); topsuzken topa doğru **kayma** (basılan yön ne olursa olsun). |
| Shift | 3 saniye **hızlı koşu** (rüzgar çizgileri, geniş kamera açısı), sonra yorulur normale dönersin (enerji koşu bitince dolmaya başlar). |
| Boşluk | Zıpla; havadayken yakar top seni yakamaz. |
| V / 🎥 | Kamera: omuz ↔ **izometrik** (masaüstünde omuzla başlar, seçim hatırlanır). İzometrik futbol yayını gibi sabit yan açıdır (fare / parmak açıyı döndürmez, topa çevrilmez); masaüstünde fare kilitlenmez, şut / pas / yakar top imlecin sahadaki noktasına gider; telefonda nişan hareket / bakış yönü, rakip kaleye dönüksen kale. Yerde ok gösterir. |
| F1 / Esc | Yardım / mola (Esc fareyi de bırakır; odak kaybında oyun durur). |

**Dokunmatik (telefon, tablet, Android uygulaması)**: dokunmatik ekran algılanınca açılır (`?touch=1` ile masaüstünde de).
Ekran yatay; dik tutunca "yan çevir" uyarısı çıkar. Tarayıcıda maça girerken tam ekrana geçer.

| Dokunuş | İş |
| --- | --- |
| Sol yarı | Parmağın değdiği yerde **joystick** belirir (analog). Hızlı koşu yalnız **KOŞ** düğmesiyle. |
| 🎥 | Telefonda **izometrik** kamerayla başlar (yukarıdan eğik, oyuncu ortada); nişan koştuğun / baktığın yön, rakip kaleye dönüksen kalenin ortası, yerde ok gösterir. 🎥 omuz kamerasına geçirir (seçim hatırlanır). Masaüstünde omuzla başlar, V ya da 🎥 ile geçilir. Ayarlar `CAMERA.iso`. |
| Sağ yarı | Parmak kaydırmak kamerayı çevirir (omuzda bakış / nişan, farenin karşılığı). |
| ŞUT | Dokun: şut; basılı tut: rüzgar topu. Basılıyken parmağı kaydırmak nişan alır. |
| PAS / KAY | Top sendeyken dokun: pas; 2 sn basılı tut: yakar top nişanı (izometrikte joystick, omuzda parmakla nişan al, bırak). Topsuzken: topa doğru kay. |
| ZIPLA / KOŞ | Boşluk / Shift. Düğmelerde enerji dolumu görünür. |

Telefonda dolum halkası ve enerji / sersemlik göstergesi karakterin üstünde değil ekranın altındadır. Top ekranda değilse ekranın kenarında topun yönünü gösteren işaret çıkar (yakar topta kırmızı), top görününce kaybolur. Koşarken karakter gittiği yöne döner, dururken nişana. Mobilde görüntü hafifler (piksel oranı, gölge haritası), önemli anlarda kısa titreşim olur. Ayarlar `TOUCH` (config.js).

## Kurallar

Maç 5 dakika; yalnız goller puan verir, beraberlikte **altın gol**. Saha 52×80 birim; aut yok, top duvardan seker.

- **Enerji**: kayma, hızlı koşu, yakar top ve rüzgar şutu tek enerjiyi paylaşır. Hangisi kullanılırsa kullanılsın hepsi
  birden **3 saniye** bekler. Geri sayım karakterinin sırtında görünür (dolunca kısa bir "HAZIR"); sol alttaki kart
  da gösterir. Enerji yokken sol tıkı basılı tutarsan şarj dolu bekler: enerji gelince rüzgar topu çıkar, önce bırakırsan
  normal şut.
- **Dolum halkası**: sol tık ya da sağ tık basılıyken nişangahın çevresinde halka dolar ve hangi vuruşun hazırlandığını
  yazar (camgöbeği rüzgar, turuncu yakar top; yapılamıyorsa gri ve sebebi). Ayaktaki top da vuruşun rengine bürünür.
- **Yakar top** hakkı **takımındır**: her takım maç boyunca **5 kez** atar (takımdaki herkes aynı haktan harcar). İki
  takımın kalan hakları skor tabelasında alev damlalarıyla görünür. Sağ tık 2 saniye dolunca oyun
  durur, top ayağında alev alır ve 2,5 saniye fareyle nişan alırsın; sağ tıkı bırakınca (ya da sol tık / süre dolunca) top
  çıkar. Bot atınca oyun 0,8 saniye donar. Sonra sinema şeritleri arasında top **ağır çekimde** uçar ve kamera onu izler;
  birine çarparsa çarpma daha da ağır çekimde, vurulan geriye savrulup düşerek gösterilir. Sinema bitince kamera eski
  bakışına döner.
- Yakar top doğrudan gol olmaz; değdiği rakibi 4 saniye kenara gönderir, top boşta kalır. Dönüşte kısa korunma vardır.
- **Rüzgar topu** normalden hızlıdır, az yavaşlar; gücü sürerken yolundaki rakipleri kenara savurur, rakipler onu tutamaz
  ve gol olur.
- **Top kapma** topa yakınlıkla olur: taşınan topa 1,1 birim yaklaşınca kaparsın, boştaki topu 1,3 birimden yakalarsın.
  Topu **yürüyerek kaptıran 2 saniye**, **kayarak kaptıran 1,5 saniye sersemler**: kıpırdayamaz, şut / pas / kayma / koşu /
  zıplama yapamaz, topu geri kapamaz; başında yıldızlar döner, kendi süren sırtında görünür.
- **Kayma** yaklaşık 8 birim gider; karakter geriye yatıp bir bacağı önde kayar. Top taşıyana dokunursan topu **mutlaka** çalarsın (zıplaması ya da korunması engel olmaz); boştaki topu da alırsın.
- Top taşıyan **yavaşlamaz**. Düz koşuyla top yalnızca **önden ya da yandan** kapılır; arkadan yetişen ancak bir
  beceriyle alır: **hızlı koşu** (Shift) ile yetişip kapar ya da **kayarak** kesin çalar. Çalınan top 0,3 saniye yeniden
  çalınamaz. Botlar da arkadan kovalarken hızlı koşar ve üstüne kayar.
- **Gol patlaması** (Rocket League usulü): gol olunca kalede takım renginde bir patlama olur, sahaya şok dalgası
  yayılır, kamera sarsılır ve **bütün oyuncular** patlamadan uzağa, havada takla atarak fırlar (kaleye yakın olan daha
  uzağa). 2,2 saniye sonra herkes yeniden dizilir ve santra yapılır.
- **Golden sonra** iki takımda da saha oyuncularının rolleri (forvet, kanatlar, defans) karılır ve başlangıç noktaları biraz
  kayar; kaleciler yerinde kalır. Sen de her golden sonra başka bir mevkiden başlarsın. Başlama vuruşunu forvet yapar.
- **Baskı altındaki bot** (üstüne rakip geliyorsa) 0,15-0,6 saniyede tepki verir ve rastgele seçer: çoğu zaman topu
  **sürmeye devam** eder (senden uzağa döner; önden kapabilirsin), ya da boştaki arkadaşa pas, duvardan sektirme, şut
  (kaleye yakınsa daha olası) veya nadiren yakar top. Botlar üstüne daha seyrek kayar.
- Topu taşıyan şut yönüne, diğer herkes **topa bakar**. Oyuncu her doğduğunda (maç başı, golden sonra orta yuvarlakta,
  kenardan dönüşte) kamera topa çevrilir.

Maç sonunda oyuncu istatistikleri (gol, pas, yakma, top kapma, kurtarış) gösterilir.

## Dosyalar

Simülasyon ile görünüm ayrıdır: `src/world.js` ve ona bağlı modüller DOM ve three.js olmadan (Node'da da) koşar ve
olayları `w.events`'e yazar; tarayıcıda `src/view/` dünyayı çizer, `src/main.js` olayları efekt, ses ve mesaja çevirir.

| Dosya | Sorumluluk |
| --- | --- |
| `index.html`, `style.css` | Tam ekran düzen: sahne, tabela, oyuncu kartı, karakterin sırtındaki gösterge, ekranlar (giriş, yardım, mola, maç sonu) |
| `game.js` | Giriş; `src/main.js`'i yükler (import map: `three` → `/vendor/three.module.js`), hata olursa okunur mesaj |
| `server.mjs` | Sunucu: oyun dosyaları, `src/`, `/vendor` (three paketi), `/health`, `/presence`, WebSocket |
| `server/rooms.mjs` | Odalar: koltuklar, yönetici taşıması, otoriter maç döngüsü, yakar top sineması, geri bağlanma |
| `src/net/protocol.js`, `src/net/snapshot.js`, `src/net/client.js` | Ağ sözlüğü, durum paketi, çevrim içi istemci (ara değer, öne kayma) |
| `src/lobby.js`, `src/platform.js` | Giriş ekranı oda düğmeleri ve lobi; platform (uygulama / web) ve sunucu adresi |
| `src/config.js` | Tüm ayar sayıları (saha, maç, hareket, enerji, kayma, hızlı koşu, şutlar, rüzgar, top, yanma, botlar, kamera) |
| `src/world.js` | **Simülasyon**: dünya kurulumu, sabit adım, girdiyi eyleme çevirme (sol tık şarjı), hareket, saat ve altın gol |
| `src/actions.js` | Oyuncu eylemleri: zıplama, kayma, hızlı koşu, şut (normal / rüzgar / yakar / pas), pas hedefi seçimi |
| `src/ball.js` | Top: taşıma ve kapma, sekme, gol, yakalama, yakma, rüzgarla savurma |
| `src/ai.js` | Bot kararları: kaleci, topa koşan (hızlı koşu, kayma), yer tutan; şut / yakar top / pas; baskı altında kaçış (şut, yakar top, boştaki arkadaşa pas, duvardan sektirme); yakar toptan kaçış |
| `src/lineup.js` | Diziliş: rollere göre ev konumları, hücum yönü, golden sonra rollerin karılması ve yeniden diziliş |
| `src/rng.js`, `src/math.js` | Tohumlu rastgelelik; küçük yardımcılar |
| `src/input.js` | Klavye ve fare, fare kilidi, basışların bir kez tüketilmesi; dokunmatik düğmeleri aynı basışlara bağlar |
| `src/touch.js` | Dokunmatik kontroller: joystick, sağ yarı bakış, ŞUT / PAS / ZIPLA / KOŞ düğmeleri, tam ekran |
| `src/ui.js` | Arayüz: ekranlar, tabela, oyuncu kartı, mesaj, sırttaki enerji / rüzgar göstergesi, maç sonu tablosu |
| `src/audio.js` | Kısa sentez sesler |
| `src/main.js` | Uygulama: ekran akışı, sabit adım döngüsü, olayların tüketilmesi, test kancası (`?test`) |
| `src/view/view.js` | Görünüm: renderer, ışıklar, sahne bileşenlerinin toplanması, kare çizimi |
| `src/view/camera.js` | Omuz kamerası: takip, bakış, nişan ışını, bakış yönlü hareket, topa dönme |
| `src/view/pitch.js` | Saha ve çevresi (kaleler, duvarlar, tel örgü, apartmanlar, ağaçlar) |
| `src/view/actors.js` | Oyuncu modelleri, animasyon, topa bakma, isim etiketleri |
| `src/view/ballview.js` | Top görseli: beyaz, alevli yakar top, rüzgar halkalı rüzgar topu |
| `src/view/effects.js` | Parçacıklar (şut, yanma, savrulma, gol) |
| `src/view/builders.js` | Sahne yapı taşları (malzeme, kutu, silindir, çizgi, tabela) |
| `tests/world.test.mjs` | Kural testleri |
| `tests/browser-smoke.mjs` | Tarayıcı dumanı testi |
| `tests/touch-smoke.mjs` | Dokunmatik dumanı testi (telefon taklidi) |
| `tests/rooms.test.mjs`, `tests/online-smoke.mjs` | Oda testleri (sahte soket) ve iki sekmeli çevrim içi dumanı testi |
| `capacitor.config.json`, `android/` | Android uygulaması (Capacitor): kimlik, yatay tam ekran, titreşim izni, simgeler |
| `scripts/build-web.mjs`, `scripts/apk.mjs`, `scripts/icons.mjs` | Uygulama dosyalarını toplama, APK derleme, simge / açılış / mağaza görselleri |
