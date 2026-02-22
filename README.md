# GenCon Hotels

Real-time hotel availability monitoring for Gen Con attendees. Scrapes the Passkey housing portal and displays room availability with filtering, maps, and push notifications.

## Architecture

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Scraper**: Python FastAPI (deployed on Railway)
- **Database**: PostgreSQL (Supabase)
- **Realtime**: Supabase Realtime WebSocket subscriptions
- **Notifications**: Discord webhooks, Web Push

## Project Structure

```
├── frontend/          # Next.js web application
├── scraper/           # Python FastAPI scraper service
├── supabase/          # Database migrations & edge functions
└── gencon-hotels-spec.md  # Full project specification
```

## Setup

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial_schema.sql`
3. Enable Realtime on the `room_snapshots` table
4. Note your project URL, anon key, and service role key

### 2. Frontend Setup

```bash
cd frontend
cp ../.env.example .env.local
# Edit .env.local with your Supabase credentials
npm install
npm run dev
```

### 3. Scraper Setup

```bash
cd scraper
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env with your credentials
uvicorn main:app --reload
```

## Environment Variables

See `.env.example` for all required environment variables.

## Deployment

### Frontend (Vercel)

```bash
cd frontend
vercel
```

### Scraper (Railway)

```bash
cd scraper
railway up
```

### Database

Run migrations via Supabase dashboard or CLI:

```bash
supabase db push
```

## Features

- Real-time room availability updates
- Filter by distance, price, skywalk access
- Interactive map with hotel markers
- Discord/Push notifications for watchers
- Historical availability charts

## License

MIT
