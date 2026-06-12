import React, { type CSSProperties, useState, useMemo, useEffect } from 'react';
import type { IEvent } from '../types/event';
import Modal from './Modal';
import EventDetailModal from './EventDetailModal';
import { translateEventStatus } from '../utils/eventHelpers';

interface EventCalendarProps {
  events?: IEvent[];
  onEventClick: (event: IEvent) => void;
  useInternalModal?: boolean; // Si false, utilise uniquement onEventClick
  user?: any; // Utilisateur connecté
  eventAbsences?: any[]; // Liste des absences
  onAbsenceClick?: (participant: any, event: IEvent) => void; // Handler pour marquer absent/présent
  onComedianClick?: (participant: any) => void; // Handler pour cliquer sur un humoriste
  shouldCloseModal?: number; // Incrémenter pour fermer le modal depuis l'extérieur
}

type ViewMode = 'month' | 'week' | 'day';

const EventCalendar = ({
  events = [],
  onEventClick,
  useInternalModal = true,
  user,
  eventAbsences = [],
  onAbsenceClick,
  onComedianClick,
  shouldCloseModal
}: EventCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  // Fermer le modal quand shouldCloseModal change
  useEffect(() => {
    if (shouldCloseModal && shouldCloseModal > 0) {
      closeModal();
    }
  }, [shouldCloseModal]);

  // --- Responsive detection hook ---
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const checkScreenSize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        if (width < 768) setScreenSize('mobile');
        else if (width < 1024) setScreenSize('tablet');
        else setScreenSize('desktop');
      }, 150);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // --- Responsive helper function ---
  const getResponsiveValue = <T,>(mobile: T, tablet: T, desktop: T): T => {
    if (screenSize === 'mobile') return mobile;
    if (screenSize === 'tablet') return tablet;
    return desktop;
  };

  const monthNames = [
    'Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
  ];
  const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  // --- Comparer deux dates en local ---
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  // --- Pré-calculer les événements par jour pour améliorer les performances ---
  const eventsByDate = useMemo(() => {
    const map: Record<string, IEvent[]> = {};
    events.forEach(ev => {
      const d = new Date(ev.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  const getEventsForDate = (date: Date | null) => {
    if (!date) return [];
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return eventsByDate[key] || [];
  };

  // --- Gestion des jours ---
  const getDaysInMonth = (date: Date): (Date | null)[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const getWeekDays = (date: Date): Date[] => {
    const startOfWeek = new Date(date);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day); // semaine commençant lundi
    startOfWeek.setDate(date.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  };

  const today = new Date();
  const isToday = (date: Date | null) => date ? isSameDay(date, today) : false;

  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'month') newDate.setMonth(prev.getMonth() + (direction === 'prev' ? -1 : 1));
      if (viewMode === 'week') newDate.setDate(prev.getDate() + (direction === 'prev' ? -7 : 7));
      if (viewMode === 'day') newDate.setDate(prev.getDate() + (direction === 'prev' ? -1 : 1));
      return newDate;
    });
  };

  const monthDays = useMemo(() => getDaysInMonth(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const dayDays = [currentDate];
  const days = viewMode === 'month' ? monthDays : viewMode === 'week' ? weekDays : dayDays;

  // --- Styles ---
  const calendarStyle: CSSProperties = {
    maxWidth:'1200px',
    width: '100%',
    margin:'0 auto',
    padding: getResponsiveValue('0', '16px', '20px'),
    boxSizing: 'border-box'
  };

  const surfaceBoxStyle: CSSProperties = {
    background: 'var(--ccc-bg-surface)',
    border: '1px solid var(--ccc-border-subtle)',
    borderRadius: 10,
  };

  const calendarHeaderStyle: CSSProperties = {
    ...surfaceBoxStyle,
    display:'flex',
    flexDirection: screenSize === 'mobile' ? 'column' : 'row',
    justifyContent:'space-between',
    alignItems:'center',
    marginBottom:'20px',
    padding:'15px',
    gap: screenSize === 'mobile' ? '12px' : '0'
  };

  const monthTitleStyle: CSSProperties = {
    fontSize: getResponsiveValue('1.2em', '1.3em', '1.5em'),
    fontWeight:'bold',
    color:'#7c3aed',
    textAlign: screenSize === 'mobile' ? 'center' : 'left'
  };

  const navButtonStyle: CSSProperties = {
    padding: getResponsiveValue('10px 14px', '8px 16px', '8px 16px'),
    borderRadius:'8px',
    border:'1px solid var(--ccc-border-subtle)',
    background:'var(--ccc-bg-elevated)',
    color:'#7c3aed',
    fontWeight:'bold',
    cursor:'pointer',
    fontSize:'0.9em',
    transition:'all 0.2s ease',
    minWidth:'44px',
    minHeight:'44px',
    WebkitTapHighlightColor:'rgba(124, 58, 237,0.3)'
  };

  const viewButtonStyle: CSSProperties = {
    padding:'6px 12px',
    marginLeft:'6px',
    borderRadius:'6px',
    border:'1px solid #7c3aed',
    backgroundColor:'transparent',
    color:'#7c3aed',
    cursor:'pointer',
    fontSize: getResponsiveValue('0.75em', '0.8em', '0.85em'),
    fontWeight:'bold',
    minWidth:'44px',
    minHeight:'44px',
    WebkitTapHighlightColor:'rgba(124, 58, 237,0.3)'
  };

  const calendarGridStyle: CSSProperties = {
    ...surfaceBoxStyle,
    display:'grid',
    gridTemplateColumns:`repeat(${viewMode==='month'?7:days.length},1fr)`,
    gap: getResponsiveValue('4px', '6px', '8px'),
    marginBottom:'20px',
    padding: '14px',
    overflowX: screenSize === 'mobile' && viewMode === 'week' ? 'auto' : 'visible',
    WebkitOverflowScrolling: 'touch',
    scrollSnapType: screenSize === 'mobile' && viewMode === 'week' ? 'x mandatory' : 'none'
  };

  const dayHeaderStyle: CSSProperties = {
    padding:'10px',
    textAlign:'center',
    fontWeight:'bold',
    color:'#7c3aed',
    fontSize: getResponsiveValue('0.75em', '0.85em', '0.9em'),
    backgroundColor:'var(--ccc-bg-elevated)',
    borderRadius:'6px',
    border: '1px solid var(--ccc-border-subtle)',
  };

  const dayCellStyle = (todayFlag:boolean): CSSProperties => ({
    minHeight: getResponsiveValue('60px', '80px', '100px'),
    padding:'8px',
    backgroundColor: todayFlag ? 'rgba(124, 58, 237, 0.12)' : 'var(--ccc-bg-elevated)',
    borderRadius:'8px',
    border: todayFlag ? '2px solid #7c3aed' : '1px solid var(--ccc-border-subtle)',
    position:'relative'
  });

  const dayNumberStyle: CSSProperties = {
    fontSize: getResponsiveValue('0.75em', '0.85em', '0.9em'),
    fontWeight:'bold',
    color:'var(--ccc-text-primary)',
    marginBottom:'4px'
  };

  const badgeStyle = (type:string): CSSProperties => {
    const colors:Record<string,string> = { published:'#28a745', completed:'#17a2b8', cancelled:'#dc3545', draft:'#6c757d' };
    const minSize = screenSize === 'mobile' ? '24px' : '18px';
    return {
      display:'inline-block',
      minWidth: minSize,
      minHeight: minSize,
      padding:'2px 6px',
      margin:'2px 2px 0 0',
      fontSize: getResponsiveValue('0.6em', '0.65em', '0.7em'),
      fontWeight:'bold',
      color:'#fff',
      borderRadius:'12px',
      backgroundColor:colors[type] || '#6c757d',
      cursor:'pointer',
      WebkitTapHighlightColor:'rgba(255,255,255,0.3)'
    };
  };

  return (
    <div style={calendarStyle}>
      {/* Header */}
      <div style={calendarHeaderStyle}>
        {screenSize === 'mobile' ? (
          <>
            {/* Mobile layout: 2 rows */}
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%'}}>
              <button onClick={()=>navigate('prev')} style={navButtonStyle}>← Préc</button>
              <h3 style={monthTitleStyle}>
                {viewMode==='month' && `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {viewMode==='week' && `Semaine du ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1} au ${weekDays[6].getDate()}/${weekDays[6].getMonth()+1}`}
                {viewMode==='day' && `${currentDate.getDate()}/${currentDate.getMonth()+1}/${currentDate.getFullYear()}`}
              </h3>
              <button onClick={()=>navigate('next')} style={navButtonStyle}>Suiv →</button>
            </div>
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', width:'100%', gap:'4px'}}>
              <button style={viewButtonStyle} onClick={()=>setViewMode('month')}>Mois</button>
              <button style={viewButtonStyle} onClick={()=>setViewMode('week')}>Semaine</button>
              <button style={viewButtonStyle} onClick={()=>setViewMode('day')}>Jour</button>
            </div>
          </>
        ) : (
          <>
            {/* Tablet/Desktop layout: 1 row */}
            <button onClick={()=>navigate('prev')} style={navButtonStyle}>← Précédent</button>
            <div style={{display:'flex', alignItems:'center'}}>
              <h3 style={monthTitleStyle}>
                {viewMode==='month' && `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
                {viewMode==='week' && `Semaine du ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1} au ${weekDays[6].getDate()}/${weekDays[6].getMonth()+1}`}
                {viewMode==='day' && `${currentDate.getDate()}/${currentDate.getMonth()+1}/${currentDate.getFullYear()}`}
              </h3>
              <button style={viewButtonStyle} onClick={()=>setViewMode('month')}>Mois</button>
              <button style={viewButtonStyle} onClick={()=>setViewMode('week')}>Semaine</button>
              <button style={viewButtonStyle} onClick={()=>setViewMode('day')}>Jour</button>
            </div>
            <button onClick={()=>navigate('next')} style={navButtonStyle}>Suivant →</button>
          </>
        )}
      </div>

      {/* Grid calendrier */}
      <div style={calendarGridStyle}>
        {viewMode==='month' && dayNames.map(d => <div key={d} style={dayHeaderStyle}>{d}</div>)}
        {days.map((day, idx) => {
          const dayEvents = getEventsForDate(day);
          const todayFlag = isToday(day);
          return (
            <div key={idx} style={dayCellStyle(todayFlag)}>
              {day && <div style={dayNumberStyle}>{day.getDate()}</div>}

              {dayEvents.map((ev,i)=>{
                const maxChars = getResponsiveValue(6, 10, 15);
                const displayTitle = ev.title.length > maxChars ? ev.title.slice(0, maxChars) + '…' : ev.title;
                return (
                  <span
                    key={i}
                    style={badgeStyle(ev.status||'draft')}
                    title={ev.title}
                    onClick={() => {
                      if (useInternalModal) {
                        setSelectedEvent(ev);
                        setIsModalOpen(true);
                      }
                      onEventClick(ev);
                    }}
                  >
                    {displayTitle}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      <EventDetailModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedEvent(null); }}
        event={selectedEvent}
        user={user}
        eventAbsences={eventAbsences}
        onAbsenceClick={onAbsenceClick}
        onComedianClick={onComedianClick}
      />
    </div>
  );
};

export default EventCalendar;
