# Yakar Gol

Three.js ile tarayıcıda çalışan, omuz kamerasından oynanan **5v5 mahalle futbolu + yakar pas**. Bir insan ve dört takım
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

**Testler**: `npm test` kural ve "ana ekrana ekle" testlerini (Node, tarayıcısız) koşar. Tarayıcı dumanı testi çalışan
sunucuya bağlanır: `node tests/browser-smoke.mjs` (Playwright gerekir; yolu `PLAYWRIGHT_MODULE` ile verilebilir), ekran
görüntüleri `artifacts/`.
Dokunmatik kontroller için `node tests/touch-smoke.mjs` (yatay telefon taklidi, çoklu parmak). Çevrim içi için
`node tests/online-smoke.mjs` (iki sekme: oda, koltuk, taşıma, maç, yakar pas nişanı, mola; uygulama kipinde "Yakında").
Gösteri kipi için `node tests/gosteri-smoke.mjs`, rüzgar şutu gösteri sahnesi için `node tests/gosteri-ruzgar-smoke.mjs`.
Üst çubuktaki tam ekran düğmesinin dar yatay telefonda yerini ölçen test kendi sunucusunu açar: `npm run test:tamekran`.

**Telefonda adres çubuğu**: oyun **ana ekrana eklenebilir** (`manifest.webmanifest`, Android'de "Uygulama olarak
yükle", iOS'ta Paylaş → Ana Ekrana Ekle) — o kısayoldan açılınca tam ekran ve yatay başlar, adres çubuğu hiç çıkmaz.
Sekmede kalanlar için üst çubukta **tam ekran** düğmesi var (`#yg-full`, sarı): maça girerken oyun zaten tam ekrana
geçtiği için (`src/touch.js` → `enterFullscreen`) düğmenin işi giriş ekranı ile lobidir, maç başlayınca `← josephuz.com`
gibi gizlenir ve skor tabelasına yer bırakır. Masaüstünde (orada F11 var) ve Play Store uygulamasında (`isApp`,
kaldıracak tarayıcı çubuğu yok) hiç görünmez.

## Gösteri kipi (içerik klipleri)

`https://yakargol.josephuz.com/?gosteri=1` **yalnız tarayıcıda** (uygulamada değil) oyunu kendi kendine oynatır: menü ve
lobi atlanır, on koltuğun hepsini mevcut bot yapay zekâsı oynar (insan koltuğu dahil), başlama beklemeleri kısalır ve
botlar yalnız bu kipte saldırganlaşır (daha çok yakar pas, kayma ve uzaktan şut — bkz. `config.js` → `GOSTERI.bot`), yakar
top hakkı bollaşır. Kamera topun ve çevresindeki kalabalığın ağırlık merkezini yumuşakça izler, kadraj telefon ekranı
için yakındır; yakar pas ağır çekimi bu kipte de çalışır. Arayüz gizlidir (köşede küçük oyun adı kalır), girdi okunmaz,
ölçüm olayı gitmez, sunucuya hiç bağlanılmaz ve telefonda titreşim çalışmaz. Maç bitince birkaç saniye sonra yenisi
kurulur: kip girdisiz döner durur. Her maç **rastgele tohumla** kurulur (normal maçta tohum sabittir, `MATCH.seed`):
girdi olmadığı için sabit tohumda her maç birebir aynı maçın tekrarı olur, klipler birbirinin kopyası çıkardı.
Normal oyun ve çevrim içi maç bu ayarlardan hiç etkilenmez. Kod: `src/gosteri.js`.

### Rüzgar şutu sahnesi (`?gosteri=ruzgar`)

`https://yakargol.josephuz.com/?gosteri=ruzgar` maç değil, rüzgar şutunu anlatan **sahnelenmiş** bir vuruştur (içerik
videosu için). Bir bot orta sahada topla durur; rakipler (kaleci dahil) kaleyle onun arasına, topun yolu üstüne
dizilir ve kıpırdamaz — top çalmaz, saldırmaz; takım arkadaşları da yanlarda durup izler. Bot sol tıkı 1 saniye basılı
tutmuş gibi rüzgar şutunu yükler (top camgöbeğine döner, çevresine rüzgar kıvılcımları saçılır), sonra kaleye vurur:
top yoldaki beş rakibi tek tek savurur ve gol olur. İlk çarpmada ve golde kısa ağır çekim olur; ekranda yalnız bu
sahneye özel, büyük bir açıklama yazısı durur (yükleme: "Sol tık 1 sn basılı: RÜZGAR ŞUTU", çarpma: "Önüne çıkanı
savurur!"). Yazı bilerek kadrajın orta yatay bandında ve yanlardan içeridedir: içerik betiği 16:9 kaydı dikey videoya
keserken yanlardan ~%15 kırpar ve üst / alt kısma kendi yazısını koyar.

Kamera `?gosteri=1`den farklı olarak **omuz üstüdür** (izometrik değil): şutçunun arkasından kaleye bakar, top
giderken onu yumuşakça izler. Sahne ~9 saniyede bir yeniden kurulur ve döner; her turda diziliş, şut yönü ve kamera
açısı hafif değişir, böylece 25 saniyelik bir klipte en az iki tam gol çıkar ve turlar birbirinin kopyası olmaz.
Arayüzün gizli olması, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması `?gosteri=1` ile ortaktır.
`?gosteri=1` ve normal oyun bu sahneden hiç etkilenmez. Kod: `src/gosteri-ruzgar.js`, ayarlar `config.js` →
`GOSTERI_RUZGAR`.

## Çok oyunculu

Giriş ekranında ad yazılır, **Oda kur** ya da **Odaya katıl** (kod ya da `?oda=KOD` linki). Lobide iki takımın beşer
koltuğu vardır (her takımın beşincisi kaleci): herkes boş (bot) koltuğa tıklayıp oturur, **yönetici** (kuran) oyuncuları
sürükleyip bırakır ya da oyuncuya sonra koltuğa tıklar; dolu koltukta ikisi yer değiştirir. Maçı yönetici başlatır; maç
sürerken de odaya girilir (boş koltuğa). Maçı sunucu koşturur (`server/rooms.mjs`, tarayıcıdakiyle aynı `world.js`),
sayfa girdiyi yollar, gelen durumu ara değerle çizer, kendi oyuncunu gecikmesiz göstermek için yerel girdiden kısa bir
öne kayma ekler (`src/net/`). Yakar pas nişanı herkes için maçı dondurur, uçuş herkes için ağır çekimdir. Mola maçı
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
| Sol tık (top sende değilken) | **Pas iste**: başında "PAS!" çıkar, topu taşıyan bot arkadaşın sana pas verir. |
| Sol tık basılı (1 sn) | **Rüzgar şutu**: oyun ağır çekime geçer, 2 sn nişan al, bırak. Durdurulamaz; kaleye nişanlıysa her yerden gol, değilse ilk duvarda biter. Takım başına 5 hak. Nişan alırken rakip kayarak topu alırsa vuruş olmaz. |
| Sağ tık | Top sendeyken **kısa bas: pas**, **1 sn basılı tut: yakar pas** (oyun ağır çekime geçer, 2 sn nişan al, bırak); topsuzken topa doğru **kayma** (basılan yön ne olursa olsun). |
| Shift | 3 saniye **hızlı koşu** (rüzgar çizgileri, geniş kamera açısı), sonra yorulur normale dönersin (enerji koşu bitince dolmaya başlar). |
| Boşluk | Zıpla; havadayken yakar pas seni yakamaz. |
| V / 🎥 | Kamera: omuz ↔ **izometrik** (masaüstünde omuzla başlar, seçim hatırlanır). İzometrik futbol yayını gibi sabit yan açıdır (fare / parmak açıyı döndürmez, topa çevrilmez); masaüstünde fare kilitlenmez, şut / pas / yakar pas imlecin sahadaki noktasına gider; telefonda nişan hareket / bakış yönü, rakip kaleye dönüksen kale. Yerde ok gösterir. |
| F1 / Esc | Yardım / mola (Esc fareyi de bırakır; odak kaybında oyun durur). |

**Dokunmatik (telefon, tablet, Android uygulaması)**: dokunmatik ekran algılanınca açılır (`?touch=1` ile masaüstünde de).
Ekran yatay; dik tutunca "yan çevir" uyarısı çıkar. Tarayıcıda maça girerken tam ekrana geçer.

| Dokunuş | İş |
| --- | --- |
| Sol yarı | Parmağın değdiği yerde **joystick** belirir (analog). Hızlı koşu yalnız **KOŞ** düğmesiyle. |
| 🎥 | Telefonda **izometrik** kamerayla başlar (yukarıdan eğik, oyuncu ortada); nişan koştuğun / baktığın yön, rakip kaleye dönüksen kalenin ortası, yerde ok gösterir. 🎥 omuz kamerasına geçirir (seçim hatırlanır). Masaüstünde omuzla başlar, V ya da 🎥 ile geçilir. Ayarlar `CAMERA.iso`. |
| Sağ yarı | Parmak kaydırmak kamerayı çevirir (omuzda bakış / nişan, farenin karşılığı). |
| ŞUT / PAS İSTE | Top sende değilken PAS İSTE: dokun, pas iste. Top sendeyken dokun: şut; 1 sn basılı tut: rüzgar şutu nişanı (ağır çekim; izometrikte joystick, omuzda parmakla nişan al, bırak). |
| PAS / KAY | Top sendeyken dokun: pas; 1 sn basılı tut: yakar pas nişanı (izometrikte joystick, omuzda parmakla nişan al, bırak). Topsuzken: topa doğru kay. |
| ZIPLA / KOŞ | Boşluk / Shift. Düğmelerde enerji dolumu görünür. |

Telefonda dolum halkası ve enerji / sersemlik göstergesi karakterin üstünde değil ekranın altındadır. Top ekranda değilse ekranın kenarında topun yönünü gösteren işaret çıkar (yakar pasta kırmızı), top görününce kaybolur. Koşarken karakter gittiği yöne döner, dururken nişana. Mobilde görüntü hafifler (piksel oranı, gölge haritası), önemli anlarda kısa titreşim olur. Ayarlar `TOUCH` (config.js).

## Kurallar

Maç 5 dakika; yalnız goller puan verir, beraberlikte **altın gol**. Saha 52×80 birim; aut yok, top duvardan seker.

- **Enerji**: yalnız kayma ve hızlı koşu enerji kullanır; biri kullanılınca ikisi birden **3 saniye** bekler. Geri sayım
  karakterinin sırtında görünür (dolunca kısa bir "HAZIR"); sol alttaki kart da gösterir. Yakar pas ve rüzgar şutu
  **enerjiden bağımsızdır**: yalnız takımın hakkı sayılır. Takımın rüzgar hakkı bittiyse sol tıkı basılı tutarsan şarj
  dolu bekler, bırakınca normal şut.
- **Dolum halkası**: sol tık ya da sağ tık basılıyken nişangahın çevresinde halka dolar ve hangi vuruşun hazırlandığını
  yazar (camgöbeği rüzgar, turuncu yakar pas; yapılamıyorsa gri ve sebebi). Ayaktaki top da vuruşun rengine bürünür.
- **Yakar pas** hakkı **takımındır**: her takım maç boyunca **5 kez** atar (takımdaki herkes aynı haktan harcar). İki
  takımın kalan hakları skor tabelasında alev damlalarıyla görünür. Sağ tık 1 saniye dolunca oyun
  **ağır çekime** geçer, top ayağında alev alır ve fareyle bir **takım arkadaşına** nişan alırsın (nişana en yakın
  arkadaşın başında "YAKAR PAS" yazar); sağ tıkı bırakınca (ya da sol tık / süre dolunca) top çıkar ve o arkadaşa
  kilitlenir: kaçsa da onu izler, mutlaka ona varır. Botlar da aynı yoldan atar: önce dolum (çevrelerinde alev ya da rüzgar), sonra ağır çekimde
  kısa nişan; o sırada kayarak topu ayaklarından alabilirsin. Sinema şeritleri arasında top **ağır çekimde** uçar ve herkesin kamerası
  onu izler; her çarptığı rakipte çarpma daha da ağır çekimde, vurulan geriye savrulup düşerek gösterilir. Sinema bitince
  kamera kaldığı yere değil topa dönük olarak sana geçer (kenardan dönüşte ve omuz kamerasına geçişte de). Zıplayan yanmaz: botlar üstlerine gelen yakar pastan çoğu zaman zıplayıp kurtulur.
- **Nişan sırasında** (yakar pas ya da rüzgar) nişan alan kıpırdamaz, oyun ağır çekimde sürer: rakip **kayarak** topu
  ayağından alırsa vuruş olmaz (yürüyerek alınamaz). Botlar rakip nişan alırken üstüne koşup kayar.
- Yakar pas gol olmaz ve **durmaz**: yol boyunca değdiği **her** rakibi 4 saniye kenara gönderir, araya giren öbür
  arkadaşların içinden geçer, yalnız hedef arkadaş yakalar. Dönüşte kısa korunma vardır. Botlar yakar pası arada
  rakip olan bir arkadaşa atar.
- **Pas isteme**: top ayağında değilken sol tık (dokunmatikte PAS İSTE) 1,6 saniye başında "PAS!" yazdırır; topu taşıyan
  bot arkadaşın kısa bir tepkiyle çoğu zaman sana pas verir.
- **Rüzgar şutu** hakkı da takımındır: maç boyunca **5 kez** (skor tabelasında camgöbeği damlalar, yakar pas hakkından
  ayrı). Sol tık 1 saniye dolunca ağır çekimde 2 saniye nişan alınır, bırakınca çıkar. Top bilerek normal şuttan yavaştır
  ve hiç yavaşlamaz, herkesin kamerası onu izler. **Durdurulamaz**: kimse (kaleci ve takım arkadaşları dahil) tutamaz,
  yolundaki rakipleri kenara savurur. Kaleye nişan alındıysa nereden vurulursa vurulsun gol olur; nişan kaleye değilse
  ilk duvara çarpınca normal topa döner.
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
  (kaleye yakınsa daha olası) veya nadiren yakar pas. Botlar üstüne daha seyrek kayar.
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
| `server/rooms.mjs` | Odalar: koltuklar, yönetici taşıması, otoriter maç döngüsü, yakar pas sineması, geri bağlanma |
| `src/net/protocol.js`, `src/net/snapshot.js`, `src/net/client.js` | Ağ sözlüğü, durum paketi, çevrim içi istemci (ara değer, öne kayma) |
| `src/lobby.js`, `src/platform.js` | Giriş ekranı oda düğmeleri ve lobi; platform (uygulama / web) ve sunucu adresi |
| `src/config.js` | Tüm ayar sayıları (saha, maç, hareket, enerji, kayma, hızlı koşu, şutlar, rüzgar, top, yanma, botlar, kamera) |
| `src/world.js` | **Simülasyon**: dünya kurulumu, sabit adım, girdiyi eyleme çevirme (sol tık şarjı), hareket, saat ve altın gol |
| `src/actions.js` | Oyuncu eylemleri: zıplama, kayma, hızlı koşu, şut (normal / rüzgar / yakar / pas), pas hedefi seçimi |
| `src/ball.js` | Top: taşıma ve kapma, sekme, gol, yakalama, yakma, rüzgarla savurma |
| `src/ai.js` | Bot kararları: kaleci, topa koşan (hızlı koşu, kayma), yer tutan; şut / yakar pas / pas; baskı altında kaçış (şut, yakar pas, boştaki arkadaşa pas, duvardan sektirme); yakar pastan kaçış |
| `src/lineup.js` | Diziliş: rollere göre ev konumları, hücum yönü, golden sonra rollerin karılması ve yeniden diziliş |
| `src/rng.js`, `src/math.js` | Tohumlu rastgelelik; küçük yardımcılar |
| `src/input.js` | Klavye ve fare, fare kilidi, basışların bir kez tüketilmesi; dokunmatik düğmeleri aynı basışlara bağlar |
| `src/touch.js` | Dokunmatik kontroller: joystick, sağ yarı bakış, ŞUT / PAS / ZIPLA / KOŞ düğmeleri, tam ekran |
| `src/ui.js` | Arayüz: ekranlar, tabela, oyuncu kartı, mesaj, sırttaki enerji / rüzgar göstergesi, maç sonu tablosu |
| `src/audio.js` | Kısa sentez sesler |
| `src/main.js` | Uygulama: ekran akışı, sabit adım döngüsü, olayların tüketilmesi, test kancası (`?test`) |
| `src/gosteri.js` | Gösteri kipi (`?gosteri=1`, yalnız web): bot-bot maç, arayüzsüz, kamera aksiyonu izler |
| `src/gosteri-ruzgar.js` | Rüzgar şutu gösteri sahnesi (`?gosteri=ruzgar`): sahnelenmiş vuruş, omuz kamerası, açıklama yazısı, döngü |
| `src/view/view.js` | Görünüm: renderer, ışıklar, sahne bileşenlerinin toplanması, kare çizimi |
| `src/view/camera.js` | Omuz kamerası: takip, bakış, nişan ışını, bakış yönlü hareket, topa dönme |
| `src/view/pitch.js` | Saha ve çevresi (kaleler, duvarlar, tel örgü, apartmanlar, ağaçlar) |
| `src/view/actors.js` | Oyuncu modelleri, animasyon, topa bakma, isim etiketleri |
| `src/view/ballview.js` | Top görseli: beyaz, alevli yakar pas, rüzgar halkalı rüzgar topu |
| `src/view/effects.js` | Parçacıklar (şut, yanma, savrulma, gol) |
| `src/view/builders.js` | Sahne yapı taşları (malzeme, kutu, silindir, çizgi, tabela) |
| `tests/world.test.mjs` | Kural testleri |
| `tests/browser-smoke.mjs` | Tarayıcı dumanı testi |
| `tests/touch-smoke.mjs` | Dokunmatik dumanı testi (telefon taklidi) |
| `tests/rooms.test.mjs`, `tests/online-smoke.mjs` | Oda testleri (sahte soket) ve iki sekmeli çevrim içi dumanı testi |
| `tests/gosteri-smoke.mjs` | Gösteri kipi dumanı testi (arayüz gizli, ağ ve ölçüm yok, kamera aksiyonda, maç yenilenir) |
| `tests/gosteri-ruzgar-smoke.mjs` | Rüzgar sahnesi dumanı testi (diziliş, kimse saldırmaz, yükleme / çarpma / gol, döngü, yazının yeri) |
| `capacitor.config.json`, `android/` | Android uygulaması (Capacitor): kimlik, yatay tam ekran, titreşim izni, simgeler |
| `scripts/build-web.mjs`, `scripts/apk.mjs`, `scripts/icons.mjs` | Uygulama dosyalarını toplama, APK derleme, simge / açılış / mağaza görselleri |
