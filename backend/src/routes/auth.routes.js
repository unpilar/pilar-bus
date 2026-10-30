const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { firmarToken, requiereAuth } = require('../middleware/auth');
const { HttpError } = require('../middleware/errores');
const { enmascarar } = require('../services/sube.service');

const router = express.Router();

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(100),
});

const esquemaLogin = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function publico(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    tarjeta_sube: u.numero_sube ? enmascarar(u.numero_sube) : null,
  };
}

// Registro de pasajeros (los roles chofer/admin se asignan desde la base)
router.post('/registro', (req, res) => {
  const datos = esquemaRegistro.parse(req.body);
  const db = getDb();
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(datos.email)) {
    throw new HttpError(409, 'Ya existe una cuenta con ese email');
  }
  const hash = bcrypt.hashSync(datos.password, 10);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'pasajero')")
    .run(datos.nombre, datos.email, hash);
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ token: firmarToken(usuario), usuario: publico(usuario) });
});

router.post('/login', (req, res) => {
  const { email, password } = esquemaLogin.parse(req.body);
  const usuario = getDb().prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  res.json({ token: firmarToken(usuario), usuario: publico(usuario) });
});

router.get('/yo', requiereAuth, (req, res) => {
  res.json(publico(req.usuario));
});

module.exports = router;
