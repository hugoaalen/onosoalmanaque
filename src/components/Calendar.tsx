import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  addMonths, subMonths, isSameDay, startOfWeek, endOfWeek 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
);

export default function Calendar({ groupId }: { groupId: string }) {
  const [userName, setUserName] = useState('');
  const [selectedDates, setSelectedDates] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchAvailability();
    const channel = supabase.channel('changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability' }, fetchAvailability)
      .subscribe();
    return () => { supabase.removeChannel(channel) };
  }, [groupId]);

  async function fetchAvailability() {
    const { data } = await supabase.from('availability').select('*').eq('group_id', groupId);
    if (data) setSelectedDates(data);
  }

  const toggleDate = async (date: Date) => {
    if (!userName.trim()) return alert("⚠️ Escribe tu nombre primero");
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = selectedDates.find(d => d.date === dateStr && d.user_name === userName);

    if (existing) {
      await supabase.from('availability').delete().eq('id', existing.id);
    } else {
      await supabase.from('availability').insert({ group_id: groupId, user_name: userName, date: dateStr });
    }
  };

  // Lógica de fechas para el grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
      {/* HEADER: Nombre y Mes */}
      <div className="p-6 border-b bg-gray-50">
        <input 
          className="w-full p-3 border-2 border-blue-100 rounded-lg focus:border-blue-500 outline-none transition-all mb-6 text-lg"
          placeholder="Tu nombre para marcar..." 
          value={userName}
          onChange={(e) => setUserName(e.target.value)} 
        />
        
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold capitalize text-gray-700">
            {format(currentMonth, 'MMMM yyyy', { locale: es })}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><ChevronLeft /></button>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><ChevronRight /></button>
          </div>
        </div>
      </div>

      {/* GRID DEL CALENDARIO */}
      <div className="grid grid-cols-7 bg-gray-200 gap-[1px]">
        {/* Días de la semana */}
        {weekDays.map(day => (
          <div key={day} className="bg-gray-100 p-2 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}

        {/* Celdas de los días */}
        {calendarDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const usersHere = selectedDates.filter(d => d.date === dateStr);
          const isSelectedByMe = usersHere.some(u => u.user_name === userName);
          const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);

          return (
            <div 
              key={day.toString()}
              onClick={() => toggleDate(day)}
              className={`
                min-h-[100px] p-2 cursor-pointer transition-all relative
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}
                ${isSelectedByMe ? 'bg-green-50' : 'hover:bg-blue-50'}
              `}
            >
              <span className={`text-sm font-semibold ${isSelectedByMe ? 'text-green-700' : ''}`}>
                {format(day, 'd')}
              </span>
              
              <div className="flex flex-col gap-1 mt-1">
                {usersHere.map(u => (
                  <div key={u.id} className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-sm truncate">
                    {u.user_name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}