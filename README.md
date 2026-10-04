# FinTrack

Offline-first personal finance management PWA.

## Structure
- `web/` — React + TypeScript + Vite PWA (deployed to Vercel)
- `api/` — Django + DRF backend (deployed to Render)
- `shared/` — sync protocol contract types
- `docker-compose.yml` — local Postgres for development

## Local development

### Backend
```bash
cd api
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -r requirements/dev.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
python manage.py qcluster   # background tasks (separate terminal)
```

### Frontend
```bash
cd web
npm install
cp .env.example .env
npm run dev
```

### Database
```bash
docker compose up -d db
```

For production, the API uses Neon PostgreSQL (set `DATABASE_URL` to the pooled `-pooler` connection string).

## Deployment
- **Frontend**: Vercel, root directory `web/`, build `npm run build`, output `dist/`
- **Backend**: Render via `render.yaml` blueprint, Neon Postgres, django-q ORM broker (no Redis)

## Checks
```bash
# web
npm run lint && npm run typecheck && npm run test && npm run build
# api
ruff check . && mypy . && pytest
```
