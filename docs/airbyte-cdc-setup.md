# Configuration Airbyte CDC pour PostgreSQL RDS → DuckDB

## Prérequis RDS

1. **Activer la réplication logique**
   ```bash
   # Dans AWS Console
   RDS > Parameter Groups > Create parameter group

   # Paramètres requis:
   rds.logical_replication = 1
   wal_level = logical
   max_replication_slots = 5
   max_wal_senders = 5
   ```

2. **Appliquer le parameter group et redémarrer**

## Configuration PostgreSQL

```sql
-- 1. Créer l'utilisateur de réplication
CREATE USER airbyte_cdc WITH REPLICATION PASSWORD 'your_secure_password';

-- 2. Permissions
GRANT USAGE ON SCHEMA public TO airbyte_cdc;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO airbyte_cdc;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO airbyte_cdc;

-- 3. Créer la publication
CREATE PUBLICATION airbyte_pub FOR ALL TABLES;

-- 4. Vérifier
SELECT * FROM pg_publication;
SELECT * FROM pg_replication_slots;
```

## Configuration Airbyte

### Source (PostgreSQL)
```yaml
Host: your-db.eu-west-3.rds.amazonaws.com
Port: 5432
Database: your_database
Username: airbyte_cdc
Password: your_secure_password
SSL Mode: require

Replication Method: Logical Replication (CDC)
Publication: airbyte_pub
Replication Slot: airbyte_slot_1
```

### Destination (DuckDB)
```yaml
Destination Path: /path/to/analytics.duckdb
Schema: main
```

### Sync Configuration
```yaml
Sync Mode: Incremental | Append + Deduped
Cursor Field: updated_at
Primary Key: id
Sync Frequency: Realtime (CDC continuous)
```

## Monitoring

```sql
-- Vérifier le lag de réplication
SELECT
    slot_name,
    plugin,
    slot_type,
    restart_lsn,
    confirmed_flush_lsn,
    pg_current_wal_lsn() - confirmed_flush_lsn AS replication_lag
FROM pg_replication_slots
WHERE slot_name = 'airbyte_slot_1';

-- Voir les événements capturés
SELECT * FROM pg_stat_replication;
```

## Latence attendue

- **CDC Mode**: < 1 seconde
- **CPU Impact**: +5-10% sur RDS
- **Storage**: WAL ~100MB/jour (dépend du volume)

## Troubleshooting

### Le slot de réplication ne fonctionne pas
```sql
-- Recréer le slot
SELECT pg_drop_replication_slot('airbyte_slot_1');
SELECT pg_create_logical_replication_slot('airbyte_slot_1', 'pgoutput');
```

### Erreur "too many replication slots"
```sql
-- Augmenter dans parameter group
max_replication_slots = 10
-- Puis redémarrer RDS
```
