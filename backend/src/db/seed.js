// Datos iniciales de ejemplo (coordenadas aproximadas del partido de Pilar)
const bcrypt = require('bcryptjs');

const USUARIOS = [
  { nombre: 'Administración PilarBus', email: 'admin@pilarbus.local', password: 'admin123', rol: 'admin' },
  { nombre: 'Chofer de prueba', email: 'chofer@pilarbus.local', password: 'chofer123', rol: 'chofer' },
  { nombre: 'Pasajero beta', email: 'pasajero@pilarbus.local', password: 'pasajero123', rol: 'pasajero' },
];

const LINEAS = [
  {
    codigo: 'P1',
    nombre: 'Pilar Centro - Presidente Derqui',
    color: '#1565C0',
    paradas: [
      ['Estación Pilar', -34.4597, -58.913],
      ['Plaza 12 de Octubre', -34.4585, -58.9135],
      ['Hospital Sanguinetti', -34.465, -58.905],
      ['Universidad Nacional de Pilar', -34.472, -58.893],
      ['Ruta 234 y Champagnat', -34.48, -58.878],
      ['Estación Derqui', -34.4895, -58.859],
    ],
    colectivos: [['101', 'AB123CD'], ['102', 'AC456EF']],
  },
  {
    codigo: 'P2',
    nombre: 'Pilar Centro - Del Viso',
    color: '#2E7D32',
    paradas: [
      ['Plaza 12 de Octubre', -34.4585, -58.9135],
      ['Panamericana Km 50', -34.447, -58.888],
      ['Villa Rosa', -34.44, -58.865],
      ['Ruta 26', -34.445, -58.83],
      ['Estación Del Viso', -34.4489, -58.7953],
    ],
    colectivos: [['201', 'AD789GH'], ['202', 'AE012IJ']],
  },
  {
    codigo: 'P3',
    nombre: 'Pilar Centro - Manzanares',
    color: '#EF6C00',
    paradas: [
      ['Estación Pilar', -34.4597, -58.913],
      ['Ruta 8 y Ruta 25', -34.455, -58.94],
      ['Fátima', -34.452, -58.97],
      ['Manzanares Centro', -34.45, -59.0],
    ],
    colectivos: [['301', 'AF345KL']],
  },
];

// Las cuentas de prueba tienen contraseñas públicas (están en el repo):
// solo se crean fuera de producción, o si se pide explícitamente con SEED_DEMO=true
function usarCuentasDemo() {
  if (process.env.SEED_DEMO) return process.env.SEED_DEMO === 'true';
  return process.env.NODE_ENV !== 'production';
}

function sembrar(db, { cuentasDemo = usarCuentasDemo() } = {}) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM lineas').get();
  if (total > 0) return false;

  const insUsuario = db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)'
  );
  const insLinea = db.prepare('INSERT INTO lineas (codigo, nombre, color) VALUES (?, ?, ?)');
  const insParada = db.prepare(
    'INSERT INTO paradas (linea_id, nombre, lat, lng, orden) VALUES (?, ?, ?, ?, ?)'
  );
  const insColectivo = db.prepare(
    'INSERT INTO colectivos (interno, patente, linea_id) VALUES (?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    for (const u of cuentasDemo ? USUARIOS : []) {
      insUsuario.run(u.nombre, u.email, bcrypt.hashSync(u.password, 10), u.rol);
    }
    for (const l of LINEAS) {
      const { lastInsertRowid: lineaId } = insLinea.run(l.codigo, l.nombre, l.color);
      l.paradas.forEach(([nombre, lat, lng], i) => insParada.run(lineaId, nombre, lat, lng, i + 1));
      for (const [interno, patente] of l.colectivos) insColectivo.run(interno, patente, lineaId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}

// Crea (o actualiza) el administrador real a partir de variables de entorno del hosting.
// Así la contraseña nunca queda escrita en el repositorio.
function asegurarAdmin(db, email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD) {
  if (!email || !password) return false;
  if (password.length < 10) throw new Error('ADMIN_PASSWORD debe tener al menos 10 caracteres');
  const hash = bcrypt.hashSync(password, 10);
  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) {
    db.prepare("UPDATE usuarios SET password_hash = ?, rol = 'admin' WHERE id = ?").run(hash, existe.id);
  } else {
    db.prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ('Administrador', ?, ?, 'admin')").run(email, hash);
  }
  return true;
}

module.exports = { sembrar, asegurarAdmin, USUARIOS };

if (require.main === module) {
  const { getDb, cerrar } = require('./database');
  const sembrado = sembrar(getDb());
  console.log(sembrado ? 'Base de datos sembrada.' : 'La base ya tenía datos; no se modificó.');
  if (asegurarAdmin(getDb())) console.log('Administrador configurado desde ADMIN_EMAIL.');
  cerrar();
}
