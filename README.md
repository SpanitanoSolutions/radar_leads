# Radar de leads

Dashboard para un productor asesor de seguros: muestra cada día empresas que
probablemente necesiten un seguro (sociedades nuevas, licitaciones ganadas,
habilitaciones, búsquedas de personal), ordenadas por probabilidad de cierre.

**Estado actual:** las tres pantallas funcionan con datos de ejemplo. Los
scripts que traen datos reales de cada fuente se suman en la próxima etapa.

## Pantallas

- **Leads del día** (`/`): resumen, filtros por sector y por zona que se
  combinan, búsqueda por empresa, localidad o CUIT, y la lista ordenada por score.
- **Ficha del lead** (`/leads/[id]`): por qué aparece, ramos sugeridos, datos
  de la empresa, cobertura actual y seguimiento (estado, notas, recordatorio).
- **Mis sectores** (`/sectores`): qué sectores mostrar y con qué prioridad,
  zonas de la provincia y alcance de licitaciones (municipal, provincial, nacional).

Todo está protegido con una contraseña única (`APP_PASSWORD`).

## Cómo se calcula el score

Cada fuente asigna un `score_base` (0–100) según qué tan urgente es la
necesidad de seguro. La prioridad del sector lo ajusta: **alta +5**,
**media 0**, **baja −15** (ver `src/lib/score.ts`). Alto ≥ 80, medio ≥ 65.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Postgres + Drizzle ORM ·
Vitest · Playwright.

## Correrlo en tu computadora

Necesitas Node 20.9+ y un Postgres (local o en Neon).

```bash
npm install
cp .env.example .env          # completa DATABASE_URL, APP_PASSWORD y SESSION_SECRET
npm run db:migrate            # crea las tablas
npm run db:seed               # sectores, configuración inicial y leads de ejemplo
npm run dev                   # http://localhost:3000
```

## Publicarlo en Vercel (para que tu papá entre desde su computadora)

1. **Base de datos:** crea un proyecto gratis en [Neon](https://neon.tech)
   (o agrega Neon desde el Marketplace de Vercel) y copia la *connection string*
   en su versión **pooled**.
2. **Tablas y datos iniciales:** desde tu computadora, con esa `DATABASE_URL`
   en tu `.env`, corre `npm run db:migrate` y `npm run db:seed`.
3. **Proyecto en Vercel:** "Add New → Project", importa este repo y carga las
   variables de entorno `DATABASE_URL`, `APP_PASSWORD` y `SESSION_SECRET`.
4. Deploy. Pásale a tu papá el link y la contraseña.

Para generar un `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si cambias `SESSION_SECRET`, todas las sesiones abiertas se cierran.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` | Tests unitarios (score, filtros, fechas, sesión) |
| `npm run test:e2e` | Prueba de punta a punta de los flujos (ver abajo) |
| `npm run db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:seed` | Carga datos iniciales y leads de ejemplo (no pisa la configuración) |
| `npm run db:seed -- --reset` | Igual, pero vuelve sectores y zonas a los valores iniciales |
| `npm run db:limpiar-ejemplos` | Borra los leads de ejemplo cuando entren los reales |

### Prueba de punta a punta

Modifica datos, así que córrela contra una base local:

```bash
npm run db:seed -- --reset && npm run build && npm start   # en una terminal
npx playwright install chromium                              # solo la primera vez
npm run test:e2e                                             # en otra terminal
```

Revisa login, filtros combinados, búsqueda, cambio de estado, notas,
configuración de sectores, vista de teléfono sin desborde y cierre de sesión.

## Estructura

```
src/
  app/
    (app)/             pantallas privadas y Server Actions
    login/             login y cierre de sesión
  components/          barra lateral e íconos
  db/                  esquema y conexión (Drizzle)
  lib/                 lógica: score, filtros, fechas, sesión, catálogos
  proxy.ts             redirige al login si no hay sesión
scripts/               seed y limpieza de ejemplos
drizzle/               migraciones SQL
e2e/                   prueba de punta a punta
```

## Próximos pasos

1. Script de **licitaciones adjudicadas** (PBAC, COMPR.AR, CONTRAT.AR).
2. Script del **Boletín Oficial** (sociedades nuevas y transferencias de fondo de comercio).
3. Habilitaciones municipales y búsquedas laborales.
4. Ejecución diaria automática (Vercel Cron).

Los datos que se guardan son de **empresas** (razón social, CUIT, domicilio,
rubro). No se guardan datos personales de los socios que aparecen en los
edictos (Ley 25.326).
