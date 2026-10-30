const express = require('express');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { requiereAuth, requiereRol } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');
const tracking = require('../services/tracking.service');

const router = express.Router();

const id = z.coerce.number().int().positive();

const esquemaPosicion = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  velocidad: z.number().min(0).max(200).nullish(),
  rumbo: z.number().min(0).max(360).nullish(),
});

const esquemaColectivo = z.object({
  interno: z.string().trim().min(1).max(20),
  patente: z.string().trim().max(10).nullish(),
  linea_id: z.number().int().positive(),
});

router.get('/:id', (req, res) => {
  res.json(tracking.formatearColectivo(tracking.obtenerColectivo(id.parse(req.params.id))));
});

router.get('/:id/posiciones', (req, res) => {
  const limite = z.coerce.number().int().min(1).max(500).default(50).parse(req.query.limite);
  res.json(tracking.historialPosiciones(id.parse(req.params.id), limite));
});

// Reporte GPS del dispositivo a bordo (o app del chofer)
router.post('/:id/posicion', requiereAuth, requiereRol('chofer', 'admin'), (req, res) => {
  const resultado = tracking.registrarPosicion(id.parse(req.params.id), esquemaPosicion.parse(req.body));
  res.status(201).json(resultado);
});

router.post('/', requiereAuth, requiereRol('admin'), (req, res) => {
  const datos = esquemaColectivo.parse(req.body);
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM lineas WHERE id = ?').get(datos.linea_id)) {
    throw new HttpError(404, 'Línea no encontrada');
  }
  if (db.prepare('SELECT 1 FROM colectivos WHERE interno = ?').get(datos.interno)) {
    throw new HttpError(409, 'Ya existe un colectivo con ese número de interno');
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO colectivos (interno, patente, linea_id) VALUES (?, ?, ?)')
    .run(datos.interno, datos.patente ?? null, datos.linea_id);
  res.status(201).json(tracking.formatearColectivo(tracking.obtenerColectivo(lastInsertRowid)));
});

module.exports = router;
