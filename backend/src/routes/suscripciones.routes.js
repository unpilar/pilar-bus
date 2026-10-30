const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { requiereAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');

const router = express.Router();
router.use(requiereAuth);

const id = z.coerce.number().int().positive();

function listar(usuarioId) {
  return getDb()
    .prepare(
      `SELECT l.id, l.codigo, l.nombre, l.color, s.creado_en AS suscripto_en
       FROM suscripciones s JOIN lineas l ON l.id = s.linea_id
       WHERE s.usuario_id = ? ORDER BY l.codigo`
    )
    .all(usuarioId);
}

router.get('/', (req, res) => {
  res.json(listar(req.usuario.id));
});

router.put('/:lineaId', (req, res) => {
  const lineaId = id.parse(req.params.lineaId);
  if (!getDb().prepare('SELECT 1 FROM lineas WHERE id = ?').get(lineaId)) {
    throw new HttpError(404, 'Línea no encontrada');
  }
  getDb()
    .prepare('INSERT OR IGNORE INTO suscripciones (usuario_id, linea_id) VALUES (?, ?)')
    .run(req.usuario.id, lineaId);
  res.json(listar(req.usuario.id));
});

router.delete('/:lineaId', (req, res) => {
  getDb()
    .prepare('DELETE FROM suscripciones WHERE usuario_id = ? AND linea_id = ?')
    .run(req.usuario.id, id.parse(req.params.lineaId));
  res.status(204).end();
});

module.exports = router;
