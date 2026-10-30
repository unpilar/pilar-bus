const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/database');
const { HttpError } = require('./errores');

function firmarToken(usuario) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Devuelve el usuario del token o null si es inválido
function usuarioDesdeToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return (
      getDb()
        .prepare('SELECT id, nombre, email, rol, numero_sube FROM usuarios WHERE id = ?')
        .get(payload.sub) || null
    );
  } catch {
    return null;
  }
}

function requiereAuth(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Falta el token de autenticación'));
  }
  const usuario = usuarioDesdeToken(token);
  if (!usuario) return next(new HttpError(401, 'Token inválido o vencido'));
  req.usuario = usuario;
  next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return next(new HttpError(403, 'No tenés permisos para esta acción'));
    }
    next();
  };
}

module.exports = { firmarToken, usuarioDesdeToken, requiereAuth, requiereRol };
