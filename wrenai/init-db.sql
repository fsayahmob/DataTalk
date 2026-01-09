-- Initialisation de la configuration Wren AI pour G7 Analytics
-- Ce script pré-configure la connexion DuckDB

INSERT INTO project (type, display_name, catalog, schema, connection_info, language, created_at, updated_at)
VALUES (
    'DUCKDB',
    'G7 Analytics',
    'memory',
    'main',
    '{"initSql":"CREATE TABLE evaluations AS SELECT * FROM read_parquet(''/usr/src/app/data/evaluations.parquet'');","extensions":[],"configurations":{}}',
    'FR',
    datetime('now'),
    datetime('now')
);
