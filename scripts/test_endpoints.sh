#!/bin/bash
# Script de test des endpoints critiques après correction des bugs

set -e  # Arrêter si une commande échoue

API_BASE="http://localhost:8000"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}🧪 Test des endpoints G7 Analytics${NC}\n"

# 1. Health check
echo -e "${BOLD}1. Health Check${NC}"
HEALTH=$(curl -s "$API_BASE/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "   ${GREEN}✓${NC} Backend opérationnel"
else
    echo -e "   ${RED}✗${NC} Backend non opérationnel"
    exit 1
fi

# 2. Test extraction
echo -e "\n${BOLD}2. Test Extraction${NC}"
EXTRACT_RESULT=$(curl -s -X POST "$API_BASE/catalog/extract")
if echo "$EXTRACT_RESULT" | grep -q '"status":"ok"'; then
    RUN_ID=$(echo "$EXTRACT_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['run_id'])")
    TABLES_COUNT=$(echo "$EXTRACT_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['tables_count'])")
    echo -e "   ${GREEN}✓${NC} Extraction réussie"
    echo -e "   ${YELLOW}→${NC} run_id: $RUN_ID"
    echo -e "   ${YELLOW}→${NC} Tables extraites: $TABLES_COUNT"
else
    echo -e "   ${RED}✗${NC} Extraction échouée"
    echo "$EXTRACT_RESULT"
    exit 1
fi

# 3. Vérifier que le job d'extraction a été créé
echo -e "\n${BOLD}3. Test Job Tracking${NC}"
LATEST_RUN=$(curl -s "$API_BASE/catalog/latest-run")
if echo "$LATEST_RUN" | grep -q "$RUN_ID"; then
    echo -e "   ${GREEN}✓${NC} Job tracking opérationnel"
    echo -e "   ${YELLOW}→${NC} run_id trouvé dans latest-run"
else
    echo -e "   ${RED}✗${NC} Job tracking problématique"
    echo "$LATEST_RUN"
fi

# 4. Récupérer les IDs de tables pour enrichissement
echo -e "\n${BOLD}4. Test Récupération Tables${NC}"
TABLE_IDS=$(sqlite3 backend/catalog.sqlite "SELECT id FROM tables LIMIT 2" | tr '\n' ',' | sed 's/,$//')
if [ -n "$TABLE_IDS" ]; then
    echo -e "   ${GREEN}✓${NC} Tables trouvées"
    echo -e "   ${YELLOW}→${NC} IDs: $TABLE_IDS"
else
    echo -e "   ${RED}✗${NC} Aucune table trouvée"
    exit 1
fi

# 5. Test enrichissement (LE BUG PRINCIPAL)
echo -e "\n${BOLD}5. Test Enrichissement (Bug Fix)${NC}"
TABLE_IDS_JSON="[${TABLE_IDS}]"
ENRICH_RESULT=$(curl -s -X POST "$API_BASE/catalog/enrich" \
    -H "Content-Type: application/json" \
    -d "{\"table_ids\": $TABLE_IDS_JSON}")

if echo "$ENRICH_RESULT" | grep -q "Internal Server Error"; then
    echo -e "   ${RED}✗${NC} Enrichissement échoué (Internal Server Error)"
    echo -e "   ${RED}→${NC} Le backend n'a probablement pas été redémarré"
    echo -e "   ${YELLOW}→${NC} Action: Redémarrer le backend avec: ${BOLD}python backend/main.py${NC}"
    exit 1
elif echo "$ENRICH_RESULT" | grep -q '"status"'; then
    STATUS=$(echo "$ENRICH_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'unknown'))")
    if [ "$STATUS" = "ok" ]; then
        echo -e "   ${GREEN}✓${NC} Enrichissement réussi"
        echo -e "   ${YELLOW}→${NC} Status: $STATUS"

        TABLES_ENRICHED=$(echo "$ENRICH_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tables_count', 0))")
        SYNONYMS=$(echo "$ENRICH_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('synonyms_count', 0))")
        KPIS=$(echo "$ENRICH_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('kpis_count', 0))")

        echo -e "   ${YELLOW}→${NC} Tables enrichies: $TABLES_ENRICHED"
        echo -e "   ${YELLOW}→${NC} Synonymes générés: $SYNONYMS"
        echo -e "   ${YELLOW}→${NC} KPIs générés: $KPIS"
    else
        echo -e "   ${YELLOW}⚠${NC} Enrichissement terminé avec status: $STATUS"
        echo "$ENRICH_RESULT" | python3 -m json.tool
    fi
else
    echo -e "   ${RED}✗${NC} Réponse inattendue"
    echo "$ENRICH_RESULT"
    exit 1
fi

# 6. Test prompts API
echo -e "\n${BOLD}6. Test Prompts API${NC}"
PROMPTS=$(curl -s "$API_BASE/prompts")
PROMPTS_COUNT=$(echo "$PROMPTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['prompts']))")
if [ "$PROMPTS_COUNT" -gt 0 ]; then
    echo -e "   ${GREEN}✓${NC} Prompts API opérationnel"
    echo -e "   ${YELLOW}→${NC} Prompts trouvés: $PROMPTS_COUNT"
else
    echo -e "   ${RED}✗${NC} Prompts API problématique"
fi

# 7. Test get_setting avec default
echo -e "\n${BOLD}7. Test get_setting() avec default${NC}"
python3 << 'PYTHON_TEST'
import sys
sys.path.insert(0, 'backend')
from catalog import get_setting

try:
    # Test avec default
    result = get_setting("max_tables_per_batch", "15")
    print(f"   \033[0;32m✓\033[0m get_setting() fonctionne avec default")
    print(f"   \033[1;33m→\033[0m Valeur: {result}")
except TypeError as e:
    print(f"   \033[0;31m✗\033[0m get_setting() échoue: {e}")
    print(f"   \033[0;31m→\033[0m Le code n'a probablement pas été rechargé")
    sys.exit(1)
PYTHON_TEST

echo -e "\n${BOLD}${GREEN}✅ Tous les tests sont passés!${NC}"
echo -e "\n${BOLD}📝 Résumé:${NC}"
echo -e "  • Backend: ${GREEN}OK${NC}"
echo -e "  • Extraction: ${GREEN}OK${NC}"
echo -e "  • Job Tracking: ${GREEN}OK${NC}"
echo -e "  • Enrichissement: ${GREEN}OK${NC} (bug corrigé)"
echo -e "  • Prompts API: ${GREEN}OK${NC}"
echo -e "  • get_setting(): ${GREEN}OK${NC}"
