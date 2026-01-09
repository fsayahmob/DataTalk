# Migration Plateforme Data G7
## "On migre vers OpenShift" — Oui, mais concrètement ?

---

## Slide 1 — Notre plateforme aujourd'hui

### 6 sources de données hétérogènes

| Source | Type |
|--------|------|
| Informix | Base de données |
| Oracle | Base de données |
| MySQL | Base de données |
| PostgreSQL | Base de données |
| Fichiers plats | CSV / TXT (positions GPS) |
| RabbitMQ | Messages (événements courses) |

### Architecture actuelle

```
Sources (6)
    │
    ▼
┌─────────────────┐
│   etl_ingest    │  ◄── Python
│   (ingestion)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │  ◄── Data Warehouse
│   + PL/SQL      │      + Agrégations KPIs
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   API Spring    │  ◄── Java
│   + Dashboard   │
└─────────────────┘

     Orchestré par : Airflow
     Infra : Docker + GitLab CI/CD + DataDog
```

**TOTAL : 6 briques techniques interdépendantes**

---

## Slide 2 — La réponse qu'on nous a donnée

> **"On migre vers OpenShift"**

C'est tout.

### Analogie

| Question | Réponse reçue |
|----------|---------------|
| "C'est quoi l'architecture cible ?" | "OpenShift" |
| "C'est quoi ta nouvelle voiture ?" | "C'est du Michelin" |

**Ce n'est pas une réponse.**

---

## Slide 3 — OpenShift, c'est quoi exactement ?

### OpenShift = Kubernetes entreprise (Red Hat)

| ✅ CE QUE C'EST | ❌ CE QUE CE N'EST PAS |
|-----------------|------------------------|
| Orchestrateur de conteneurs | Un Data Warehouse |
| Plateforme pour déployer des apps | Un ETL |
| Gestion de pods, scaling, réseau | Un outil de BI |
| Infrastructure | Une solution data clé en main |

### En résumé

> **OpenShift = le "terrain" sur lequel on construit**
>
> Mais on ne nous dit pas **QUOI** construire dessus.

---

## Slide 4 — Les questions sans réponse

| Question | Réponse actuelle |
|----------|------------------|
| PostgreSQL → reste PostgreSQL ou change ? | ❓ |
| Stockage → où vont les données ? (Ceph, MinIO, NFS ?) | ❓ |
| Airflow → quel executor ? (Celery, Kubernetes ?) | ❓ |
| Sources → Informix/Oracle restent on-premise ? | ❓ |
| Volumétrie → combien de To à migrer ? | ❓ |
| Backup → quelle stratégie ? | ❓ |
| Réseau → comment on accède aux sources ? | ❓ |
| Sécurité → RBAC, chiffrement ? | ❓ |

### ⚠️ SANS CES RÉPONSES, PAS DE PLAN DE MIGRATION

---

## Slide 5 — Scénario 1 : Lift & Shift

### "On prend tout et on déplace tel quel"

```
AVANT (VM)                      APRÈS (OpenShift)
─────────────                   ─────────────────
PostgreSQL      ──────────►     PostgreSQL (Pod + PV)
Airflow         ──────────►     Airflow (Pods)
etl_ingest      ──────────►     etl_ingest (Jobs)
API Spring      ──────────►     API Spring (Pod)
RabbitMQ        ──────────►     RabbitMQ (Pod + PV)
```

| ✅ Avantages | ❌ Inconvénients |
|--------------|------------------|
| Rapide | On garde la dette technique |
| Peu de refactoring | Pas d'optimisation |
| Risque limité | Juste un changement d'infra |

**📅 Effort : Moyen**

---

## Slide 6 — Scénario 2 : Refactoring partiel

### "On modernise certaines briques"

| Ce qui reste | Ce qui change |
|--------------|---------------|
| PostgreSQL | PL/SQL → **dbt** (transformations) |
| API Spring | Fichiers → **MinIO** (stockage S3) |
| | Airflow → **Argo Workflows** |

| ✅ Avantages | ❌ Inconvénients |
|--------------|------------------|
| Modernisation ciblée | Plus de travail |
| Meilleure maintenabilité | Tests de non-régression |
| Cloud-native progressif | Montée en compétence |

**📅 Effort : Important**

---

## Slide 7 — Scénario 3 : Rebuild complet

### "On reconstruit from scratch sur OpenShift"

```
NOUVELLE ARCHITECTURE MODERNE

Sources ──► Kafka ──► Spark ──► Iceberg/Delta Lake ──► Trino

Orchestration : Argo Workflows
Stockage : MinIO (S3-compatible)
Catalogue : Apache Iceberg
```

| ✅ Avantages | ❌ Inconvénients |
|--------------|------------------|
| Architecture moderne | Coût énorme |
| Scalabilité | 6-12 mois minimum |
| Best practices 2024 | Risque projet élevé |

**📅 Effort : Très important**

---

## Slide 8 — Alternative : Faut-il vraiment OpenShift ?

### Questions à se poser

- L'architecture actuelle fonctionne-t-elle ?
- Quel est le **VRAI problème** qu'on essaie de résoudre ?
- A-t-on les compétences K8s/OpenShift en interne ?

### Alternatives plus simples

| Option | Description |
|--------|-------------|
| **A : Rester sur VMs** | Moderniser les outils (Ansible, Terraform, meilleur monitoring) |
| **B : Cloud managé** | AWS RDS, GCP Cloud SQL... Moins d'ops, plus de focus data |
| **C : Docker Compose + VM** | Simple, éprouvé, pas de surcharge K8s |

### ⚠️ OpenShift n'est pas une fin en soi

---

## Slide 9 — Ce qu'on attend pour avancer

Pour valider une migration, nous avons besoin de :

| # | Élément requis |
|---|----------------|
| 1️⃣ | **Schéma d'architecture cible** — Pas juste "OpenShift", mais chaque composant |
| 2️⃣ | **Plan de migration par brique** — PostgreSQL → ? / Airflow → ? / API → ? |
| 3️⃣ | **Stratégie de stockage** — Où vont nos X To de données ? |
| 4️⃣ | **Plan de rollback** — Si ça échoue, on fait quoi ? |
| 5️⃣ | **Période de cohabitation** — Ancien et nouveau système en parallèle ? |

### 📌 SANS CES ÉLÉMENTS, NOUS NE POUVONS PAS ENGAGER LA MIGRATION DE MANIÈRE RESPONSABLE

---

## Slide 10 — Conclusion

| | |
|---|---|
| ✅ | OpenShift **peut** être une bonne solution |
| ❌ | Mais "on migre vers OpenShift" **n'est pas un plan** |
| 📋 | On a besoin d'une **architecture cible détaillée** |
| 🤝 | On est **prêts à collaborer** sur la définition |

---

## Prochaine étape proposée

> **Atelier technique avec l'équipe OpenShift**
> pour définir l'architecture cible **ensemble**

---

## Annexe — Comparatif des scénarios

| Critère | Lift & Shift | Refactoring | Rebuild |
|---------|--------------|-------------|---------|
| **Durée** | 1-2 mois | 3-6 mois | 6-12 mois |
| **Risque** | Faible | Moyen | Élevé |
| **Coût** | € | €€ | €€€ |
| **Modernisation** | Aucune | Partielle | Totale |
| **Compétences requises** | K8s basique | K8s + nouvelles technos | Expertise data moderne |
| **ROI court terme** | Non | Partiel | Non |
| **ROI long terme** | Faible | Moyen | Élevé |

---

## Annexe — Architecture cible à définir

```
┌─────────────────────────────────────────────────────────────────┐
│                      OPENSHIFT CLUSTER                          │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Ingestion  │    │  Stockage   │    │   Compute   │        │
│   │  ????????   │    │  ????????   │    │  ????????   │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Catalogue  │    │   Serving   │    │  Orchestr.  │        │
│   │  ????????   │    │  ????????   │    │  ????????   │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

À REMPLIR ENSEMBLE
```
