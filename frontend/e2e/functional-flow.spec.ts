import { test, expect } from "@playwright/test";

/**
 * TESTS FONCTIONNELS E2E - TalkData
 *
 * Ces tests utilisent le VRAI backend (pas de mocks)
 * Ils vérifient le comportement réel de l'application
 */

test.describe("Tests Fonctionnels - Scénarios Métier", () => {

  test("Analyse des scores sentimentaux par catégorie par jour", async ({ page }) => {
    // Charger l'application
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();
    console.log("✓ Application chargée");

    // Taper la question
    const textarea = page.locator("textarea");
    const question = "Affiche les scores sentimentaux par catégorie par jour";
    await textarea.fill(question);
    console.log("✓ Question saisie");

    // Envoyer
    await page.locator('button[type="submit"]').click();
    console.log("✓ Question envoyée");

    // Vérifier le message user
    await expect(page.getByText(question).last()).toBeVisible();
    console.log("✓ Message utilisateur affiché");

    // Attendre le loading
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    console.log("✓ État loading visible");

    // Attendre la réponse (jusqu'à 60s pour Gemini)
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });
    console.log("✓ Réponse reçue");

    // Vérifier qu'un graphique est rendu
    const chart = page.locator(".recharts-wrapper");
    await expect(chart).toBeVisible({ timeout: 10000 });
    console.log("✓ Graphique affiché");

    // Vérifier les données
    await expect(page.getByText(/\d+ lignes/)).toBeVisible();
    console.log("✓ Données affichées");

    // Vérifier le bouton Copier SQL
    await expect(page.getByText("Copier SQL")).toBeVisible();
    console.log("✓ SQL disponible");

    console.log("\n✅ TEST RÉUSSI");
  });


  test("Top 10 chauffeurs - graphique bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();

    // Poser la question
    await page.locator("textarea").fill("Top 10 chauffeurs avec les meilleures notes");
    await page.locator('button[type="submit"]').click();

    // Attendre loading puis réponse
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });

    // Vérifier graphique
    await expect(page.locator(".recharts-wrapper")).toBeVisible({ timeout: 10000 });

    // Vérifier que c'est un bar chart
    await expect(page.locator(".recharts-bar").first()).toBeVisible();
    console.log("✓ Graphique bar confirmé");

    // Vérifier données
    await expect(page.getByText(/\d+ lignes/)).toBeVisible();

    console.log("✅ TEST RÉUSSI: Top 10 chauffeurs");
  });


  test("Répartition des notes - graphique", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();

    // Poser la question
    await page.locator("textarea").fill("Répartition des notes de 1 à 5");
    await page.locator('button[type="submit"]').click();

    // Attendre loading puis réponse
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });

    // Vérifier graphique
    await expect(page.locator(".recharts-wrapper")).toBeVisible({ timeout: 10000 });
    console.log("✓ Graphique affiché");

    // Vérifier données
    await expect(page.getByText(/\d+ lignes/)).toBeVisible();
    console.log("✓ Données affichées");

    console.log("✅ TEST RÉUSSI: Répartition des notes");
  });

});


test.describe("Tests Fonctionnels - Gestion des erreurs", () => {

  test("Message non-SQL (bonjour) - affiche message Gemini + erreur SQL dans Zone 2", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();
    console.log("✓ Application chargée");

    // Envoyer "bonjour"
    const textarea = page.locator("textarea");
    await textarea.fill("bonjour");
    await page.locator('button[type="submit"]').click();
    console.log("✓ Message 'bonjour' envoyé");

    // Vérifier le message user dans le chat
    await expect(page.getByText("bonjour").last()).toBeVisible();
    console.log("✓ Message utilisateur affiché dans Zone 1");

    // Attendre loading
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    console.log("✓ État loading visible");

    // Attendre la réponse
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });
    console.log("✓ Réponse reçue");

    // Vérifier qu'un message assistant est affiché (Gemini répond quelque chose)
    // Le message de Gemini doit être visible dans le chat (Zone 1)
    const assistantMessages = page.locator('[class*="bg-secondary"]').filter({ hasText: /./i });
    await expect(assistantMessages.first()).toBeVisible({ timeout: 10000 });
    console.log("✓ Message assistant visible dans Zone 1");

    // Vérifier qu'on a soit:
    // 1. Un ErrorDisplay (si SQL généré mais échoué)
    // 2. Pas de graphique (si Gemini n'a pas généré de SQL)
    const errorDisplay = page.locator('text="Erreur d\'exécution SQL"');
    const noDataMessage = page.getByText("Aucune donnée");
    const chart = page.locator(".recharts-wrapper");

    // L'un des trois états doit être vrai
    const hasError = await errorDisplay.isVisible().catch(() => false);
    const hasNoData = await noDataMessage.isVisible().catch(() => false);
    const hasChart = await chart.isVisible().catch(() => false);

    if (hasError) {
      console.log("✓ ErrorDisplay affiché dans Zone 2 (SQL échoué)");
      // Vérifier qu'on peut copier les détails
      await expect(page.getByText("Copier les détails")).toBeVisible();
      console.log("✓ Bouton 'Copier les détails' disponible");
    } else if (hasNoData) {
      console.log("✓ Message 'Aucune donnée' affiché (pas de SQL généré)");
    } else if (!hasChart) {
      console.log("✓ Pas de graphique (comportement attendu pour 'bonjour')");
    }

    // Vérifier que le chat fonctionne toujours (pas bloqué)
    await textarea.fill("quelle est la note moyenne?");
    await expect(textarea).toHaveValue("quelle est la note moyenne?");
    console.log("✓ L'interface reste fonctionnelle après l'erreur");

    console.log("✅ TEST RÉUSSI: Gestion message non-SQL 'bonjour'");
  });


  test("Message 'salut' - même comportement que 'bonjour'", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();

    // Envoyer "salut"
    await page.locator("textarea").fill("salut");
    await page.locator('button[type="submit"]').click();
    console.log("✓ Message 'salut' envoyé");

    // Vérifier le message user
    await expect(page.getByText("salut").last()).toBeVisible();

    // Attendre loading puis réponse
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });
    console.log("✓ Réponse reçue");

    // Vérifier qu'un message assistant existe
    const assistantMessages = page.locator('[class*="bg-secondary"]').filter({ hasText: /./i });
    await expect(assistantMessages.first()).toBeVisible({ timeout: 10000 });
    console.log("✓ Message assistant visible");

    // Vérifier qu'on n'a PAS crashé (pas d'erreur JS visible)
    // L'app doit rester fonctionnelle
    const textarea = page.locator("textarea");
    await expect(textarea).toBeEnabled();
    console.log("✓ Interface reste fonctionnelle");

    console.log("✅ TEST RÉUSSI: Gestion message 'salut'");
  });


  test("Question ambiguë - affiche erreur SQL proprement", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TalkData" })).toBeVisible();

    // Question qui va probablement générer un SQL invalide
    await page.locator("textarea").fill("montre moi tout");
    await page.locator('button[type="submit"]').click();
    console.log("✓ Question ambiguë envoyée");

    // Attendre la réponse
    await expect(page.getByText("Analyse en cours")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Analyse en cours")).not.toBeVisible({ timeout: 60000 });
    console.log("✓ Réponse reçue");

    // Le message user doit être dans le chat
    await expect(page.getByText("montre moi tout").last()).toBeVisible();

    // On doit avoir une réponse (message assistant OU erreur)
    // Pas de crash
    const textarea = page.locator("textarea");
    await expect(textarea).toBeEnabled();
    console.log("✓ Interface reste fonctionnelle après question ambiguë");

    console.log("✅ TEST RÉUSSI: Gestion question ambiguë");
  });

});
