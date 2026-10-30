const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const config = require('../config');
const { getDb } = require('../db/database');
const { requiereAuth, requiereRol } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');

const router = express.Router();
router.use(requiereAuth);

const TIPOS_IMAGEN = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const CATEGORIAS = ['demora', 'conduccion', 'limpieza', 'estado_unidad', 'trato', 'app', 'otro'];
const ESTADOS = ['pendiente', 'en_revision', 'resuelto', 'rechazado'];

fs.mkdirSync(config.uploadsDir, { recursive: true });

const subida = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${TIPOS_IMAGEN[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_IMAGEN[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, 'La foto debe ser JPG, PNG o WEBP'));
  },
});

const id = z.coerce.number().int().positive();
const idOpcional = z.preprocess((v) => (v === '' ? undefined : v), id.optional());

const esquemaReclamo = z.object({
  categoria: z.enum(CATEGORIAS),
  descripcion: z.string().trim().min(10).max(2000),
  linea_id: idOpcional,
  colectivo_id: idOpcional,
});

const esquemaGestion = z
  .object({
    estado: z.enum(ESTADOS).optional(),
    respuesta: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.estado || d.respuesta, { message: 'Enviar estado y/o respuesta' });

function formatear(r) {
  const { foto, ...resto } = r;
  return { ...resto, tiene_foto: Boolean(foto), foto_url: foto ? `/api/reclamos/${r.id}/foto` : null };
}

function obtenerReclamo(reclamoId, usuario) {
  const r = getDb().prepare('SELECT * FROM reclamos WHERE id = ?').get(reclamoId);
  // Un pasajero no puede saber si existen reclamos ajenos
  if (!r || (usuario.rol !== 'admin' && r.usuario_id !== usuario.id)) {
    throw new HttpError(404, 'Reclamo no encontrado');
  }
  return r;
}

function borrarArchivo(archivo) {
  if (archivo) fs.rm(archivo.path, { force: true }, () => {});
}

// Alta de reclamo: JSON o multipart/form-data con campo "foto" opcional
router.post('/', subida.single('foto'), (req, res) => {
  try {
    const datos = esquemaReclamo.parse(req.body ?? {});
    const db = getDb();
    if (datos.linea_id && !db.prepare('SELECT 1 FROM lineas WHERE id = ?').get(datos.linea_id)) {
      throw new HttpError(404, 'Línea no encontrada');
    }
    let lineaId = datos.linea_id ?? null;
    if (datos.colectivo_id) {
      const colectivo = db.prepare('SELECT linea_id FROM colectivos WHERE id = ?').get(datos.colectivo_id);
      if (!colectivo) throw new HttpError(404, 'Colectivo no encontrado');
      lineaId ??= colectivo.linea_id;
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO reclamos (usuario_id, linea_id, colectivo_id, categoria, descripcion, foto)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.usuario.id, lineaId, datos.colectivo_id ?? null, datos.categoria, datos.descripcion, req.file?.filename ?? null);
    res.status(201).json(formatear(obtenerReclamo(lastInsertRowid, req.usuario)));
  } catch (err) {
    borrarArchivo(req.file);
    throw err;
  }
});

// Pasajero: sus reclamos. Admin: todos, con filtros opcionales
router.get('/', (req, res) => {
  const filtros = [];
  const params = [];
  if (req.usuario.rol !== 'admin') {
    filtros.push('usuario_id = ?');
    params.push(req.usuario.id);
  }
  if (req.query.estado) {
    filtros.push('estado = ?');
    params.push(z.enum(ESTADOS).parse(req.query.estado));
  }
  if (req.query.linea) {
    filtros.push('linea_id = ?');
    params.push(id.parse(req.query.linea));
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const reclamos = getDb()
    .prepare(`SELECT * FROM reclamos ${where} ORDER BY creado_en DESC, id DESC`)
    .all(...params);
  res.json(reclamos.map(formatear));
});

router.get('/:id', (req, res) => {
  res.json(formatear(obtenerReclamo(id.parse(req.params.id), req.usuario)));
});

router.get('/:id/foto', (req, res) => {
  const r = obtenerReclamo(id.parse(req.params.id), req.usuario);
  if (!r.foto) throw new HttpError(404, 'El reclamo no tiene foto');
  res.sendFile(path.join(config.uploadsDir, path.basename(r.foto)));
});

router.patch('/:id', requiereRol('admin'), (req, res) => {
  const reclamoId = id.parse(req.params.id);
  const datos = esquemaGestion.parse(req.body);
  const actual = obtenerReclamo(reclamoId, req.usuario);
  getDb()
    .prepare(
      `UPDATE reclamos SET estado = ?, respuesta = ?, actualizado_en = datetime('now') WHERE id = ?`
    )
    .run(datos.estado ?? actual.estado, datos.respuesta ?? actual.respuesta, reclamoId);
  res.json(formatear(obtenerReclamo(reclamoId, req.usuario)));
});

module.exports = router;
