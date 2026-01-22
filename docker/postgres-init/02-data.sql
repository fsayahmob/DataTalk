-- Import data from CSV files
\COPY evaluations FROM '/docker-entrypoint-initdb.d/evaluations.csv' WITH (FORMAT CSV, HEADER true);
\COPY evaluation_categories FROM '/docker-entrypoint-initdb.d/evaluation_categories.csv' WITH (FORMAT CSV, HEADER true);

-- Verify import
DO $$
DECLARE
    eval_count INTEGER;
    cat_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO eval_count FROM evaluations;
    SELECT COUNT(*) INTO cat_count FROM evaluation_categories;
    RAISE NOTICE 'Imported % evaluations and % evaluation_categories', eval_count, cat_count;
END $$;
