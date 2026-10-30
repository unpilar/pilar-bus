const config = require('../config');
const { getDb } = require('../db/database');
const { HttpError } = require('../middleware/errores');
const { emitirALinea } = require('../realtime/socket');
const { distanciaARecorrido } = require('./geo');
const { obtenerRecorrido } = require('./recorridos.service');

// Reportes consecutivos fuera del recorrido, por colectivo
const fueraDeRecorrido = new Map();

function obtenerDesvio(id) {
  const desvio = getDb()
    .prepare(
      `SELECT d.*, l.codigo AS linea_codigo, c.interno AS colectivo_interno
       FROM desvios d
       JOIN lineas l ON l.id = d.linea_id
       LEFT JOIN colectivos c ON c.id = d.colectivo_id
       WHERE d.id = ?`
    )
    .get(id);
  if (!desvio) throw new HttpError(404, 'Desvío no encontrado');
  return formatear(desvio);
}

function formatear(d) {
  return { ...d, activo: Boolean(d.activo) };
}

function listarDesvios({ lineaId, soloActivos } = {}) {
  const filtros = [];
  const params = [];
  if (lineaId) {
    filtros.push('d.linea_id = ?');
    params.push(lineaId);
  }
  if (soloActivos) filtros.push('d.activo = 1');
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT d.*, l.codigo AS linea_codigo, c.interno AS colectivo_interno
       FROM desvios d
       JOIN lineas l ON l.id = d.linea_id
       LEFT JOIN colectivos c ON c.id = d.colectivo_id
       ${where}
       ORDER BY d.creado_en DESC, d.id DESC`
    )
    .all(...params)
    .map(formatear);
}

function crearDesvio({ lineaId, colectivoId = null, titulo, descripcion = null, origen, lat = null, lng = null, creadoPor = null }) {
  const linea = getDb().prepare('SELECT id FROM lineas WHERE id = ?').get(lineaId);
  if (!linea) throw new HttpError(404, 'Línea no encontrada');

  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO desvios (linea_id, colectivo_id, titulo, descripcion, origen, lat, lng, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(lineaId, colectivoId, titulo, descripcion, origen, lat, lng, creadoPor);

  const desvio = obtenerDesvio(lastInsertRowid);
  emitirALinea(lineaId, 'desvio:nuevo', desvio);
  return desvio;
}

function finalizarDesvio(id) {
  const desvio = obtenerDesvio(id);
  if (!desvio.activo) throw new HttpError(409, 'El desvío ya estaba finalizado');
  getDb()
    .prepare("UPDATE desvios SET activo = 0, finalizado_en = datetime('now') WHERE id = ?")
    .run(id);
  const actualizado = obtenerDesvio(id);
  emitirALinea(actualizado.linea_id, 'desvio:finalizado', actualizado);
  return actualizado;
}

// Detección automática: si un colectivo reporta N posiciones seguidas lejos del
// recorrido se abre un desvío; cuando vuelve al recorrido se cierra solo.
function evaluarPosicion(colectivo, punto) {
  const recorrido = obtenerRecorrido(colectivo.linea_id);
  if (recorrido.length < 2) return null;

  const distancia = distanciaARecorrido(punto, recorrido);
  const activo = getDb()
    .prepare("SELECT id FROM desvios WHERE colectivo_id = ? AND origen = 'automatico' AND activo = 1")
    .get(colectivo.id);

  if (distancia > config.desvio.umbralMetros) {
    const cuenta = (fueraDeRecorrido.get(colectivo.id) || 0) + 1;
    fueraDeRecorrido.set(colectivo.id, cuenta);
    if (!activo && cuenta >= config.desvio.reportesConsecutivos) {
      return crearDesvio({
        lineaId: colectivo.linea_id,
        colectivoId: colectivo.id,
        titulo: `Interno ${colectivo.interno} fuera de recorrido`,
        descripcion: `El colectivo se encuentra a ${Math.round(distancia)} m del recorrido habitual.`,
        origen: 'automatico',
        lat: punto.lat,
        lng: punto.lng,
      });
    }
  } else {
    fueraDeRecorrido.delete(colectivo.id);
    if (activo) return finalizarDesvio(activo.id);
  }
  return null;
}

function reiniciarEstadoDeteccion() {
  fueraDeRecorrido.clear();
}

module.exports = {
  listarDesvios,
  obtenerDesvio,
  crearDesvio,
  finalizarDesvio,
  evaluarPosicion,
  reiniciarEstadoDeteccion,
};
