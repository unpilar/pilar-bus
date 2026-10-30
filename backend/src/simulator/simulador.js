// Simula los GPS de los colectivos recorriendo sus líneas.
// Uso: npm run simular [-- --desvio]   (con --desvio el primer colectivo se sale del recorrido)
const API = process.env.API_URL || 'http://localhost:3000';
const INTERVALO_MS = Number(process.env.SIM_INTERVALO_MS) || 2000;
const PASOS_POR_TRAMO = 15;
const conDesvio = process.argv.includes('--desvio');

async function api(ruta, opciones = {}, token) {
  const res = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const cuerpo = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${ruta}: ${res.status} ${JSON.stringify(cuerpo)}`);
  return cuerpo;
}

// Puntos intermedios entre paradas, ida y vuelta
function trayecto(paradas) {
  const puntos = [];
  const ida = [...paradas, ...paradas.slice(0, -1).reverse()];
  for (let i = 0; i < ida.length - 1; i++) {
    for (let p = 0; p < PASOS_POR_TRAMO; p++) {
      const t = p / PASOS_POR_TRAMO;
      puntos.push({
        lat: ida[i].lat + (ida[i + 1].lat - ida[i].lat) * t,
        lng: ida[i].lng + (ida[i + 1].lng - ida[i].lng) * t,
      });
    }
  }
  return puntos;
}

async function main() {
  const { token } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'chofer@pilarbus.local', password: 'chofer123' }),
  });

  const unidades = [];
  for (const linea of await api('/api/lineas')) {
    const { paradas } = await api(`/api/lineas/${linea.id}`);
    const puntos = trayecto(paradas);
    const colectivos = await api(`/api/lineas/${linea.id}/colectivos`);
    colectivos.forEach((c, i) => {
      unidades.push({ ...c, codigo: linea.codigo, puntos, paso: Math.floor((i * puntos.length) / colectivos.length) });
    });
  }
  console.log(`Simulando ${unidades.length} colectivos cada ${INTERVALO_MS} ms (Ctrl+C para salir)`);

  setInterval(async () => {
    for (const [i, u] of unidades.entries()) {
      const punto = { ...u.puntos[u.paso % u.puntos.length] };
      // El primer colectivo se desplaza ~1 km al norte durante un tramo de su recorrido
      if (conDesvio && i === 0 && u.paso % u.puntos.length < 20) punto.lat += 0.01;
      u.paso++;
      try {
        const { desvio } = await api(
          `/api/colectivos/${u.id}/posicion`,
          { method: 'POST', body: JSON.stringify({ ...punto, velocidad: 20 + Math.random() * 25 }) },
          token
        );
        if (desvio) console.log(`[${u.codigo}] Desvío ${desvio.activo ? 'detectado' : 'finalizado'}: ${desvio.titulo}`);
      } catch (err) {
        console.error(`Interno ${u.interno}: ${err.message}`);
      }
    }
  }, INTERVALO_MS);
}

main().catch((err) => {
  console.error('No se pudo iniciar el simulador:', err.message);
  process.exit(1);
});
