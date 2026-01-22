-- G7 Analytics Database Schema
-- Auto-generated from g7_analytics.duckdb

CREATE TABLE IF NOT EXISTS evaluations (
    cod_taxi INTEGER,
    annee INTEGER,
    mois INTEGER,
    dat_course DATE,
    heure_course TIME,
    num_course BIGINT,
    note_eval DECIMAL(3,2),
    valide VARCHAR(10),
    commentaire TEXT,
    note_commande DECIMAL(3,2),
    note_vehicule DECIMAL(3,2),
    note_chauffeur DECIMAL(3,2),
    typ_client VARCHAR(100),
    typ_chauffeur VARCHAR(100),
    lib_categorie VARCHAR(100),
    cod_client INTEGER,
    lib_racine VARCHAR(50),
    eval_masque VARCHAR(10),
    categories TEXT,
    sentiment_global FLOAT,
    sentiment_par_categorie TEXT,
    verbatim_cle TEXT
);

CREATE TABLE IF NOT EXISTS evaluation_categories (
    num_course BIGINT,
    dat_course DATE,
    cod_taxi INTEGER,
    cod_client INTEGER,
    typ_client VARCHAR(100),
    typ_chauffeur VARCHAR(100),
    offre_commerciale VARCHAR(100),
    note_eval DECIMAL(3,2),
    commentaire TEXT,
    sentiment_global FLOAT,
    categorie VARCHAR(100),
    sentiment_categorie FLOAT,
    verbatim_cle TEXT
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_evaluations_date ON evaluations(dat_course);
CREATE INDEX IF NOT EXISTS idx_evaluations_taxi ON evaluations(cod_taxi);
CREATE INDEX IF NOT EXISTS idx_evaluations_client ON evaluations(cod_client);
CREATE INDEX IF NOT EXISTS idx_evaluation_categories_course ON evaluation_categories(num_course);
CREATE INDEX IF NOT EXISTS idx_evaluation_categories_date ON evaluation_categories(dat_course);
