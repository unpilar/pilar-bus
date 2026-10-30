const http = require('node:http');
const config = require('./config');
const { crearApp, estado } = require('./app');
const { getDb, cerrar } = require('./db/database');
const { sembrar, asegurarAdmin } = require('./db/seed');
const { iniciarSocket, cerrarSocket } = require('./realtime/socket');

if (sembrar(getDb())) console.log('Base de datos vacía: se cargaron datos de ejemplo.');
if (asegurarAdmin(getDb())) console.log('Administrador configurado desde ADMIN_EMAIL.');

const server = http.createServer(crearApp());
iniciarSocket(server);

server.listen(config.port, () => {
  console.log(`PilarBus backend escuchando en http://localhost:${config.port}`);
});

// Apagado ordenado: se marca como no listo, se terminan las peticiones en curso y se cierra
function apagar(senal) {
  if (estado.cerrando) return;
  estado.cerrando = true;
  console.log(`${senal} recibido, cerrando...`);
  const forzar = setTimeout(() => process.exit(1), 10_000).unref();
  cerrarSocket().then(() => {
    cerrar();
    clearTimeout(forzar);
    process.exit(0);
  });
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
