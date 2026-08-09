# Azure Container Apps — deploy

Hedef: scale-to-zero, aylık ücretsiz kotanın içinde, kredi yakmadan.
Proje yapısı değişmiyor; deploy tamamen mevcut `Dockerfile` üzerinden.

---

## Bu projeye özel beş kritik ayar

Genel Azure rehberlerindeki komutlar bu projede olduğu gibi çalışmaz:

| Konu | Genel rehber | Burada olması gereken |
|---|---|---|
| Uygulama modülü | `main:app` | **`server:app`** — `main.py` bir CLI script'i, FastAPI değil |
| Env değişkeni | `GEMINI_API_KEY` | **`gemini_api_key`** — `core/config.py` küçük harfli okuyor |
| Port | `8000` | **`7860`** — `Dockerfile`'daki `ENV PORT` bu |
| GHCR yolu | `darkmonger` | **`armansoylu`** — GHCR sadece küçük harf kabul eder |
| Replica sayısı | `--max-replicas 2` | **`--max-replicas 1`** — sohbet geçmişi (`agent/sessions.py`) process içi bellekte; ikinci replica geçmişi rastgele düşürür |

### Bölge

**Azure for Students** aboneliğinde bir politika var: sadece şu bölgelere deploy edilebiliyor —
`germanywestcentral`, `francecentral`, `switzerlandnorth`, `spaincentral`, `italynorth`.

`westeurope` denenirse `RequestDisallowedByAzure` hatası gelir. Karlsruhe'ye en yakın olan
**germanywestcentral** seçildi.

---

## 0. Önce bütçe alarmı

Deploy'dan **önce** kur, sonra unutulur.

Portal → Cost Management + Billing → Budgets → Add
Tutar `20 USD`, uyarılar `%50 / %80 / %100`.

## 1. Kodu push et

İmaj GitHub Actions'ta derlenecek, o yüzden önce kodun uzakta olması lazım.

```bash
git add -A && git commit -m "azure deploy hazirligi" && git push
```

Push sonrası GitHub → Actions sekmesinde `build-image` çalışır (~3-4 dk).
Bitince GitHub → Packages → `dreamer-api` → Package settings → **Change visibility → Public**.

Public yapmazsan Azure'a registry kimlik bilgisi vermen gerekir; public'te gerekmiyor ve ücretsiz.

## 2. Azure CLI kur

Bu makinede yok. PowerShell'de:

```powershell
winget install --exact --id Microsoft.AzureCLI
```

Kurulumdan sonra terminali kapatıp aç.

## 3. Giriş ve ortam

```bash
az login
```

```bash
az extension add --name containerapp --upgrade
```

```bash
az provider register --namespace Microsoft.App
```

```bash
az group create --name rg-dreamer --location germanywestcentral
```

`--logs-destination none` önemli: varsayılan davranış bir Log Analytics workspace açar, o da kotandan yer.

```bash
az containerapp env create --name env-dreamer --resource-group rg-dreamer --location germanywestcentral --logs-destination none
```

## 4. Deploy

`<ANAHTAR>` yerine `.env` dosyandaki `gemini_api_key` değerini yapıştır.
Bu komut anahtarı shell geçmişine yazar; sonrasında geçmişi temizlemek isteyebilirsin.

```bash
az containerapp create --name dreamer --resource-group rg-dreamer --environment env-dreamer --image ghcr.io/armansoylu/dreamer-api:latest --target-port 7860 --ingress external --min-replicas 0 --max-replicas 1 --cpu 1.0 --memory 2.0Gi --secrets gemini-key=<ANAHTAR> --env-vars gemini_api_key=secretref:gemini-key
```

Çıktıdaki FQDN sitenin adresi: `https://dreamer.<hash>.germanywestcentral.azurecontainerapps.io`

## 5. Sonraki güncellemeler

Kod değişince `git push` yeter — Actions yeni imajı basar. Sonra:

```bash
az containerapp update --name dreamer --resource-group rg-dreamer --image ghcr.io/armansoylu/dreamer-api:latest
```

---

## Maliyet

Container Apps ücretsiz kotası (abonelik başına, aylık): **180.000 vCPU-saniye**, **360.000 GiB-saniye**, 2M istek.

`1.0 vCPU / 2.0 GiB` ayarında bu ayda **~50 saat aktif çalışma** demek.

Önemli nüans: scale-to-zero'da konteyner son istekten sonra ~5 dakika daha ayakta kalır ve o süre de faturalanır. Yani her ziyaret ~5 dakikaya mal olur → ayda kabaca **600 ziyarete kadar 0 TL**. Portföy sitesi bunun yakınından geçmez.

**`--min-replicas 0` mutlaka 0 kalmalı.** 1 yaparsan konteyner 7/24 döner: ayda ~1.3M vCPU-saniye, yani kotanın 7 katı → **~30 USD/ay**. Krediyi yakan tek ayar budur.

## Bilerek kabul edilen iki kısıt

**1. Ajan hafızası kalıcı değil.** ChromaDB konteynerin diskine yazıyor; scale-to-zero'da konteyner yok olunca `save_memory` ile kaydedilenler gider. Kalıcı olması için Azure Files mount'u gerekir (ayda ~0.20 USD, ek kurulum). Portföy demosu için gerek yok.

**2. İlk istek yavaş.** Soğuk başlangıçta konteyner ayağa kalkar ve ChromaDB embedding modelini (~80 MB ONNX) indirir. İlk soru 30-60 sn sürebilir, sonrakiler normal.

İkincisini hızlandırmak istersen `requirements.txt`'ten `streamlit` çıkarmak imajı belirgin şekilde küçültür — ama o zaman `ui.py` (legacy Streamlit arayüzü) çalışmaz.

## Deploy öncesi güvenlik notu

`/api/chat` açık ve kimlik doğrulaması yok. Adresi bulan herkes senin Gemini kotanı harcayabilir. Container Apps'te basit bir koruma:

```bash
az containerapp ingress update --name dreamer --resource-group rg-dreamer --allow-insecure false
```

Bu sadece HTTPS zorlar. Gerçek koruma için uygulamaya bir token kontrolü ya da rate limit eklemek gerekir.
