/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Point d'entrée serveur Full-Stack (Express + Vite Middleware en dev / Fichiers statiques en prod)
 */

import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './src/server/app.ts';
import { getDb } from './src/server/db.ts';

dotenv.config();

async function startServer() {
  // Initialisation de la base SQLite et du jeu d'essai synthétique au démarrage
  getDb();

  const app = createApiApp();
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Mercator CRM] Serveur Full-Stack démarré sur http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Erreur fatale au démarrage du serveur:', err);
  process.exit(1);
});
