import React, { useState, useEffect } from 'react';
import './StreakCalendar.css';

const StreakCalendar = ({ streakHistory }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState([]);
  const [maxStreak, setMaxStreak] = useState(0);

  // Calculate the maximum streak
  useEffect(() => {
    if (streakHistory && streakHistory.length > 0) {
      let currentStreak = 0;
      let maxStreakCount = 0;
      
      streakHistory.forEach(day => {
        if (day.hasStreak) {
          currentStreak++;
          maxStreakCount = Math.max(maxStreakCount, currentStreak);
        } else {
          currentStreak = 0;
        }
      });
      
      setMaxStreak(maxStreakCount);
    }
  }, [streakHistory]);

  // Generate calendar days for the current month
  useEffect(() => {
    if (!streakHistory) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    
    // Get the day of the week for the first day (0 = Sunday, 1 = Monday, etc.)
    const firstDayOfWeek = firstDay.getDay();
    
    // Total days in the month
    const daysInMonth = lastDay.getDate();
    
    // Create array for all days in the month
    const days = [];
    
    // Add empty slots for days before the first day of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ day: null, hasStreak: false, isEmpty: true });
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      
      // Find if this day has a streak in the history
      const streakDay = streakHistory.find(item => item.date === dateString);
      
      days.push({
        day,
        date: dateString,
        hasStreak: streakDay ? streakDay.hasStreak : false,
        isEmpty: false
      });
    }
    
    setCalendarDays(days);
  }, [currentDate, streakHistory]);

  // Go to previous month
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  // Go to next month
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Format month and year
  const formatMonthYear = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Days of the week
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="streak-calendar-container">
      <div className="streak-calendar-header">
        <button className="calendar-nav-button" onClick={goToPreviousMonth}>
          &lt;
        </button>
        <h2 className="calendar-title">{formatMonthYear(currentDate)}</h2>
        <button className="calendar-nav-button" onClick={goToNextMonth}>
          &gt;
        </button>
      </div>
      
      <div className="max-streak-display">
        <span>Maximum Streak: <strong>{maxStreak}</strong> days</span>
      </div>
      
      <div className="calendar-grid">
        {/* Days of the week headers */}
        {daysOfWeek.map((day, index) => (
          <div key={`header-${index}`} className="calendar-day-header">
            {day}
          </div>
        ))}
        
        {/* Calendar days */}
        {calendarDays.map((day, index) => (
          <div 
            key={`day-${index}`} 
            className={`calendar-day ${day.isEmpty ? 'empty' : ''} ${
              day.hasStreak ? 'has-streak' : day.isEmpty ? '' : 'no-streak'
            } ${new Date().toISOString().split('T')[0] === day.date ? 'today' : ''}`}
          >
            {day.day}
          </div>
        ))}
      </div>
      
      <div className="streak-legend">
        <div className="legend-item">
          <div className="legend-color has-streak"></div>
          <span>Streak Day</span>
        </div>
        <div className="legend-item">
          <div className="legend-color no-streak"></div>
          <span>Missed Day</span>
        </div>
        <div className="legend-item">
          <div className="legend-color today"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};

export default StreakCalendar;
