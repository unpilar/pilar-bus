const { getDb } = require('../db/database');
const { HttpError } = require('../middleware/errores');
const { emitirALinea } = require('../realtime/socket');
const { evaluarPosicion } = require('./desvios.service');
const { distanciaMetros } = require('./geo');

// Una unidad sin reportar en este lapso se muestra como "sin señal"
const MINUTOS_SIN_SENAL = 5;
// Velocidad usada para estimar arribos cuando el colectivo no informa la suya
const VELOCIDAD_PROMEDIO_KMH = 20;

function formatearColectivo(c) {
  const tienePosicion = c.ultima_lat !== null && c.ultima_lng !== null;
  const ultima = c.ultima_actualizacion ? new Date(`${c.ultima_actualizacion}Z`) : null;
  const enServicio = Boolean(ultima && Date.now() - ultima.getTime() < MINUTOS_SIN_SENAL * 60_000);
  return {
    id: c.id,
    interno: c.interno,
    patente: c.patente,
    linea_id: c.linea_id,
    activo: Boolean(c.activo),
    en_servicio: enServicio,
    posicion: tienePosicion
      ? {
          lat: c.ultima_lat,
          lng: c.ultima_lng,
          velocidad: c.ultima_velocidad,
          rumbo: c.ultimo_rumbo,
          actualizado_en: c.ultima_actualizacion,
        }
      : null,
  };
}

function obtenerColectivo(id) {
  const c = getDb().prepare('SELECT * FROM colectivos WHERE id = ?').get(id);
  if (!c) throw new HttpError(404, 'Colectivo no encontrado');
  return c;
}

function listarColectivosDeLinea(lineaId) {
  return getDb()
    .prepare('SELECT * FROM colectivos WHERE linea_id = ? AND activo = 1 ORDER BY interno')
    .all(lineaId)
    .map(formatearColectivo);
}

function registrarPosicion(colectivoId, { lat, lng, velocidad = null, rumbo = null }) {
  const colectivo = obtenerColectivo(colectivoId);
  if (!colectivo.activo) throw new HttpError(409, 'El colectivo está dado de baja');

  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO posiciones (colectivo_id, lat, lng, velocidad, rumbo) VALUES (?, ?, ?, ?, ?)'
    ).run(colectivoId, lat, lng, velocidad, rumbo);
    db.prepare(
      `UPDATE colectivos
       SET ultima_lat = ?, ultima_lng = ?, ultima_velocidad = ?, ultimo_rumbo = ?,
           ultima_actualizacion = datetime('now')
       WHERE id = ?`
    ).run(lat, lng, velocidad, rumbo, colectivoId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const actualizado = formatearColectivo(obtenerColectivo(colectivoId));
  emitirALinea(colectivo.linea_id, 'colectivo:posicion', actualizado);
  const desvio = evaluarPosicion(colectivo, { lat, lng });
  return { colectivo: actualizado, desvio };
}

function historialPosiciones(colectivoId, limite = 50) {
  obtenerColectivo(colectivoId);
  return getDb()
    .prepare(
      `SELECT lat, lng, velocidad, rumbo, registrado_en FROM posiciones
       WHERE colectivo_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(colectivoId, limite);
}

// Estimación simple de arribo: distancia en línea recta / velocidad
function proximosArribos(paradaId) {
  const parada = getDb().prepare('SELECT * FROM paradas WHERE id = ?').get(paradaId);
  if (!parada) throw new HttpError(404, 'Parada no encontrada');

  const arribos = listarColectivosDeLinea(parada.linea_id)
    .filter((c) => c.en_servicio && c.posicion)
    .map((c) => {
      const distancia = distanciaMetros(c.posicion, parada);
      const velocidad = c.posicion.velocidad > 5 ? c.posicion.velocidad : VELOCIDAD_PROMEDIO_KMH;
      return {
        colectivo: c,
        distancia_metros: Math.round(distancia),
        minutos_estimados: Math.max(1, Math.round(distancia / ((velocidad * 1000) / 60))),
      };
    })
    .sort((a, b) => a.distancia_metros - b.distancia_metros);

  return { parada, arribos };
}

module.exports = {
  obtenerColectivo,
  formatearColectivo,
  listarColectivosDeLinea,
  registrarPosicion,
  historialPosiciones,
  proximosArribos,
};
