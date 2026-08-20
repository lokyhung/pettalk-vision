# PetTalk Vision — Deployment (Vercel + Railway)

Goal: publish the **same** local architecture publicly.

```
Browser (Vercel HTTPS)
  ├── demo MP4s + UI
  └── camera frames
        │  WSS
        ▼
FastAPI + YOLO + ActivityEngine (Railway)
        │  JSON
        ▼
overlays / confidence / timeline
```

Do **not** move YOLO into the browser. Do **not** use frontend-only hosting for live detection.

---

## Functionality checklist (must remain)

- [ ] Dog detection (YOLO)
- [ ] Bounding box
- [ ] Segmentation mask (backend; overlay uses bbox/keypoints)
- [ ] 24 keypoints / pose reconstruction
- [ ] Movement analysis
- [ ] ActivityEngine + activity classification
- [ ] Confidence scores
- [ ] Live camera + WebSocket `/ws/analyze`
- [ ] Demo videos + mixed 家居活動 + timeline
- [ ] AI summary (rules; optional OpenAI)
- [ ] Pet profile
- [ ] HK Traditional Chinese UI
- [ ] Mobile layout
- [ ] Rear camera default + camera switch
- [ ] `resetAnalysisSession` when switching demos/camera

Note: the UI is primarily **zh-HK**. There is no full EN/HK language toggle product feature today; do not treat that as a deploy blocker.

---

## PART A — GitHub

1. Commit deployment prep files (`backend/Dockerfile`, `DEPLOYMENT.md`, etc.).
2. Confirm these are **committed**:
   - `backend/app/**`
   - `backend/requirements.txt`
   - `backend/Dockerfile`
   - `frontend/src/**`
   - `frontend/public/videos/*.mp4`
3. Confirm these are **not** committed:
   - `.env`, `backend/.env`, `frontend/.env.local`
   - `backend/.venv/`, `node_modules/`
   - `*.pt` model weights (downloaded in Docker build)
   - `OPENAI_API_KEY` values
4. Push to `https://github.com/lokyhung/pettalk-vision` (or your fork).

```bash
git status
git add -A
# review carefully — never add .env or *.pt
git commit -m "Prepare PetTalk for Railway + Vercel deployment"
git push origin master
```

---

## PART B — Railway (backend)

1. Create a project at [railway.app](https://railway.app).
2. **New Service → Deploy from GitHub** → select this repo.
3. Set **Root Directory** to `backend` (so Railway finds `Dockerfile` + `railway.toml`).
4. Build uses the Dockerfile (downloads `yolo11n-seg.pt` during image build).
5. Environment variables (Railway → Variables):

| Variable | Required | Value |
|---|---|---|
| `PORT` | Auto | Railway sets this — do not override unless you know why |
| `CORS_ORIGINS` | Recommended | `*` for first bring-up, later `https://YOUR-APP.vercel.app` |
| `OPENAI_API_KEY` | Optional | only if you want LLM summaries |
| `OPENAI_MODEL` | Optional | `gpt-4o-mini` |
| `ANALYSIS_IMGSZ` | Optional | `640` (or `480` for cheaper CPU) |
| `DOG_DETECTION_THRESHOLD` | Optional | `0.55` |
| `CUSTOM_POSE_MODEL` | Optional | leave empty |

6. Generate a **public HTTPS domain** (Settings → Networking → Generate Domain).
7. Wait for deploy (first build is slow: PyTorch + YOLO download).
8. Verify health (no camera needed):

```bash
curl -sS https://YOUR-RAILWAY-SERVICE.up.railway.app/health
```

Expect JSON like:

```json
{"ok":true,"service":"pettalk-vision","device":"cpu","model":"...yolo11n-seg.pt",...}
```

`"device":"cpu"` on Railway is correct (no Mac MPS).

9. Copy the public URL, e.g. `https://pettalk-vision-production.up.railway.app`.

---

## PART C — Vercel (frontend)

1. Import the same GitHub repo in [vercel.com](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Framework: Vite (see `frontend/vercel.json`).
4. Build command: `npm run build`
5. Output directory: `dist`
6. Environment Variables → **Production** (and Preview if you want):

| Variable | Example |
|---|---|
| `VITE_API_URL` | `https://YOUR-RAILWAY-SERVICE.up.railway.app` |
| `VITE_WS_URL` | `wss://YOUR-RAILWAY-SERVICE.up.railway.app/ws/analyze` |

**Critical:** Vite bakes `VITE_*` into the JS **at build time**. Set these **before** the first Production deploy (or Redeploy after saving them). Runtime-only changes will not update the client until you rebuild.

Do **not** put `OPENAI_API_KEY` in Vercel.

7. Deploy.
8. Open the HTTPS URL, e.g. `https://pettalk-vision.vercel.app`.

After you know the Vercel URL, optionally tighten Railway:

```text
CORS_ORIGINS=https://pettalk-vision.vercel.app,http://127.0.0.1:5173
```

Then redeploy the Railway service.

---

## PART D — Verify after go-live

On the Vercel HTTPS URL:

1. Homepage loads.
2. 示範模式 → all five demos including 🏠 家居活動.
3. Demo timeline + summary update while the video plays.
4. 即時鏡頭 → browser asks for camera → rear camera on phone.
5. Dog in frame → bbox + keypoints appear.
6. Activity / confidence / movement update over time.
7. DevTools → Network → WS connected to `wss://…/ws/analyze` (status 101).
8. `curl` Railway `/health` still OK.

Local Cursor workflow must still work (empty `VITE_*`, Vite proxy):

```bash
# terminal 1
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2
cd frontend && npm run dev
# open http://127.0.0.1:5173
```

---

## Expected URLs

| Piece | Example |
|---|---|
| Frontend | `https://pettalk-vision.vercel.app` |
| Backend | `https://….up.railway.app` |
| Health | `https://….up.railway.app/health` |
| WebSocket | `wss://….up.railway.app/ws/analyze` |

Exact hostnames are assigned by Railway/Vercel when you create the services.

---

## YOLO model strategy

- `*.pt` stays **gitignored**.
- Docker **build** downloads `yolo11n-seg.pt` into `models/` inside the image.
- Runtime uses CPU on Railway (`detector.py` already falls back when MPS/CUDA are missing).
- Local Mac still uses MPS when available.

---

## Cost / ops notes

- Railway free/trial may **sleep**; first request after sleep is slow (model reload).
- Keep a paid hobby plan if you need the demo always awake.
- CPU inference is slower than local MPS; reduce `ANALYSIS_IMGSZ` to `480` if needed.
