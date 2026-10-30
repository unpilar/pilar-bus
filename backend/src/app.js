const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { getDb } = require('./db/database');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');

const estado = { cerrando: false };

function crearApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  // Liveness: el proceso responde
  app.get('/health', (req, res) => res.json({ estado: 'ok' }));

  // Readiness: el balanceador deja de enviar tráfico cuando el proceso se está apagando,
  // lo que permite desplegar versiones nuevas sin cortar el servicio a los pasajeros
  app.get('/ready', (req, res) => {
    if (estado.cerrando) return res.status(503).json({ estado: 'cerrando' });
    getDb().prepare('SELECT 1').get();
    res.json({ estado: 'listo' });
  });

  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/lineas', require('./routes/lineas.routes'));
  app.use('/api/colectivos', require('./routes/colectivos.routes'));
  app.use('/api/desvios', require('./routes/desvios.routes'));
  app.use('/api/suscripciones', require('./routes/suscripciones.routes'));
  app.use('/api/reclamos', require('./routes/reclamos.routes'));
  app.use('/api/sube', require('./routes/sube.routes'));

  app.use(noEncontrado);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp, estado };
