const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

let db;

function abrir(ruta = config.dbPath) {
  if (ruta !== ':memory:') {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
  }
  const conexion = new DatabaseSync(ruta);
  conexion.exec('PRAGMA journal_mode = WAL;');
  conexion.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return conexion;
}

function getDb() {
  if (!db) db = abrir();
  return db;
}

function cerrar() {
  if (db) {
    db.close();
    db = undefined;
  }
}

// Ejecuta fn dentro de una transacción; revierte si lanza
function transaccion(fn) {
  const conexion = getDb();
  conexion.exec('BEGIN');
  try {
    const resultado = fn(conexion);
    conexion.exec('COMMIT');
    return resultado;
  } catch (err) {
    conexion.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, cerrar, transaccion };
