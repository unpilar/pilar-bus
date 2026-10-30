// Canal en tiempo real (Socket.IO).
// Los clientes se unen a la sala "linea:<id>" para recibir posiciones y desvíos de esa línea.
const { Server } = require('socket.io');
const config = require('../config');
const { usuarioDesdeToken } = require('../middleware/auth');

let io = null;

function iniciarSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  // El token es opcional: los pasajeros anónimos también pueden ver el mapa
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.data.usuario = token ? usuarioDesdeToken(token) : null;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('linea:suscribir', (lineaId, ack) => {
      const id = Number(lineaId);
      if (!Number.isInteger(id) || id <= 0) return ack?.({ ok: false, error: 'lineaId inválido' });
      socket.join(`linea:${id}`);
      ack?.({ ok: true });
    });

    socket.on('linea:desuscribir', (lineaId, ack) => {
      socket.leave(`linea:${Number(lineaId)}`);
      ack?.({ ok: true });
    });
  });

  return io;
}

function emitirALinea(lineaId, evento, datos) {
  io?.to(`linea:${lineaId}`).emit(evento, datos);
}

function emitirATodos(evento, datos) {
  io?.emit(evento, datos);
}

function cerrarSocket() {
  return new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));
}

module.exports = { iniciarSocket, emitirALinea, emitirATodos, cerrarSocket };
