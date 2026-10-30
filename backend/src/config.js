const path = require('node:path');

// Carga backend/.env si existe (Node >= 21.7 trae loadEnvFile nativo)
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // Sin archivo .env: se usan variables de entorno y valores por defecto
}

const env = process.env;
const esTest = env.NODE_ENV === 'test';

if (env.NODE_ENV === 'production' && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET es obligatorio en producción');
}

module.exports = {
  port: Number(env.PORT) || 3000,
  dbPath: env.DB_PATH || (esTest ? ':memory:' : path.join(__dirname, '..', 'data', 'pilarbus.db')),
  jwtSecret: env.JWT_SECRET || 'secreto-de-desarrollo',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  corsOrigin: !env.CORS_ORIGIN || env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
  uploadsDir: path.resolve(env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads')),
  subeProvider: env.SUBE_PROVIDER || 'mock',
  desvio: {
    umbralMetros: Number(env.DESVIO_UMBRAL_METROS) || 300,
    reportesConsecutivos: Number(env.DESVIO_REPORTES_CONSECUTIVOS) || 3,
  },
};
