# Almanaque - Planificador de vacaciones

Calendario colaborativo para que grupos de amigos encuentren fechas compatibles para sus vacaciones.

## Funciones

- Enlaces de invitación protegidos mediante UUID y una clave en el fragmento de
  la URL, que no se envía al servidor durante la navegación.
- Identidad persistente por dispositivo con token de edición.
- Disponibilidad en tres estados: puedo, quizá y no puedo.
- Marcado de días individuales o rangos de hasta 63 días.
- Recomendación de las mejores ventanas de 3, 5, 7, 10 o 14 días.
- Actualización automática de los cambios del grupo cada 15 segundos.
- Estado de participación y exportación de propuestas en formato `.ics`.
- Preferencias personales de duración, presupuesto, origen y notas.
- Propuestas votables y resumen de votos por participante.
- Administrador del grupo para crear opciones y confirmar la fecha final.
- Enlace administrativo separado para recuperación o traspaso del control.
- Bloqueo del calendario al cerrar la votación y posibilidad de reabrirla.
- Recordatorios preparados para compartir con las personas pendientes.
- Diseño responsive y controles accesibles mediante teclado.

## Desarrollo

Requiere Node.js 22.12 o superior.

```bash
npm install
npm run dev
```

Variables necesarias en `.env`:

```dotenv
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
```

## Base de datos

Antes de desplegar esta versión, aplica las migraciones de
`supabase/migrations` en el proyecto de Supabase:

```bash
supabase db push
```

También puedes pegar el SQL de la migración en el editor SQL de Supabase.

La migración conserva los grupos y disponibilidades existentes. Los grupos
anteriores siguen accesibles mediante su UUID; los nuevos incorporan además una
clave de invitación. Las filas antiguas sin `participant_id` siguen siendo
visibles, pero no se pueden editar desde el flujo nuevo.

La seguridad de edición se implementa mediante funciones `security definer`:
las tablas rechazan escrituras directas del rol anónimo y cada operación valida
un token secreto guardado únicamente en el dispositivo del participante.

Las tablas no permiten lecturas o escrituras directas al rol anónimo. Las
lecturas pasan por funciones que validan la clave de invitación, y las
escrituras validan además el token secreto del participante.

## Stack

- Astro y React
- Tailwind CSS
- Supabase PostgreSQL
- date-fns
- Lucide React
