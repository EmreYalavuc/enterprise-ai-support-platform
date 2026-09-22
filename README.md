# Enterprise AI Customer Support & Agent Platform

Şirketlerin kendi müşteri destek süreçlerini yapay zeka ile otomatize etmesini sağlayan, tam donanımlı bir SaaS platformu. Müşteri sorularını RAG (Retrieval-Augmented Generation) tabanlı bir AI agent ile yanıtlar; güven skoru düşük veya müşteri insan talep ettiğinde konuşmayı gerçek bir temsilciye yönlendirir.

---

## Özellikler

### AI Agent
- **RAG Pipeline** — Şirketin yüklediği belgeler (iade politikası, ürün katalogları, SSS vb.) Qdrant vector DB'de saklanır. Agent her soruda anlamlı chunk'ları çeker ve yanıtı bu bağlam üzerine kurar.
- **Tool Calling** — Agent şu araçlara erişebilir:
  - `search_documents` — vector similarity search
  - `query_database` — şirketin bağladığı veritabanına SELECT sorgusu (siparişler, stok, hesap bilgileri vb.)
  - `escalate_to_human` — konuşmayı temsilciye yönlendir
- **Answerability Gate** — Benzerlik skoru 0.40 altına düşerse, müşteri açıkça insan isterse veya iki başarısız denemeden sonra agent otomatik olarak insan yönlendirmesi yapar.
- **Çoklu Provider** — Claude (Anthropic), Gemini (Google) ve Mock (test) destekler. API key şifreli saklanır.

### Human Handoff & Agent Workspace
- Yönlendirilen konuşmalar gerçek zamanlı olarak Agent Workspace panelinde listelenir.
- Temsilci yanıt yazabilir, konuşmayı çözümlendi olarak işaretleyebilir veya yeniden açabilir.
- Yönlendirme sebebi ve önceki tüm mesaj geçmişi görüntülenir.
- AI, yönlendirilmiş konuşmalara yanıt üretmez — mesaj worker bunu durum kontrolüyle engeller.

### Veritabanı Entegrasyonu
- PostgreSQL, MySQL ve MongoDB bağlantısı desteklenir.
- Bağlantı string'i AES-256-GCM ile şifrelenir, plain-text hiçbir zaman saklanmaz.
- Agent yalnızca SELECT/SHOW/DESCRIBE sorgularını çalıştırabilir. DROP, DELETE, UPDATE gibi sorgular reddedilir.
- Bağlantı arayüzden test edilip kaydedilebilir.

### Auth & Multi-Tenancy
- Her şirket kendi hesabını oluşturur (`/register`), JWT token ve API key alır.
- API key SHA-256 hash'i veritabanında tutulur, tüm API isteklerinde Bearer veya `x-api-key` ile doğrulanır.
- Tüm veriler company_id ile izole edilir; bir şirket diğerinin verisine erişemez.

### Belge Yönetimi
- Metin içerik yüklenebilir, arka planda chunk'lara bölünür ve vektörleştirilir.
- İşlem durumu (pending → processing → indexed / failed) arayüzde canlı takip edilir.
- Belge silindiğinde ilgili chunk'lar ve vektörler temizlenir.

### WhatsApp Webhook
- WhatsApp Business API uyumlu webhook endpoint'i.
- Gelen mesajlar idempotency key ile tekrar işleme karşı korunur.
- Yanıtlar aynı AI agent pipeline'ından geçer.

---

## Teknik Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 16)                │
│   Dashboard · Chat · Documents · Workspace · Settings       │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP (JWT / API Key)
┌───────────────────────▼─────────────────────────────────────┐
│                      API Server (Express + TypeScript)      │
│                                                             │
│  /auth   /conversations   /documents   /workspace          │
│  /messages   /settings   /webhook                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐    │
│  │  AI Agent    │  │  Tool Layer  │  │  Encryption   │    │
│  │  (RAG+Tools) │  │  DB Connector│  │  AES-256-GCM  │    │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘    │
│         │                 │                                 │
│  ┌──────▼─────────────────▼──────────────────────────┐     │
│  │               BullMQ Workers                       │     │
│  │   message.worker · document.worker                │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
    ┌────▼───┐    ┌─────▼──┐    ┌─────▼──┐    ┌─────▼────┐
    │Postgres│    │  Redis  │    │ Qdrant  │    │ Embedding│
    │  (DB)  │    │(Queue+  │    │(Vector  │    │ Service  │
    │        │    │ Cache)  │    │  DB)    │    │(Python)  │
    └────────┘    └─────────┘    └─────────┘    └──────────┘
```

---

## Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 16, React, DM Sans, Tailwind CSS |
| API Server | Node.js, Express, TypeScript |
| Kimlik Doğrulama | JWT (jsonwebtoken), bcryptjs |
| Veritabanı | PostgreSQL 16 (pg), migration sistemi |
| Cache & Queue | Redis 7, BullMQ |
| Vector DB | Qdrant 1.9 |
| Embedding | Python (FastAPI + sentence-transformers) |
| AI Provider | Claude API (Anthropic), Gemini API (Google) |
| Şifreleme | AES-256-GCM (Node.js crypto) |
| Altyapı | Docker Compose |
| Monorepo | npm workspaces + Turborepo |

---

## Proje Yapısı

```
enterprise-ai-support-platform/
├── apps/
│   ├── api/                    # Express API sunucusu
│   │   └── src/
│   │       ├── routes/         # auth, conversations, documents, workspace...
│   │       ├── services/       # agent, claude, dbConnector, encryption, qdrant...
│   │       ├── workers/        # message.worker, document.worker (BullMQ)
│   │       └── middleware/     # apiKey, rateLimit, errorHandler
│   │
│   ├── web/                    # Next.js 16 frontend
│   │   └── app/
│   │       ├── page.tsx        # Dashboard
│   │       ├── chat/           # Chat arayüzü
│   │       ├── documents/      # Belge yönetimi
│   │       ├── workspace/      # Agent Workspace (Human Handoff)
│   │       ├── settings/       # AI provider & DB bağlantı ayarları
│   │       ├── login/          # Giriş
│   │       ├── register/       # Kayıt
│   │       └── components/     # Sidebar
│   │
│   └── embedding/              # Python FastAPI embedding servisi
│       └── main.py             # sentence-transformers endpoint
│
├── packages/
│   ├── database/               # Migration sistemi, PostgreSQL client
│   │   └── migrations/         # 001_initial → 006_human_handoff
│   └── shared/                 # Ortak TypeScript tipleri
│
└── infrastructure/
    └── docker-compose.yml      # PostgreSQL, Redis, Qdrant, Embedding
```

---

## Kurulum

### Gereksinimler
- Node.js 18+
- Docker Desktop
- Python 3.10+ (embedding servisi için, Docker ile otomatik)

### 1. Repo'yu klonla

```bash
git clone https://github.com/EmreYalavuc/enterprise-ai-support-platform.git
cd enterprise-ai-support-platform
npm install
```

### 2. Environment dosyasını oluştur

```bash
cp .env.example .env
```

`.env` içindeki değerleri doldur:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_support
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
EMBEDDING_URL=http://localhost:8000
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
API_PORT=3000
```

### 3. Altyapıyı başlat

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Bu komut PostgreSQL, Redis, Qdrant ve Python embedding servisini başlatır.

### 4. Veritabanını hazırla

```bash
npm run db:migrate   # Migration'ları çalıştır
npm run db:seed      # Test verisi ekle (opsiyonel)
```

### 5. Geliştirme sunucularını başlat

```bash
npm run dev          # API (:3000) + Web (:3001) aynı anda
```

---

## API Uç Noktaları

### Auth
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/auth/register` | Şirket kaydı, JWT + API key döner |
| POST | `/auth/login` | Giriş, JWT döner |

### Konuşmalar
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/conversations` | Yeni konuşma başlat |
| GET | `/conversations` | Konuşmaları listele |
| POST | `/conversations/:id/messages` | Mesaj gönder (AI yanıtı tetikler) |
| GET | `/conversations/:id/messages` | Mesaj geçmişi |

### Belgeler
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/documents` | Belgeleri listele |
| POST | `/documents` | Belge yükle ve vektörleştir |
| DELETE | `/documents/:id` | Belge sil |

### Ayarlar
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/settings` | Mevcut ayarlar |
| PATCH | `/settings` | AI provider/model/key güncelle |
| POST | `/settings/db/test` | Veritabanı bağlantısını test et |
| PATCH | `/settings/db` | Veritabanı bağlantısını kaydet |

### Agent Workspace
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/workspace/conversations` | Yönlendirilmiş konuşmalar |
| GET | `/workspace/conversations/:id` | Konuşma detayı |
| POST | `/workspace/conversations/:id/reply` | Temsilci yanıtı |
| PATCH | `/workspace/conversations/:id/status` | Durum güncelle |

---

## Veritabanı Şeması

```
companies          → Şirket hesapları, AI ayarları, DB bağlantısı
users              → Şirket kullanıcıları (email + bcrypt hash)
customers          → Son kullanıcılar (ad, email, telefon, kanal)
conversations      → Konuşmalar (status: active/escalated/resolved)
messages           → Mesajlar (role: user/assistant/agent/system/tool)
documents          → Yüklenen belgeler (status: pending/processing/indexed/failed)
document_chunks    → Parçalanmış metin + Qdrant point ID
tickets            → Destek biletleri
webhook_events     → WhatsApp webhook idempotency log
```

---

## Güvenlik

- API key'ler SHA-256 hash olarak saklanır, plain-text asla tutulmaz
- DB bağlantı string'leri AES-256-GCM ile şifrelenir
- JWT 30 günlük TTL, route koruması Next.js proxy katmanında
- Rate limiting: 100 req/15dk (API), 20 req/dk (mesaj)
- Veritabanı sorguları SELECT-only kısıtlaması (DROP/DELETE/UPDATE engellenir)
- Her şirketin verisi company_id ile tam izolasyon

---

## Lisans

MIT
