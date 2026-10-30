const { getDb } = require('../db/database');

// Caché en memoria del recorrido (paradas ordenadas) de cada línea
const cache = new Map();

function obtenerRecorrido(lineaId) {
  if (!cache.has(lineaId)) {
    const paradas = getDb()
      .prepare('SELECT id, nombre, lat, lng, orden FROM paradas WHERE linea_id = ? ORDER BY orden')
      .all(lineaId);
    cache.set(lineaId, paradas);
  }
  return cache.get(lineaId);
}

function invalidarRecorrido(lineaId) {
  if (lineaId === undefined) cache.clear();
  else cache.delete(lineaId);
}

module.exports = { obtenerRecorrido, invalidarRecorrido };
