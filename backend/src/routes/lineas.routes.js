const express = require('express');
const { z } = require('zod');
const { getDb, transaccion } = require('../db/database');
const { requiereAuth, requiereRol } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');
const { listarColectivosDeLinea, proximosArribos } = require('../services/tracking.service');
const { listarDesvios } = require('../services/desvios.service');
const { invalidarRecorrido } = require('../services/recorridos.service');

const router = express.Router();

const id = z.coerce.number().int().positive();

const esquemaParada = z.object({
  nombre: z.string().trim().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const esquemaLinea = z.object({
  codigo: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(1).max(150),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1565C0'),
  paradas: z.array(esquemaParada).min(2),
});

function obtenerLinea(lineaId) {
  const linea = getDb().prepare('SELECT * FROM lineas WHERE id = ?').get(lineaId);
  if (!linea) throw new HttpError(404, 'Línea no encontrada');
  return { ...linea, activa: Boolean(linea.activa) };
}

function detalleLinea(lineaId) {
  return {
    ...obtenerLinea(lineaId),
    paradas: getDb()
      .prepare('SELECT id, nombre, lat, lng, orden FROM paradas WHERE linea_id = ? ORDER BY orden')
      .all(lineaId),
  };
}

router.get('/', (req, res) => {
  const lineas = getDb()
    .prepare(
      `SELECT l.*,
         (SELECT COUNT(*) FROM colectivos c WHERE c.linea_id = l.id AND c.activo = 1) AS colectivos,
         (SELECT COUNT(*) FROM desvios d WHERE d.linea_id = l.id AND d.activo = 1) AS desvios_activos
       FROM lineas l WHERE l.activa = 1 ORDER BY l.codigo`
    )
    .all()
    .map((l) => ({ ...l, activa: Boolean(l.activa) }));
  res.json(lineas);
});

router.get('/:id', (req, res) => {
  res.json(detalleLinea(id.parse(req.params.id)));
});

router.get('/:id/colectivos', (req, res) => {
  const lineaId = id.parse(req.params.id);
  obtenerLinea(lineaId);
  res.json(listarColectivosDeLinea(lineaId));
});

router.get('/:id/desvios', (req, res) => {
  const lineaId = id.parse(req.params.id);
  obtenerLinea(lineaId);
  res.json(listarDesvios({ lineaId, soloActivos: req.query.todos !== '1' }));
});

router.get('/:id/paradas/:paradaId/arribos', (req, res) => {
  const lineaId = id.parse(req.params.id);
  const paradaId = id.parse(req.params.paradaId);
  const resultado = proximosArribos(paradaId);
  if (resultado.parada.linea_id !== lineaId) throw new HttpError(404, 'Parada no encontrada');
  res.json(resultado);
});

// --- Administración ---

router.post('/', requiereAuth, requiereRol('admin'), (req, res) => {
  const datos = esquemaLinea.parse(req.body);
  if (getDb().prepare('SELECT 1 FROM lineas WHERE codigo = ?').get(datos.codigo)) {
    throw new HttpError(409, 'Ya existe una línea con ese código');
  }
  const lineaId = transaccion((db) => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO lineas (codigo, nombre, color) VALUES (?, ?, ?)')
      .run(datos.codigo, datos.nombre, datos.color);
    const ins = db.prepare('INSERT INTO paradas (linea_id, nombre, lat, lng, orden) VALUES (?, ?, ?, ?, ?)');
    datos.paradas.forEach((p, i) => ins.run(lastInsertRowid, p.nombre, p.lat, p.lng, i + 1));
    return Number(lastInsertRowid);
  });
  res.status(201).json(detalleLinea(lineaId));
});

// Reemplaza el recorrido completo (las paradas cambian según el feedback de los usuarios)
router.put('/:id/paradas', requiereAuth, requiereRol('admin'), (req, res) => {
  const lineaId = id.parse(req.params.id);
  obtenerLinea(lineaId);
  const paradas = z.array(esquemaParada).min(2).parse(req.body);
  transaccion((db) => {
    db.prepare('DELETE FROM paradas WHERE linea_id = ?').run(lineaId);
    const ins = db.prepare('INSERT INTO paradas (linea_id, nombre, lat, lng, orden) VALUES (?, ?, ?, ?, ?)');
    paradas.forEach((p, i) => ins.run(lineaId, p.nombre, p.lat, p.lng, i + 1));
  });
  invalidarRecorrido(lineaId);
  res.json(detalleLinea(lineaId));
});

module.exports = router;
