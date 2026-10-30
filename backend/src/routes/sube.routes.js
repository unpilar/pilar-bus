const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { requiereAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');
const sube = require('../services/sube.service');

const router = express.Router();
router.use(requiereAuth);

function tarjetaDelUsuario(usuario) {
  if (!usuario.numero_sube) {
    throw new HttpError(404, 'No tenés una tarjeta SUBE vinculada. Usá PUT /api/sube/tarjeta');
  }
  return usuario.numero_sube;
}

router.put('/tarjeta', (req, res) => {
  const numero = sube.validarNumero(req.body?.numero);
  getDb().prepare('UPDATE usuarios SET numero_sube = ? WHERE id = ?').run(numero, req.usuario.id);
  res.json({ tarjeta: sube.enmascarar(numero) });
});

router.delete('/tarjeta', (req, res) => {
  getDb().prepare('UPDATE usuarios SET numero_sube = NULL WHERE id = ?').run(req.usuario.id);
  res.status(204).end();
});

router.get('/saldo', async (req, res) => {
  res.json(await sube.saldo(tarjetaDelUsuario(req.usuario)));
});

router.get('/viajes', async (req, res) => {
  const limite = z.coerce.number().int().min(1).max(50).default(10).parse(req.query.limite);
  res.json(await sube.viajes(tarjetaDelUsuario(req.usuario), limite));
});

module.exports = router;
