// Integración con SUBE mediante adaptadores intercambiables.
// No existe una API pública de SUBE: mientras no se acuerde el acceso con el proveedor
// se usa un adaptador simulado ("mock") que devuelve datos deterministas por tarjeta.
// Para la integración real, implementar un adaptador con la misma interfaz
// (consultarSaldo, consultarViajes) y seleccionarlo con SUBE_PROVIDER.
const crypto = require('node:crypto');
const config = require('../config');
const { HttpError } = require('../middleware/errores');

const LARGO_TARJETA = 16;

function validarNumero(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');
  if (limpio.length !== LARGO_TARJETA) {
    throw new HttpError(400, `El número de tarjeta SUBE debe tener ${LARGO_TARJETA} dígitos`);
  }
  return limpio;
}

// Nunca se devuelve el número completo: dato sensible
function enmascarar(numero) {
  return `${'*'.repeat(LARGO_TARJETA - 4)}${numero.slice(-4)}`;
}

// Generador pseudoaleatorio con semilla, para que cada tarjeta tenga siempre los mismos datos
function generador(semilla) {
  let estado = crypto.createHash('sha256').update(semilla).digest().readUInt32LE(0);
  return () => {
    estado = (estado * 1664525 + 1013904223) % 2 ** 32;
    return estado / 2 ** 32;
  };
}

const adaptadorMock = {
  async consultarSaldo(numero) {
    const rnd = generador(numero);
    const saldo = Math.round((rnd() * 9000 - 500) * 100) / 100;
    return { saldo, moneda: 'ARS', actualizado_en: new Date().toISOString() };
  },

  async consultarViajes(numero, limite) {
    const rnd = generador(`${numero}:viajes`);
    const lineas = ['P1', 'P2', 'P3', '57', '276', '503'];
    const viajes = [];
    let fecha = Date.now();
    for (let i = 0; i < limite; i++) {
      fecha -= Math.floor(rnd() * 36 + 2) * 3_600_000;
      viajes.push({
        fecha: new Date(fecha).toISOString(),
        linea: lineas[Math.floor(rnd() * lineas.length)],
        monto: Math.round((800 + rnd() * 600) * 100) / 100,
      });
    }
    return viajes;
  },
};

const adaptadores = { mock: adaptadorMock };

function adaptador() {
  const a = adaptadores[config.subeProvider];
  if (!a) throw new HttpError(503, `Proveedor SUBE no disponible: ${config.subeProvider}`);
  return a;
}

async function saldo(numero) {
  return { tarjeta: enmascarar(numero), ...(await adaptador().consultarSaldo(numero)) };
}

async function viajes(numero, limite = 10) {
  return { tarjeta: enmascarar(numero), viajes: await adaptador().consultarViajes(numero, limite) };
}

module.exports = { validarNumero, enmascarar, saldo, viajes };
