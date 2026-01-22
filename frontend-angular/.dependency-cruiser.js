/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ═══════════════════════════════════════════════════════════
    // RÈGLE 1: Pas de dépendances circulaires
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Les dépendances circulaires créent du couplage et des bugs',
      from: {},
      to: {
        circular: true,
      },
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 2: Features ne peuvent pas s'importer entre elles
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-feature-to-feature',
      severity: 'error',
      comment:
        'Les features doivent être indépendantes. Utiliser core/shared pour partager.',
      from: {
        path: '^src/app/features/([^/]+)/',
      },
      to: {
        path: '^src/app/features/(?!\\1)[^/]+/',
      },
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 3: Composants ne peuvent pas importer HttpClient
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-http-in-components',
      severity: 'error',
      comment:
        'Les appels HTTP doivent être dans les services, pas les composants',
      from: {
        path: '\\.component\\.ts$',
      },
      to: {
        path: '@angular/common/http',
      },
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 4: Core ne peut pas dépendre de features
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-core-to-features',
      severity: 'error',
      comment: 'Core est la base, il ne peut pas dépendre des features',
      from: {
        path: '^src/app/core/',
      },
      to: {
        path: '^src/app/features/',
      },
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 5: Shared ne peut dépendre de rien (sauf Angular)
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-shared-to-app',
      severity: 'error',
      comment: 'Shared doit être autonome',
      from: {
        path: '^src/app/shared/',
      },
      to: {
        path: '^src/app/(core|features|layout)/',
      },
    },

    // ═══════════════════════════════════════════════════════════
    // RÈGLE 6: Pas d'import de fichiers spec dans le code
    // ═══════════════════════════════════════════════════════════
    {
      name: 'no-spec-imports',
      severity: 'error',
      comment:
        'Les fichiers de test ne doivent pas être importés dans le code',
      from: {
        pathNot: '\\.spec\\.ts$',
      },
      to: {
        path: '\\.spec\\.ts$',
      },
    },
  ],

  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {
      dot: {
        theme: {
          graph: { splines: 'ortho' },
        },
      },
    },
  },
};
