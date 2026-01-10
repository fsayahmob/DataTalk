import { test, expect } from "@playwright/test";

/**
 * TESTS FONCTIONNELS E2E - G7 Analytics
 *
 * Ces tests utilisent le VRAI backend (pas de mocks)
 * Ils vérifient le comportement réel de l'application
 */

test.describe("Tests Fonctionnels - Scénarios Métier", () => {

  test("Analyse des scores sentimentaux par catégorie par jour", async ({ page }) => {
    // Charger l'application
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "G7 Analytics" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "G7 Analytics" })).toBeVisible();

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
    await expect(page.getByRole("heading", { name: "G7 Analytics" })).toBeVisible();

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
