const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { requiereAuth, requiereRol } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');
const desvios = require('../services/desvios.service');

const router = express.Router();

const id = z.coerce.number().int().positive();

const esquemaDesvio = z.object({
  linea_id: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(150),
  descripcion: z.string().trim().max(1000).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
});

router.get('/', (req, res) => {
  const lineaId = req.query.linea ? id.parse(req.query.linea) : undefined;
  res.json(desvios.listarDesvios({ lineaId, soloActivos: req.query.todos !== '1' }));
});

// Desvíos activos de las líneas a las que está suscripto el usuario
router.get('/mis-lineas', requiereAuth, (req, res) => {
  const lineas = getDb()
    .prepare('SELECT linea_id FROM suscripciones WHERE usuario_id = ?')
    .all(req.usuario.id)
    .map((s) => s.linea_id);
  res.json(desvios.listarDesvios({ soloActivos: true }).filter((d) => lineas.includes(d.linea_id)));
});

router.get('/:id', (req, res) => {
  res.json(desvios.obtenerDesvio(id.parse(req.params.id)));
});

// Alta manual (p. ej. corte de calle informado por el municipio)
router.post('/', requiereAuth, requiereRol('admin'), (req, res) => {
  const datos = esquemaDesvio.parse(req.body);
  if ((datos.lat == null) !== (datos.lng == null)) {
    throw new HttpError(400, 'lat y lng deben enviarse juntos');
  }
  const desvio = desvios.crearDesvio({
    lineaId: datos.linea_id,
    titulo: datos.titulo,
    descripcion: datos.descripcion ?? null,
    origen: 'manual',
    lat: datos.lat ?? null,
    lng: datos.lng ?? null,
    creadoPor: req.usuario.id,
  });
  res.status(201).json(desvio);
});

router.patch('/:id/finalizar', requiereAuth, requiereRol('admin'), (req, res) => {
  res.json(desvios.finalizarDesvio(id.parse(req.params.id)));
});

module.exports = router;
