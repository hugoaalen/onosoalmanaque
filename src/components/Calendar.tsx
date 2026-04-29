import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  addMonths, subMonths, isSameDay, startOfWeek, endOfWeek 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Copy, Calendar as CalendarIcon } from 'lucide-react';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

// Función para generar colores consistentes basados en el nombre
const getUserColor = (name: string) => {
  const colors = [
    'bg-red-500', 'bg-blue-500', 'bg-emerald-500', 
    'bg-amber-500', 'bg-violet-500', 'bg-pink-500', 
    'bg-indigo-500', 'bg-orange-500', 'bg-cyan-500'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export default function Calendar({ groupId }: { groupId: string }) {
  const [userName, setUserName] = useState('');
  const [groupName, setGroupName] = useState('Cargando grupo...');
  const [selectedDates, setSelectedDates] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchGroupName();
    fetchAvailability();

    // Suscripción Realtime mejorada
    const channel = supabase.channel(`group-${groupId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'availability',
        filter: `group_uuid=eq.${groupId}` 
      }, fetchAvailability)
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [groupId]);

  async function fetchGroupName() {
    const { data } = await supabase.from('groups').select('name').eq('id', groupId).single();
    if (data) setGroupName(data.name);
  }

  async function fetchAvailability() {
    const { data } = await supabase.from('availability').select('*').eq('group_uuid', groupId);
    if (data) setSelectedDates(data);
  }

  const toggleDate = async (date: Date) => {
    if (!userName.trim()) return alert("⚠️ Escribe tu nombre primero");
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = selectedDates.find(d => d.date === dateStr && d.user_name === userName);

    // Optimistic UI: Actualizamos antes de que responda la DB
    if (existing) {
      setSelectedDates(prev => prev.filter(d => d.id !== existing.id));
      await supabase.from('availability').delete().eq('id', existing.id);
    } else {
      const newEntry = { 
        group_uuid: groupId, 
        user_name: userName, 
        date: dateStr, 
        id: Math.random().toString() 
      };
      setSelectedDates(prev => [...prev, newEntry]);
      await supabase.from('availability').insert({ 
        group_uuid: groupId, 
        user_name: userName, 
        date: dateStr 
      });
    }
    fetchAvailability();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("🚀 Enlace copiado. Pásalo por el grupo de WhatsApp.");
  };

  // Lógica del Grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="max-w-5xl mx-auto p-4 animate-in fade-in duration-700">
      {/* Header Profesional */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold uppercase tracking-widest text-xs mb-2">
            <CalendarIcon size={14} />
            <span>Planificador de Grupo</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900">{groupName}</h1>
        </div>
        <button 
          onClick={copyLink}
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all shadow-sm font-medium"
        >
          <Copy size={18} />
          Copiar Enlace Privado
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/60 overflow-hidden border border-slate-100">
        <div className="p-8 border-b border-slate-50 bg-slate-50/50">
          <label className="block text-sm font-bold text-slate-500 mb-2 ml-1 uppercase tracking-tight">Tu Identidad</label>
          <input 
            className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all text-lg font-medium"
            placeholder="Escribe tu nombre (ej: Nacho)..." 
            value={userName}
            onChange={(e) => setUserName(e.target.value)} 
          />
          
          <div className="flex items-center justify-between mt-8">
            <h2 className="text-2xl font-bold capitalize text-slate-800">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <div className="flex gap-3">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-3 hover:bg-white hover:shadow-md border border-transparent hover:border-slate-100 rounded-2xl transition-all text-slate-600"><ChevronLeft /></button>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-3 hover:bg-white hover:shadow-md border border-transparent hover:border-slate-100 rounded-2xl transition-all text-slate-600"><ChevronRight /></button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 bg-slate-100 gap-px">
          {weekDays.map(day => (
            <div key={day} className="bg-white p-4 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
              {day}
            </div>
          ))}

          {calendarDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const usersHere = selectedDates.filter(d => d.date === dateStr);
            const isSelectedByMe = usersHere.some(u => u.user_name === userName);
            const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);
            const isToday = isSameDay(day, new Date());

            return (
              <div 
                key={day.toString()}
                onClick={() => toggleDate(day)}
                className={`
                  min-h-[120px] p-3 cursor-pointer transition-all relative group
                  ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-300'}
                  ${isSelectedByMe ? 'bg-blue-50/30' : 'hover:bg-slate-50'}
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`
                    text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                    ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : ''}
                    ${isSelectedByMe && !isToday ? 'text-blue-600' : ''}
                  `}>
                    {format(day, 'd')}
                  </span>
                </div>
                
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  {usersHere.map(u => (
                    <div 
                      key={u.id} 
                      className={`text-[10px] text-white px-2 py-1 rounded-lg font-bold shadow-sm animate-in zoom-in-95 duration-300 truncate ${getUserColor(u.user_name)}`}
                    >
                      {u.user_name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}