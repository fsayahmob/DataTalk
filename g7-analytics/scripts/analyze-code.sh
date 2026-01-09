#!/bin/bash
# Script d'analyse de dette technique et qualité du code
# Usage: ./scripts/analyze-code.sh [--full]

set -e

# Couleurs
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Chemin du projet
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  G7 Analytics - Analyse du Code${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# ============================================
# 1. DUPLICATION DE CODE
# ============================================
echo -e "${BLUE}[1/6] Recherche de duplications...${NC}"

# SVG inline (devrait utiliser icons.tsx)
SVG_COUNT=$(grep -r "<svg" src/components --include="*.tsx" 2>/dev/null | grep -v "icons.tsx" | wc -l | tr -d ' ')
if [ "$SVG_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}WARNING${NC}: $SVG_COUNT SVG inline trouvés (utiliser icons.tsx)"
    grep -r "<svg" src/components --include="*.tsx" 2>/dev/null | grep -v "icons.tsx" | head -5
else
    echo -e "  ${GREEN}OK${NC}: Pas de SVG inline hors icons.tsx"
fi

# Couleurs hardcodées répétées
HARDCODED_COLORS=$(grep -roh "hsl([^)]*)" src/components --include="*.tsx" 2>/dev/null | sort | uniq -c | sort -rn | head -5)
UNIQUE_COLORS=$(echo "$HARDCODED_COLORS" | wc -l | tr -d ' ')
if [ "$UNIQUE_COLORS" -gt 3 ]; then
    echo -e "  ${YELLOW}INFO${NC}: $UNIQUE_COLORS couleurs HSL hardcodées (considérer CSS variables)"
fi

echo ""

# ============================================
# 2. COMPLEXITE DES COMPOSANTS
# ============================================
echo -e "${BLUE}[2/6] Analyse de la complexité...${NC}"

# Fichiers > 300 lignes
LARGE_FILES=$(find src -name "*.tsx" -exec wc -l {} \; 2>/dev/null | awk '$1 > 300 {print $1 " " $2}' | sort -rn)
if [ -n "$LARGE_FILES" ]; then
    echo -e "  ${YELLOW}WARNING${NC}: Fichiers volumineux (>300 lignes):"
    echo "$LARGE_FILES" | while read line; do
        echo "    - $line"
    done
else
    echo -e "  ${GREEN}OK${NC}: Pas de fichiers >300 lignes"
fi

# Comptage des useState par fichier
echo -e "  ${BLUE}States par composant:${NC}"
for file in src/app/page.tsx src/components/*.tsx; do
    if [ -f "$file" ]; then
        STATE_COUNT=$(grep -c "useState" "$file" 2>/dev/null || true)
        STATE_COUNT=${STATE_COUNT:-0}
        STATE_COUNT=$(echo "$STATE_COUNT" | tr -d '[:space:]')
        if [ "$STATE_COUNT" -gt 10 ] 2>/dev/null; then
            echo -e "    ${YELLOW}WARNING${NC}: $(basename $file) - $STATE_COUNT states (considérer useReducer)"
        elif [ "$STATE_COUNT" -gt 5 ] 2>/dev/null; then
            echo -e "    ${BLUE}INFO${NC}: $(basename $file) - $STATE_COUNT states"
        fi
    fi
done

echo ""

# ============================================
# 3. IMPORTS ET DEPENDANCES
# ============================================
echo -e "${BLUE}[3/6] Vérification des imports...${NC}"

# Imports inutilisés (via TypeScript)
if command -v npx &> /dev/null; then
    UNUSED=$(npx tsc --noEmit 2>&1 | grep -c "is declared but" || true)
    UNUSED=${UNUSED:-0}
    UNUSED=$(echo "$UNUSED" | tr -d '[:space:]')
    if [ "$UNUSED" -gt 0 ] 2>/dev/null; then
        echo -e "  ${YELLOW}WARNING${NC}: $UNUSED imports/variables potentiellement inutilisés"
        npx tsc --noEmit 2>&1 | grep "is declared but" | head -5
    else
        echo -e "  ${GREEN}OK${NC}: Pas d'imports inutilisés détectés"
    fi
fi

# Imports depuis index vs imports directs
BARREL_IMPORTS=$(grep -r "from \"@/types\"" src --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo -e "  ${BLUE}INFO${NC}: $BARREL_IMPORTS imports depuis @/types (barrel imports OK)"

echo ""

# ============================================
# 4. PATTERNS ET BEST PRACTICES
# ============================================
echo -e "${BLUE}[4/6] Vérification des patterns...${NC}"

# console.log oubliés
CONSOLE_LOGS=$(grep -r "console.log" src --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "console.error" | wc -l | tr -d ' ')
if [ "$CONSOLE_LOGS" -gt 0 ]; then
    echo -e "  ${YELLOW}WARNING${NC}: $CONSOLE_LOGS console.log trouvés (nettoyer avant prod)"
else
    echo -e "  ${GREEN}OK${NC}: Pas de console.log"
fi

# TODO/FIXME
TODOS=$(grep -rn "TODO\|FIXME\|XXX\|HACK" src --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODOS" -gt 0 ]; then
    echo -e "  ${YELLOW}INFO${NC}: $TODOS TODO/FIXME trouvés:"
    grep -rn "TODO\|FIXME\|XXX\|HACK" src --include="*.tsx" --include="*.ts" 2>/dev/null | head -5
fi

# any types
ANY_TYPES=$(grep -r ": any" src --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANY_TYPES" -gt 0 ]; then
    echo -e "  ${YELLOW}WARNING${NC}: $ANY_TYPES utilisations de 'any' (typer explicitement)"
else
    echo -e "  ${GREEN}OK${NC}: Pas de type 'any'"
fi

# Fonctions async sans try/catch
ASYNC_NO_TRY=$(grep -rn "async.*=>" src --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo -e "  ${BLUE}INFO${NC}: $ASYNC_NO_TRY fonctions async (vérifier gestion d'erreurs)"

echo ""

# ============================================
# 5. STRUCTURE DES FICHIERS
# ============================================
echo -e "${BLUE}[5/6] Structure du projet...${NC}"

# Composants sans "use client"
CLIENT_COMPONENTS=$(find src/components -name "*.tsx" -exec grep -L "use client" {} \; 2>/dev/null | wc -l | tr -d ' ')
TOTAL_COMPONENTS=$(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo -e "  ${BLUE}INFO${NC}: $TOTAL_COMPONENTS composants ($CLIENT_COMPONENTS serveur, $((TOTAL_COMPONENTS - CLIENT_COMPONENTS)) client)"

# Hooks personnalisés
HOOKS_COUNT=$(find src/hooks -name "*.ts" -o -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo -e "  ${BLUE}INFO${NC}: $HOOKS_COUNT hooks personnalisés"

# Fichiers de test
TESTS_COUNT=$(find src -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TESTS_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}WARNING${NC}: Aucun fichier de test trouvé"
else
    echo -e "  ${GREEN}OK${NC}: $TESTS_COUNT fichiers de test"
fi

echo ""

# ============================================
# 6. BACKEND PYTHON
# ============================================
echo -e "${BLUE}[6/6] Analyse backend Python...${NC}"

if [ -d "backend" ]; then
    # Lignes de code
    BACKEND_LINES=$(wc -l backend/*.py 2>/dev/null | tail -1 | awk '{print $1}')
    echo -e "  ${BLUE}INFO${NC}: $BACKEND_LINES lignes de code Python"

    # Fonctions longues (>50 lignes)
    LONG_FUNCS=$(awk '/^def |^async def /{name=$2; start=NR} /^def |^async def |^class /{if(NR-start>50 && name) print name " (" NR-start " lignes)"}' backend/main.py 2>/dev/null)
    if [ -n "$LONG_FUNCS" ]; then
        echo -e "  ${YELLOW}WARNING${NC}: Fonctions longues (>50 lignes):"
        echo "$LONG_FUNCS" | while read line; do echo "    - $line"; done
    fi

    # Imports inutilisés (basique)
    UNUSED_IMPORTS=$(grep "^import\|^from" backend/main.py 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  ${BLUE}INFO${NC}: $UNUSED_IMPORTS imports (vérifier avec pylint si disponible)"
fi

echo ""

# ============================================
# RESUME
# ============================================
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  RESUME${NC}"
echo -e "${BOLD}========================================${NC}"

# Calculer un score simple
ISSUES=0
[ "$SVG_COUNT" -gt 0 ] && ISSUES=$((ISSUES + 1))
[ "$CONSOLE_LOGS" -gt 0 ] && ISSUES=$((ISSUES + 1))
[ "$ANY_TYPES" -gt 0 ] && ISSUES=$((ISSUES + 1))
[ "$TESTS_COUNT" -eq 0 ] && ISSUES=$((ISSUES + 1))

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}Excellent !${NC} Aucun problème majeur détecté."
elif [ "$ISSUES" -le 2 ]; then
    echo -e "${YELLOW}Bon${NC} - $ISSUES points d'attention mineurs."
else
    echo -e "${RED}Attention${NC} - $ISSUES problèmes à traiter."
fi

echo ""
echo -e "${BLUE}Prochaines actions suggérées:${NC}"
[ "$SVG_COUNT" -gt 0 ] && echo "  - Migrer les SVG restants vers icons.tsx"
[ "$CONSOLE_LOGS" -gt 0 ] && echo "  - Supprimer les console.log avant production"
[ "$ANY_TYPES" -gt 0 ] && echo "  - Remplacer les types 'any' par des types explicites"
[ "$TESTS_COUNT" -eq 0 ] && echo "  - Ajouter des tests unitaires"
[ -n "$LARGE_FILES" ] && echo "  - Refactorer les fichiers volumineux"

echo ""
echo -e "${BLUE}Lancez avec --full pour un rapport détaillé${NC}"
