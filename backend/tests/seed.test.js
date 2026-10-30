const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { sembrar, asegurarAdmin } = require('../src/db/seed');

function baseNueva() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));
  return db;
}

const contarUsuarios = (db) => db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;

test('sin cuentas demo solo se cargan líneas y colectivos', () => {
  const db = baseNueva();
  sembrar(db, { cuentasDemo: false });
  assert.equal(contarUsuarios(db), 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lineas').get().n, 3);
});

test('en producción las cuentas demo están desactivadas por defecto', () => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const db = baseNueva();
    sembrar(db);
    assert.equal(contarUsuarios(db), 0);
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test('el admin real se crea desde variables y exige contraseña larga', () => {
  const db = baseNueva();
  assert.equal(asegurarAdmin(db, undefined, undefined), false);
  assert.throws(() => asegurarAdmin(db, 'jefe@pilar.gob.ar', 'corta'));
  assert.equal(asegurarAdmin(db, 'jefe@pilar.gob.ar', 'una-clave-bien-larga'), true);
  assert.equal(db.prepare('SELECT rol FROM usuarios WHERE email = ?').get('jefe@pilar.gob.ar').rol, 'admin');
});
