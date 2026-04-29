# ✈️ oNoSoAlMaNaQuE - Planificador de Vacaciones

Un calendario colaborativo en tiempo real diseñado para que grupos de amigos cuadren sus fechas de vacaciones sin fricciones. Olvida las encuestas de WhatsApp; marca tu disponibilidad visualmente y encuentra el "match" perfecto para tu próximo viaje.

![Status](https://img.shields.io/badge/Status-Functional-success)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)
![Supabase](https://img.shields.io/badge/Backend-Supabase-blue?logo=supabase)

---

## ✨ Características Principales

- **🔗 Enlaces Únicos (UUID):** Los grupos se generan con identificadores únicos de 128 bits para garantizar privacidad y evitar que terceros adivinen la URL de tu viaje.
- **⚡ Tiempo Real (Realtime):** Implementado con WebSockets a través de Supabase para ver los cambios de tus amigos al instante sin refrescar la página.
- **🎨 Identidad Visual Dinámica:** Cada usuario recibe un color único generado mediante un algoritmo de *hashing* basado en su nombre.
- **📱 Responsive & Moderno:** Interfaz fluida construida con Tailwind CSS v4, optimizada para móviles y escritorio.
- **🌚 UX Optimizada:** Incluye *Optimistic UI* para que la interacción sea instantánea, ocultando la latencia del servidor.

## 🛠️ Tech Stack

- **Frontend:** [Astro](https://astro.build/) + [React](https://reactjs.org/)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Backend:** [Supabase](https://supabase.com/) (PostgreSQL + Realtime)
- **Iconografía:** [Lucide React](https://lucide.dev/)
- **Gestión de Fechas:** [date-fns](https://date-fns.org/)
