# PilarBus – Ecosistema Móvil de Transporte Público

## 🚍👥 'PilarBus' ; Ecosistema Movil de Transporte Publico 
'PilarBus' es una aplicación móvil y plataforma web desarrollada por los estudiantes de la Universidad Nacional del Pilar en conjunto con la Municipalidad para que los ciudadanos visualicen sin ninguna interrupción el recorrido de los colectivos en tiempo real, a su vez que reciba alertas de desvíos, puedan consultar sobre el saldo de su tarjeta SUBE y realizar reclamos. 

Proyecto de la Municipalidad de Pilar junto con la Universidad Nacional de Pilar, desarrollado con
el marco ágil Scrum (Fundamentos del Desarrollo de Software y Metodologías Ágiles – Comisión 3).

**Sitio:** https://unpilar.github.io/pilar-bus/

## Estructura

| Carpeta | Contenido |
|---|---|
| [`frontend/`](frontend) | Demo publicada en GitHub Pages (HTML, CSS y JavaScript). Simula los colectivos y los datos en el navegador, sin necesidad de servidor. |
| [`backend/`](backend) | API REST + tiempo real (Node.js, Express, SQLite, Socket.IO). No está desplegado: se puede correr en local. |

> **Prototipo de demostración:** los colectivos, los desvíos y los datos de SUBE son simulados.
| [`.github/workflows/`](.github/workflows) | Publicación automática en Pages e integración continua del backend. |

## Funcionalidades

| Funcionalidad | Story Points |
|---|---|
| Recorrido de colectivos en tiempo real | – |
| Sistema de reclamos (texto o foto) | 3 |
| Alertas de desvíos | 5 |
| Integración con SUBE (saldo e historial) | 13 |

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Agustín Castillo |
| Scrum Master | Julieta Villegas |
| Diseño UI/UX / Desarrollo Mobile | Diego Breitt |
| Desarrollo Frontend y Backend | Matías Chávez |
| Tester (QA) | Thiago Candela |

Tablero Kanban: https://trello.com/b/WRI8CErk/my-trello-board 

## ‘Pilar Bus: Automatización mediante Pull Requests y CI/CD (Build, Test y Deploy) 
Nuestro repositorio contiene tanto la arquitectura como el código de la aplicación y plataforma web ‘PilarBus’. Garantizando la estabilidad, seguridad y calidad en cada entrega de SO. Para ello, implementamos el uso de Pull Request y la Automatización CI/CD

## Uso del Pull Request: Integracion de beneficios para 'PilarBus'

- Mayor Calidad y Estabilidad; Por la Revisión de Códigos constante, los desarrolladores pueden examinar los cambios antes de fusionarlos, llegando a evitarse bugs/errores o regresiones antes del pase a producción. 

- Colaboración eficiente: Utilidad para la discusión técnica, fomentación de revisión por pares (Code Review) y transferencia de conocimiento entre el equipo, permitiendo el debate de la arquitectura, sugerencia de ideas ante el código y espacio libre para realizar preguntas.

- Pruebas Automatizadas: Utilizando la herramienta de ejecución de CI/CD sobre el código del Pull Request para verificar y asegurar que no se rompa nada existente.

  ## Integracion/Entrega Continua (CI/CD - Build, Test y Deploy)

####    Integracion Continua (CD - Build y Test)
Práctica de desarrollo de software en donde nuestros desarrolladores fusionan cambios de código en un repositorio varias veces al día.

- Build (Compilación): Verifica de que el código de la app móvil, plataforma web y del servidor compile correctamente sin errores de sintaxis 

- Test (Pruebas): Ejecuta scripts de prueba para comprobar que las nuevas líneas de código no rompan funcionalidades anteriores.


#### Entrega Continua y Despliegue Continuo (CD/DC - Deploy)
 En cuanto las pruebas automáticas son válidas por el equipo, aprobando el Pull Request, el sistema hará un despliegue de actualización directamente desde la nube. Mediante estas técnicas sin tiempo de inactividad, el servidor actualiza los servicios en segundo plano, así, asegurando que los pasajeros no tengan ningún problema de interrupciones ante los recorridos de los colectivos en tiempo real. 
