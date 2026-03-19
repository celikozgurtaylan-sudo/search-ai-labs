# Resend E-posta Kurulumu - Wix ve Cloudflare Icin Uygulama Rehberi

## Sorunun Koku NedenI

Su anda davet e-postalari su sender ile cikiyor:

```ts
from: "UX Arastirma <onboarding@resend.dev>"
```

Bu, Resend'in test domainidir. Test domaini ile:

- yalnizca Resend hesap sahibinin e-posta adresine gonderim yapilabilir
- gercek katilimcilara gonderim yapilamaz

Yani sorun frontend ya da participant akisi degil. Sorun, gonderici domainin dogrulanmamis olmasi.

---

## Hedef Kurulum

Kalici gonderici domain:

- domain: `invite.searcho.online`
- from name: `Searcho Research`
- from email: `no-reply@invite.searcho.online`

Bu subdomain yalnizca e-posta gonderimi icindir. Yeni bir site, app ya da deploy anlami tasimaz.

---

## Uygulanacak Strateji

### 1. Asama - Once Wix DNS ile deneyin

Ilk hedef, hosting'e dokunmadan yalnizca DNS tarafinda Resend verification'i tamamlamaktir.

Yapilacaklar:

1. Resend paneline gidin: https://resend.com/domains
2. "Add Domain" secin
3. Domain olarak `invite.searcho.online` girin
4. Resend'in verdigi DNS kayitlarini not alin
5. Wix DNS tarafinda bu kayitlari eklemeyi deneyin

Beklenen:

- outbound sending icin gerekli TXT / CNAME / SPF / DKIM kayitlari eklenebiliyorsa
- domain dogrulanir
- Cloudflare gecisine gerek kalmaz

Not:

- inbound mail kurmuyoruz
- mailbox kurmuyoruz
- reply alma zorunlulugu yok
- bu yuzden hedef yalnizca **outbound verification**

### 2. Asama - Wix DNS engel olursa Cloudflare'e gecin

Eger Wix DNS gerekli Resend kayitlarini kabul etmiyorsa veya verification stabil ilerlemiyorsa:

1. `searcho.online` domainini Cloudflare'e ekleyin
2. Cloudflare'in verdigi nameserver'lari domain registrarda tanimlayin
3. Wix'in mevcut A / CNAME kayitlarini Cloudflare DNS'e birebir tasiyin
4. Site ve `beta.searcho.online` calismaya devam ettigini dogrulayin
5. Sonra Resend'in `invite.searcho.online` icin istedigi kayitlari Cloudflare DNS'e ekleyin

Onemli:

- bu islem Wix hosting'i kapatmaz
- yalnizca DNS kontrolu Wix'ten Cloudflare'e gecer
- site yine Wix'te host edilmeye devam eder

---

## Kod Tarafinda Beklenen Ayarlar

Supabase Edge Function `send-invitation-email` artik hardcoded `resend.dev` sender kullanmamalidir.

Gerekli secrets:

```bash
RESEND_API_KEY=...
RESEND_FROM_NAME="Searcho Research"
RESEND_FROM_EMAIL="no-reply@invite.searcho.online"
FRONTEND_URL="https://beta.searcho.online"
```

Kodun kullanacagi sender:

```ts
from: "Searcho Research <no-reply@invite.searcho.online>"
```

---

## Basari Kriterleri

Kurulum tamam sayilmasi icin:

- Resend domain status `invite.searcho.online` icin verified olmali
- uygulama icinden eklenen participant Gmail adresine mail gitmeli
- uygulama icinden eklenen participant Outlook / Hotmail adresine mail gitmeli
- resend butonu tekrar gonderim yapabilmeli
- mail sender kisminda `resend.dev` gozukmemeli

---

## Hangi Alternatifler Bilerek Secilmedi

### `beta.searcho.online` uzerinden gonderim

Kalici cozum olarak secilmedi, cunku beta ortami mail kimligi olmamali.

### Root domain `searcho.online`

Teknik olarak mumkun olabilir, ancak transactional e-posta reputation'ini ana brand domain ile karistirir.

### Ayrica mail icin ayri domain satin almak

Calisir ama brand'i parcali hale getirir. En son fallback olarak dusunulmeli.

### Baska bir e-posta saglayicisina gecmek

Bu problemi buyuk olasilikla cozmeyecek. Cunku asil kisit DNS verification kontroludur.

---

## Kontrol Listesi

- [ ] Resend'de `invite.searcho.online` olusturuldu
- [ ] Wix DNS'te gerekli verification kayitlari eklenmeye calisildi
- [ ] Wix ile verification olmuyorsa Cloudflare DNS plani aktive edildi
- [ ] Cloudflare'e mevcut Wix DNS kayitlari tasindi
- [ ] `invite.searcho.online` Resend tarafinda verified oldu
- [ ] Supabase secret'lari guncellendi
- [ ] Participant davet mailleri gercek alicilara gitti
