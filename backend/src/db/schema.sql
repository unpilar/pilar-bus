PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'pasajero' CHECK (rol IN ('pasajero', 'chofer', 'admin')),
  numero_sube    TEXT,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lineas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo     TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#1565C0',
  activa     INTEGER NOT NULL DEFAULT 1
);

-- El recorrido de una línea es la polilínea que une sus paradas en orden
CREATE TABLE IF NOT EXISTS paradas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  linea_id  INTEGER NOT NULL REFERENCES lineas(id) ON DELETE CASCADE,
  nombre    TEXT NOT NULL,
  lat       REAL NOT NULL,
  lng       REAL NOT NULL,
  orden     INTEGER NOT NULL,
  UNIQUE (linea_id, orden)
);

CREATE TABLE IF NOT EXISTS colectivos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  interno               TEXT NOT NULL UNIQUE,
  patente               TEXT,
  linea_id              INTEGER NOT NULL REFERENCES lineas(id),
  activo                INTEGER NOT NULL DEFAULT 1,
  ultima_lat            REAL,
  ultima_lng            REAL,
  ultima_velocidad      REAL,
  ultimo_rumbo          REAL,
  ultima_actualizacion  TEXT
);

CREATE TABLE IF NOT EXISTS posiciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  colectivo_id   INTEGER NOT NULL REFERENCES colectivos(id) ON DELETE CASCADE,
  lat            REAL NOT NULL,
  lng            REAL NOT NULL,
  velocidad      REAL,
  rumbo          REAL,
  registrado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posiciones_colectivo ON posiciones (colectivo_id, registrado_en);

CREATE TABLE IF NOT EXISTS desvios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  linea_id       INTEGER NOT NULL REFERENCES lineas(id),
  colectivo_id   INTEGER REFERENCES colectivos(id),
  titulo         TEXT NOT NULL,
  descripcion    TEXT,
  origen         TEXT NOT NULL CHECK (origen IN ('manual', 'automatico')),
  lat            REAL,
  lng            REAL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_por     INTEGER REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  finalizado_en  TEXT
);
CREATE INDEX IF NOT EXISTS idx_desvios_linea_activo ON desvios (linea_id, activo);

-- Líneas de las que un usuario quiere recibir alertas
CREATE TABLE IF NOT EXISTS suscripciones (
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  linea_id    INTEGER NOT NULL REFERENCES lineas(id) ON DELETE CASCADE,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (usuario_id, linea_id)
);

CREATE TABLE IF NOT EXISTS reclamos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  linea_id        INTEGER REFERENCES lineas(id),
  colectivo_id    INTEGER REFERENCES colectivos(id),
  categoria       TEXT NOT NULL CHECK (categoria IN ('demora', 'conduccion', 'limpieza', 'estado_unidad', 'trato', 'app', 'otro')),
  descripcion     TEXT NOT NULL,
  foto            TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_revision', 'resuelto', 'rechazado')),
  respuesta       TEXT,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reclamos_usuario ON reclamos (usuario_id);
