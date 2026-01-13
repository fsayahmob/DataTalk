# 📊 Analyse Impact SSE (Server-Sent Events)

Date: 2026-01-12
Objectif: Remplacer polling par SSE pour updates temps réel

---

## 🔍 État Actuel (Polling)

### Frontend - Composants avec polling

**1. PipelineLog.tsx** (ligne 33)
```typescript
const interval = setInterval(fetchPipeline, refreshInterval); // Poll toutes les 3s
// Appelle: GET /catalog/latest-run
```
**Usage**: Affiche progression jobs (extraction/enrichissement)

**2. catalog/page.tsx**
```typescript
// Pas de polling actuellement MAIS besoin pour bloquer boutons
// Devra appeler: GET /catalog/running-status (à créer)
```
**Usage**: Bloquer boutons Extract/Enrich pendant run

**3. Settings Pages** (ModelsTab, UsageTab, etc.)
```typescript
// Pas de polling actuellement
// Load data une fois au mount
```
**Usage**: Affichage statique (pas besoin temps réel)

### Backend - Endpoints actuels

**Endpoints existants** :
- `GET /catalog/latest-run` → Dernier run (utilisé par PipelineLog)
- `GET /catalog/run/{run_id}` → Run spécifique
- `GET /catalog/jobs?limit=N` → Liste jobs
- `GET /llm/status` → Statut LLM (statique)
- `GET /llm/costs?days=N` → Coûts LLM (statique)

**Endpoints manquants** :
- `GET /catalog/runs` → Liste TOUS les runs (pour page /runs)
- `GET /catalog/running-status` → État actuel (is_running + current_run_id)

**SSE existant** : ❌ Aucun

---

## 🎯 Use Cases SSE

### Use Case 1: Jobs Pipeline (PRIORITAIRE)
**Besoin** : Afficher progression extraction/enrichissement en temps réel

**Actuellement** :
- PipelineLog poll `/catalog/latest-run` toutes les 3s
- Latence 0-3s
- 20 requêtes/minute pendant un run de 1-2 min

**Avec SSE** :
```python
# Backend
@app.get("/catalog/job-stream/{run_id}")
async def job_stream(run_id: str):
    async def generator():
        while True:
            jobs = get_run_jobs(run_id)
            yield f"data: {json.dumps(jobs)}\n\n"

            # Arrêter si tous jobs completed/failed
            if all(j.status in ['completed', 'failed'] for j in jobs):
                break

            await asyncio.sleep(0.5)  # Update toutes les 500ms

    return StreamingResponse(generator(), media_type="text/event-stream")
```

```typescript
// Frontend
const eventSource = new EventSource(`/catalog/job-stream/${runId}`);
eventSource.onmessage = (e) => {
  const jobs = JSON.parse(e.data);
  setRunJobs(jobs);  // Update instantané
};
```

**Gains** :
- ✅ Latence 0s (vs 0-3s)
- ✅ Moins de requêtes (1 connexion vs 20-40 requêtes)
- ✅ Updates fluides (500ms vs 3s)

### Use Case 2: Bloquer Boutons (PRIORITAIRE)
**Besoin** : Désactiver Extract/Enrich si un job tourne

**Actuellement** :
- ❌ Rien (pas implémenté)
- Devrait poll `/catalog/running-status` toutes les 2s

**Avec SSE** :
```python
# Backend
@app.get("/catalog/status-stream")
async def status_stream():
    async def generator():
        while True:
            # Vérifier si un job tourne
            running = any(j.status == 'running' for j in get_all_jobs(limit=10))
            current_run = get_latest_run_id() if running else None

            yield f"data: {json.dumps({'is_running': running, 'current_run_id': current_run})}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(generator(), media_type="text/event-stream")
```

```typescript
// Frontend (catalog/page.tsx)
useEffect(() => {
  const es = new EventSource('/catalog/status-stream');
  es.onmessage = (e) => {
    const status = JSON.parse(e.data);
    setIsRunning(status.is_running);
  };
  return () => es.close();
}, []);

// UI
<Button disabled={isRunning}>Extraire</Button>
```

**Gains** :
- ✅ Réactivité immédiate (0s vs 0-2s)
- ✅ UX propre (boutons grisés instantanément)

### Use Case 3: KPIs Analytics (OPTIONNEL)
**Besoin** : Voir KPIs se mettre à jour après enrichissement

**Actuellement** :
- ❌ Statique (chargé au mount, pas de refresh)
- User doit refresh page manuellement

**Avec SSE** :
```python
@app.get("/analytics/kpi-stream")
async def kpi_stream():
    async def generator():
        last_update = None
        while True:
            # Vérifier si KPIs ont changé
            current_update = get_kpis_last_update_time()

            if current_update != last_update:
                kpis = get_kpis()
                yield f"data: {json.dumps(kpis)}\n\n"
                last_update = current_update

            await asyncio.sleep(2)

    return StreamingResponse(generator(), media_type="text/event-stream")
```

**Gains** :
- ✅ KPIs auto-refresh après enrichissement
- ⚠️ Mais peu utile si user pas sur page analytics pendant run

**Priorité** : BASSE (Nice-to-have)

### Use Case 4: Costs LLM (OPTIONNEL)
**Besoin** : Voir coûts augmenter en temps réel pendant enrichissement

**Actuellement** :
- ❌ Statique

**Avec SSE** :
- Possible mais overkill
- Coûts changent rarement (seulement pendant LLM calls)

**Priorité** : TRÈS BASSE (pas utile)

---

## 🏗️ Architecture SSE Proposée

### Option A : SSE par Use Case (SIMPLE)

**Endpoints** :
1. `GET /catalog/job-stream/{run_id}` → Stream progression d'un run
2. `GET /catalog/status-stream` → Stream état global (is_running)

**Frontend** :
- PipelineLog : utilise job-stream
- catalog/page : utilise status-stream

**Avantages** :
- ✅ Simple à implémenter
- ✅ Séparation claire

**Inconvénients** :
- ⚠️ 2 connexions SSE simultanées (acceptable)

### Option B : SSE Unifié (COMPLEXE)

**Endpoint unique** :
```python
GET /events?topics=jobs,status,kpis
```

**Avantages** :
- ✅ 1 seule connexion

**Inconvénients** :
- ❌ Plus complexe
- ❌ Envoie data même si pas utilisée

**Choix recommandé** : Option A (simple et efficace)

---

## 🛠️ Plan d'Implémentation

### Phase 1 : Jobs Pipeline (PRIORITAIRE)

**Backend** :
```python
# backend/main.py

from fastapi.responses import StreamingResponse
import asyncio
import json

@app.get("/catalog/job-stream/{run_id}")
async def stream_run_jobs(run_id: str):
    """Stream job updates pour un run spécifique."""
    from catalog import get_run_jobs

    async def event_generator():
        while True:
            try:
                jobs = get_run_jobs(run_id)
                jobs_data = [dict(job) for job in jobs]

                yield f"data: {json.dumps(jobs_data)}\n\n"

                # Arrêter si tous jobs terminés
                if all(j['status'] in ['completed', 'failed'] for j in jobs_data):
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    break

                await asyncio.sleep(0.5)  # Update toutes les 500ms

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

**Frontend** :
```typescript
// frontend/src/components/catalog/PipelineLog.tsx

useEffect(() => {
  if (!latestRunId) return;

  const eventSource = new EventSource(`/catalog/job-stream/${latestRunId}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.done) {
      eventSource.close();
      setLoading(false);
    } else if (data.error) {
      console.error('SSE error:', data.error);
      eventSource.close();
    } else {
      setPipeline(data);  // Update jobs
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    setLoading(false);
  };

  return () => eventSource.close();
}, [latestRunId]);
```

**Effort** : 15 min

### Phase 2 : Bloquer Boutons (PRIORITAIRE)

**Backend** :
```python
@app.get("/catalog/status-stream")
async def stream_catalog_status():
    """Stream l'état global du catalogue (running ou pas)."""
    from catalog import get_catalog_jobs

    async def event_generator():
        previous_status = None

        while True:
            try:
                # Vérifier si un job tourne
                recent_jobs = get_catalog_jobs(limit=5)
                is_running = any(j['status'] == 'running' for j in recent_jobs)
                current_run_id = get_latest_run_id() if is_running else None

                status = {
                    'is_running': is_running,
                    'current_run_id': current_run_id
                }

                # Envoyer seulement si changement
                if status != previous_status:
                    yield f"data: {json.dumps(status)}\n\n"
                    previous_status = status

                await asyncio.sleep(1)

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

**Frontend** :
```typescript
// frontend/src/app/catalog/page.tsx

const [isRunning, setIsRunning] = useState(false);

useEffect(() => {
  const eventSource = new EventSource('/catalog/status-stream');

  eventSource.onmessage = (event) => {
    const status = JSON.parse(event.data);
    setIsRunning(status.is_running);
  };

  return () => eventSource.close();
}, []);

// Dans le JSX
<Button onClick={handleExtract} disabled={isRunning || isExtracting}>
  {isRunning ? '🔄 En cours...' : 'Extraire'}
</Button>
```

**Effort** : 10 min

### Phase 3 : Page /runs (APRÈS SSE)

**Une fois SSE en place** :
- Créer page `/runs` avec historique
- Utiliser ReactFlow pour visualiser runs
- Réutiliser `/catalog/job-stream/{run_id}` pour afficher détails

**Effort** : 20 min (après SSE)

---

## ⚖️ Comparaison Polling vs SSE

| Critère | Polling | SSE |
|---------|---------|-----|
| **Latence** | 0-3s | 0s (instantané) |
| **Charge serveur** | 20 req/min × N users | 1 connexion × N users |
| **UX** | Saccadée | Fluide |
| **Complexité** | Simple (5 min) | Moyenne (15 min) |
| **Scalabilité** | ❌ Mauvaise (1000+ users) | ✅ Bonne |
| **Maintenance** | ✅ Simple | ⚠️ Gestion connexions |
| **Standard** | REST classique | W3C (pro) |
| **Reconnexion auto** | ❌ Manuel | ✅ Built-in |

**Verdict** : SSE > Polling pour ce projet

---

## 📊 Estimation Effort Total

| Phase | Backend | Frontend | Total |
|-------|---------|----------|-------|
| SSE Jobs Pipeline | 10 min | 5 min | 15 min |
| SSE Status (bloquer boutons) | 5 min | 5 min | 10 min |
| Page /runs | 5 min | 20 min | 25 min |
| Tests + Debug | - | - | 10 min |
| **TOTAL** | **20 min** | **30 min** | **60 min** |

---

## ✅ Recommandations

### Faire maintenant (Phase 1 + 2)
1. ✅ SSE pour jobs pipeline
2. ✅ SSE pour bloquer boutons
3. ✅ Retirer PipelineLog du catalogue

**Effort** : 25 min
**Gains** : Updates temps réel + UX propre

### Faire après (Phase 3)
4. ⏭️ Page `/runs` avec historique
5. ⏭️ ReactFlow pour visualiser runs

**Effort** : 25 min
**Gains** : Historique + meilleure visibilité

### Ne PAS faire
- ❌ SSE pour KPIs (peu utile)
- ❌ SSE pour costs (inutile)
- ❌ SSE unifié (trop complexe)

---

## 🚀 Next Steps

1. **Valider ce plan** avec le user
2. **Implémenter Phase 1** (job-stream)
3. **Implémenter Phase 2** (status-stream)
4. **Tester** avec extraction + enrichissement réels
5. **Créer page /runs** (Phase 3)
6. **Retirer** PipelineLog de catalog/page.tsx

---

## 📝 Notes Techniques

### Gestion Reconnexion
```typescript
// Frontend gère automatiquement la reconnexion
eventSource.onerror = (error) => {
  console.log('SSE disconnected, will retry...');
  // EventSource reconnecte automatiquement après 3s
};
```

### Arrêt Propre
```python
# Backend: loop infinie OK, FastAPI tue le generator quand client déconnecte
# Pas besoin de cleanup manuel
```

### Performance
- 1 connexion SSE = ~1KB RAM serveur
- 100 users simultanés = 100KB RAM (négligeable)
- Pas de problème de scale pour ce projet

### Compatibilité
- ✅ Chrome, Firefox, Safari, Edge
- ❌ IE11 (mais qui s'en fout)
- ✅ Mobile (iOS/Android)

---

**Date**: 2026-01-12
**Auteur**: Analyse automatique
**Statut**: ✅ Prêt pour implémentation
