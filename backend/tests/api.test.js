process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.UPLOADS_DIR = require('node:path').join(require('node:os').tmpdir(), 'pilarbus-test-uploads');

const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { crearApp } = require('../src/app');
const { getDb } = require('../src/db/database');
const { sembrar } = require('../src/db/seed');
const { distanciaARecorrido } = require('../src/services/geo');

const app = crearApp();
const tokens = {};

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200);
  return res.body.token;
}

before(async () => {
  sembrar(getDb());
  tokens.admin = await login('admin@pilarbus.local', 'admin123');
  tokens.chofer = await login('chofer@pilarbus.local', 'chofer123');
  tokens.pasajero = await login('pasajero@pilarbus.local', 'pasajero123');
});

const auth = (rol) => ({ Authorization: `Bearer ${tokens[rol]}` });

describe('salud', () => {
  test('health y ready responden', async () => {
    assert.equal((await request(app).get('/health')).status, 200);
    assert.equal((await request(app).get('/ready')).status, 200);
  });
});

describe('autenticación', () => {
  test('registro, login y perfil', async () => {
    const reg = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: 'ana@test.com', password: 'secreta1' });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.usuario.rol, 'pasajero');

    const dup = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Ana', email: 'ANA@test.com', password: 'secreta1' });
    assert.equal(dup.status, 409);

    const yo = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${reg.body.token}`);
    assert.equal(yo.body.email, 'ana@test.com');
  });

  test('credenciales inválidas y datos mal formados', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@pilarbus.local', password: 'x' });
    assert.equal(res.status, 401);
    const inval = await request(app).post('/api/auth/registro').send({ email: 'no-es-email' });
    assert.equal(inval.status, 400);
    assert.ok(inval.body.detalles.length > 0);
  });

  test('rutas protegidas exigen token', async () => {
    assert.equal((await request(app).get('/api/reclamos')).status, 401);
  });
});

describe('líneas y seguimiento', () => {
  test('lista líneas con paradas', async () => {
    const res = await request(app).get('/api/lineas');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 3);
    const detalle = await request(app).get(`/api/lineas/${res.body[0].id}`);
    assert.ok(detalle.body.paradas.length >= 2);
  });

  test('solo chofer/admin reportan posiciones', async () => {
    const pos = { lat: -34.4597, lng: -58.913 };
    const denegado = await request(app).post('/api/colectivos/1/posicion').set(auth('pasajero')).send(pos);
    assert.equal(denegado.status, 403);

    const ok = await request(app).post('/api/colectivos/1/posicion').set(auth('chofer')).send({ ...pos, velocidad: 30 });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.colectivo.en_servicio, true);
    assert.equal(ok.body.desvio, null);

    const colectivos = await request(app).get('/api/lineas/1/colectivos');
    assert.deepEqual(
      [colectivos.body[0].posicion.lat, colectivos.body[0].posicion.lng],
      [pos.lat, pos.lng]
    );
  });

  test('estima arribos a una parada', async () => {
    const res = await request(app).get('/api/lineas/1/paradas/3/arribos');
    assert.equal(res.status, 200);
    assert.ok(res.body.arribos.length >= 1);
    assert.ok(res.body.arribos[0].minutos_estimados >= 1);
  });

  test('admin crea una línea nueva', async () => {
    const res = await request(app)
      .post('/api/lineas')
      .set(auth('admin'))
      .send({
        codigo: 'P9',
        nombre: 'Prueba',
        paradas: [
          { nombre: 'A', lat: -34.46, lng: -58.91 },
          { nombre: 'B', lat: -34.47, lng: -58.9 },
        ],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.paradas.length, 2);
  });
});

describe('desvíos', () => {
  test('detección automática y cierre al volver al recorrido', async () => {
    const fuera = { lat: -34.40, lng: -58.913 }; // ~6 km al norte del recorrido P1
    let res;
    for (let i = 0; i < 3; i++) {
      res = await request(app).post('/api/colectivos/2/posicion').set(auth('chofer')).send(fuera);
    }
    assert.equal(res.body.desvio.origen, 'automatico');
    assert.equal(res.body.desvio.activo, true);

    const activos = await request(app).get('/api/desvios?linea=1');
    assert.equal(activos.body.length, 1);

    res = await request(app)
      .post('/api/colectivos/2/posicion')
      .set(auth('chofer'))
      .send({ lat: -34.465, lng: -58.905 });
    assert.equal(res.body.desvio.activo, false);
    assert.equal((await request(app).get('/api/desvios?linea=1')).body.length, 0);
  });

  test('admin carga y finaliza un desvío manual; pasajero lo ve en sus líneas', async () => {
    await request(app).put('/api/suscripciones/2').set(auth('pasajero')).expect(200);

    const creado = await request(app)
      .post('/api/desvios')
      .set(auth('admin'))
      .send({ linea_id: 2, titulo: 'Corte por obra en Ruta 26' });
    assert.equal(creado.status, 201);

    const mios = await request(app).get('/api/desvios/mis-lineas').set(auth('pasajero'));
    assert.equal(mios.body.length, 1);

    const fin = await request(app).patch(`/api/desvios/${creado.body.id}/finalizar`).set(auth('admin'));
    assert.equal(fin.body.activo, false);
    const otraVez = await request(app).patch(`/api/desvios/${creado.body.id}/finalizar`).set(auth('admin'));
    assert.equal(otraVez.status, 409);
  });

  test('pasajero no puede crear desvíos', async () => {
    const res = await request(app).post('/api/desvios').set(auth('pasajero')).send({ linea_id: 1, titulo: 'x' });
    assert.equal(res.status, 403);
  });
});

describe('reclamos', () => {
  test('alta con foto, consulta y gestión por admin', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const alta = await request(app)
      .post('/api/reclamos')
      .set(auth('pasajero'))
      .field('categoria', 'demora')
      .field('descripcion', 'El colectivo tardó más de 40 minutos')
      .field('colectivo_id', '1')
      .attach('foto', png, { filename: 'foto.png', contentType: 'image/png' });
    assert.equal(alta.status, 201);
    assert.equal(alta.body.linea_id, 1);
    assert.equal(alta.body.tiene_foto, true);

    const foto = await request(app).get(alta.body.foto_url).set(auth('pasajero'));
    assert.equal(foto.status, 200);

    const gest = await request(app)
      .patch(`/api/reclamos/${alta.body.id}`)
      .set(auth('admin'))
      .send({ estado: 'resuelto', respuesta: 'Se habló con la empresa' });
    assert.equal(gest.body.estado, 'resuelto');

    const lista = await request(app).get('/api/reclamos').set(auth('pasajero'));
    assert.equal(lista.body.length, 1);
  });

  test('alta solo texto (JSON) y aislamiento entre usuarios', async () => {
    const alta = await request(app)
      .post('/api/reclamos')
      .set(auth('pasajero'))
      .send({ categoria: 'limpieza', descripcion: 'Asientos sucios en la unidad' });
    assert.equal(alta.status, 201);
    assert.equal(alta.body.foto_url, null);

    const otro = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Beto', email: 'beto@test.com', password: 'secreta1' });
    const ajeno = await request(app)
      .get(`/api/reclamos/${alta.body.id}`)
      .set('Authorization', `Bearer ${otro.body.token}`);
    assert.equal(ajeno.status, 404);
  });

  test('rechaza archivos que no son imágenes', async () => {
    const res = await request(app)
      .post('/api/reclamos')
      .set(auth('pasajero'))
      .field('categoria', 'otro')
      .field('descripcion', 'Prueba con archivo inválido')
      .attach('foto', Buffer.from('hola'), { filename: 'a.txt', contentType: 'text/plain' });
    assert.equal(res.status, 400);
  });
});

describe('SUBE', () => {
  test('vincular tarjeta y consultar saldo/viajes', async () => {
    const sinTarjeta = await request(app).get('/api/sube/saldo').set(auth('pasajero'));
    assert.equal(sinTarjeta.status, 404);

    const invalida = await request(app).put('/api/sube/tarjeta').set(auth('pasajero')).send({ numero: '123' });
    assert.equal(invalida.status, 400);

    const vinc = await request(app)
      .put('/api/sube/tarjeta')
      .set(auth('pasajero'))
      .send({ numero: '6061 2680 1234 5678' });
    assert.equal(vinc.body.tarjeta, '************5678');

    const saldo1 = await request(app).get('/api/sube/saldo').set(auth('pasajero'));
    const saldo2 = await request(app).get('/api/sube/saldo').set(auth('pasajero'));
    assert.equal(typeof saldo1.body.saldo, 'number');
    assert.equal(saldo1.body.saldo, saldo2.body.saldo);

    const viajes = await request(app).get('/api/sube/viajes?limite=5').set(auth('pasajero'));
    assert.equal(viajes.body.viajes.length, 5);
  });
});

describe('geo', () => {
  test('distancia a recorrido', () => {
    const recorrido = [{ lat: -34.46, lng: -58.92 }, { lat: -34.46, lng: -58.90 }];
    assert.ok(distanciaARecorrido({ lat: -34.46, lng: -58.91 }, recorrido) < 1);
    const d = distanciaARecorrido({ lat: -34.45, lng: -58.91 }, recorrido);
    assert.ok(d > 1100 && d < 1120, `distancia inesperada: ${d}`);
  });
});
