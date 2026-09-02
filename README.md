# Coaching Hockey Made Easy

Hockey coaching workspace: video snippets, playbooks, player assignments, and a season planner.

This repository was populated from the live Firebase Hosting site and the `api` Cloud Function source. Cursor Origin (`kenny-boreham/ice-tracker`) was not cloned because this environment has no Origin credentials.

## Layout

| Path | What it is |
| --- | --- |
| `/` (HTML, `css/`, `js/`, `img/`) | Static frontend currently deployed on Firebase Hosting |
| `api/` | Node 20 Cloud Function / Cloud Run backend (`serviceId: api`, `us-central1`) |
| `season-planner/` | Snapshot of a 2 Sep 2026 Hosting version (Coach's Season Planner) that was later replaced on live |
| `firebase.json` | Hosting config, including `/api/**` rewrite to Cloud Run |

## Run the frontend locally

From the repo root:

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 — marketing home, login, dashboard shell, playbook, and rink creator load as static pages. Login and video APIs need the backend (`/api`).

## Run the API locally

```bash
cd api
cp .env.example .env
npm ci
npm start
```

Default API port is `5000`. Point the static site at it by setting `window.API_BASE_URL` (see `js/config.js`) or by using Firebase Hosting's `/api` rewrite.

`npm test` in `api/` runs the in-memory Firestore unit tests.

## Deploy notes

- Hosting rewrites `/api/**` to Cloud Run service `api` in `us-central1`.
- Do not commit `api/.env`. Use `.env.example` as the template.
- Season planner client Firebase config lives in `season-planner/js/firebase-config.js` (public web app keys only).
