// index.js
import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Tus credenciales de Playtomic
const EMAIL = 'brianbiloni@gmail.com';
const PASSWORD = 'Captalar.7';

const loginAndGetToken = async () => {
  const response = await axios.post(
    'https://playtomic.com/api/v3/auth/login',
    {
      email: EMAIL,
      password: PASSWORD
    },
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.access_token;
};

const formatTime = (isoString) => {
  const dateObj = new Date(isoString);
  return dateObj.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

// Función para convertir fecha DD-MM-YYYY a YYYY-MM-DD - ACTUALIZADA
const convertDateFormat = (dateString) => {
  // Si ya está en formato YYYY-MM-DD completo
  if (dateString.includes('-') && dateString.length === 10) {
    const parts = dateString.split('-');
    if (parts[0].length === 4) {
      return dateString; // Ya está en formato correcto
    }
    // Si está en formato DD-MM-YYYY
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  
  // NUEVO: Manejar formato DD-MM sin año
  if (dateString.includes('-') && dateString.length === 5) {
    const parts = dateString.split('-');
    if (parts.length === 2) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      
      // Validar que día y mes sean válidos
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // getMonth() devuelve 0-11
        const currentDay = currentDate.getDate();
        
        let targetYear = currentYear;
        
        // Si el mes solicitado es menor que el actual, o
        // si es el mismo mes pero el día ya pasó, usar el próximo año
        if (month < currentMonth || 
            (month === currentMonth && day < currentDay)) {
          targetYear = currentYear + 1;
        }
        
        // Excepción: Si estamos en diciembre y piden enero-noviembre del próximo año
        // O si estamos en enero y piden diciembre del año actual
        if (currentMonth === 12 && month <= 11) {
          targetYear = currentYear + 1;
        } else if (currentMonth === 1 && month === 12) {
          targetYear = currentYear; // Diciembre del año actual
        }
        
        // Formatear con ceros a la izquierda
        const formattedMonth = month.toString().padStart(2, '0');
        const formattedDay = day.toString().padStart(2, '0');
        
        return `${targetYear}-${formattedMonth}-${formattedDay}`;
      }
    }
  }
  
  return dateString;
};

// NUEVA FUNCIÓN: construir start_time en formato ISO
// const buildStartTime = (fecha, hora) => {
//   const isoDate = convertDateFormat(fecha); // en formato YYYY-MM-DD
//   return `${isoDate}T${hora}:00`; // se removio la Z en 00Z
// };

const buildStartTime = (fecha, hora) => {
  const isoDate = convertDateFormat(fecha);
  return `${isoDate}T${hora}:00-06:00`; // Especifica timezone México GMT-6
};

// Función para validar formato de hora
const isValidTimeFormat = (time) => {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

// Función para convertir HH:MM a minutos desde medianoche
const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Función para generar un external_id único
const generateExternalId = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `playtomic-${datePart}-${randomPart}`;
};

app.get('/availability', async (req, res) => {
  try {
    const token = await loginAndGetToken();

    // 1. Obtener y validar parámetros obligatorios
    const { date, startTime, duration } = req.query;
    
    // Validar que todos los parámetros obligatorios estén presentes
    if (!date || !startTime || !duration) {
      return res.json({
        external_id: generateExternalId(),
        message: "⚠️ Faltan parámetros obligatorios:\n\n" +
                 "🔸 date: Fecha (YYYY-MM-DD o DD-MM-YYYY)\n" +
                 "🔸 startTime: Hora inicial (HH:MM)\n" +
                 "🔸 duration: Duración (60, 90 o 120)\n\n" +
                 "Ejemplo: /availability?date=2025-06-27&startTime=15:00&duration=90"
      });
    }
    
    // Validar duración
    if (![60, 90, 120].includes(parseInt(duration))) {
      return res.json({
        external_id: generateExternalId(),
        message: "❌ Duración inválida. Valores aceptados: 60, 90 o 120\n\n" +
                 "Ejemplo: /availability?duration=90"
      });
    }
    const durationInt = parseInt(duration);
    
    // Validar formato de hora
    if (!isValidTimeFormat(startTime)) {
      return res.json({
        external_id: generateExternalId(),
        message: '❌ Formato de hora inválido. Use HH:MM (ej: 15:30)'
      });
    }
    
    // Convertir y validar fecha
    const formattedDate = convertDateFormat(date);
    if (!isValidDate(formattedDate)) {
      return res.json({
        external_id: generateExternalId(),
        message: '❌ Fecha inválida. Use YYYY-MM-DD o DD-MM-YYYY'
      });
    }

    // 2. Calcular endTime automáticamente (startTime + 2 horas)
    const endTime = addMinutesToTime(startTime, 120);
    
    // 3. Obtener datos de Playtomic
    const tenantId = 'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178';
    const url = `https://playtomic.com/api/v1/availability?user_id=me&tenant_id=${tenantId}&sport_id=PADEL&start_min=${formattedDate}T00:00:00&start_max=${formattedDate}T23:59:59`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-requested-with': 'com.playtomic.web'
      }
    });

    // 4. FUNCIÓN CORREGIDA: Extraer precio numérico
    const extractPrice = (priceString) => {
      if (typeof priceString === 'number') return priceString;
      if (typeof priceString === 'string') {
        const match = priceString.match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
      }
      return 0;
    };

    // 5. FUNCIÓN CORREGIDA: Crear datetime completo
    const createFullDateTime = (startDate, startTime) => {
      return `${startDate}T${startTime}`;
    };

    // 6. PROCESAMIENTO CORREGIDO: Agrupar por resource_id y procesar
    const courtMap = new Map();
    
    response.data.forEach(item => {
      const resourceId = item.resource_id;
      
      if (!courtMap.has(resourceId)) {
        courtMap.set(resourceId, {
          resource_id: resourceId,
          slots: []
        });
      }
      
      // Procesar cada slot del item actual
      item.slots.forEach(slot => {
        const fullDateTime = createFullDateTime(item.start_date, slot.start_time);
        courtMap.get(resourceId).slots.push({
          ...slot,
          start_time_full: fullDateTime,
          price_numeric: extractPrice(slot.price),
          id: `${resourceId}_${item.start_date}_${slot.start_time}_${slot.duration}` // Generar ID único
        });
      });
    });

    // Convertir Map a Array
    const courtsData = Array.from(courtMap.values());

    // 7. FILTRADO CORREGIDO: Filtrar por duración y rango horario
    const processedData = courtsData.map((court, i) => {
      const filteredSlots = court.slots.filter(slot => {
        // Validar duración
        if (slot.duration !== durationInt) return false;
        
        // Crear objeto Date para comparar horarios
        const slotDateTime = new Date(slot.start_time_full);
        const slotHours = slotDateTime.getHours();
        const slotMinutes = slotDateTime.getMinutes();
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        
        // Calcular diferencia en minutos
        const diffMinutes = (slotHours - startHours) * 60 + (slotMinutes - startMinutes);
        
        return diffMinutes >= 0 && diffMinutes <= 120; // Dentro de las 2 horas siguientes
      });

      return {
        cancha: `Cancha ${i + 1}`,
        resource_id: court.resource_id,
        horarios: filteredSlots.map(slot => ({
          time: slot.start_time, // Ya viene en formato HH:MM:SS
          price: slot.price_numeric,
          slot_id: slot.id,
          start_time_iso: slot.start_time_full,
          duration: slot.duration
        }))
      };
    });

    // 8. Generar respuesta optimizada para Instagram
    const instagramResponse = generateInstagramResponse(processedData, {
      date: formattedDate,
      startTime,
      duration: durationInt
    });
    
    // 9. Enviar respuesta
    res.json({
      external_id: generateExternalId(),
      message: instagramResponse,
      debug: {
        total_courts: courtsData.length,
        raw_data_sample: response.data.slice(0, 2), // Para debugging
        processed_sample: processedData.slice(0, 2)
      }
    });
    
  } catch (err) {
    console.error('Error completo:', err);
    res.json({ 
      external_id: generateExternalId(),
      message: `❌ Error: ${err.message || 'Por favor intenta con otros parámetros'}`,
      error_details: err.response?.data || err.message
    });
  }
});

// Función auxiliar: sumar minutos a una hora
function addMinutesToTime(time, minutesToAdd) {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

// Función auxiliar: validar fecha
function isValidDate(dateString) {
  return !isNaN(Date.parse(dateString));
}


// Función para generar respuesta Instagram - ACTUALIZADA
const generateInstagramResponse = (data, params) => {
  const { date, startTime, duration } = params;
  
  let response = `🎾 ${date} | ${startTime} | ${duration}min\n\n`;
  
  let availableCount = 0;
  
  data.forEach(court => {
    if (court.horarios.length > 0) {
      // Obtener horarios únicos y ordenarlos
      const uniqueTimes = [...new Set(court.horarios.map(slot => {
        // Convertir HH:MM:SS a HH:MM para mostrar
        return slot.time.substring(0, 5);
      }))].sort();
      
      response += `🏟 ${court.cancha.split(' ')[1]}: `;
      
      // Mostrar máximo 2 horarios por cancha
      if (uniqueTimes.length > 2) {
        response += `${uniqueTimes[0]}, ${uniqueTimes[1]}... (+${uniqueTimes.length - 2})\n`;
      } else {
        response += `${uniqueTimes.join(', ')}\n`;
      }
      
      availableCount++;
    }
  });
  
  if (availableCount === 0) {
    return "❌ No hay canchas disponibles\n💡 Prueba otra hora o duración";
  }
  
  // Añadir instrucciones para más detalles
  response += `\n💡 Para ver precios puedes generar una reserva`;
  
  return response;
};

// Endpoint para obtener disponibilidad resumida por horas
app.get('/availability-summary', async (req, res) => {
  try {
    const token = await loginAndGetToken();
    
    let { date, format } = req.query;
    
    if (!date) {
      date = new Date().toISOString().split('T')[0];
    } else {
      date = convertDateFormat(date);
    }

    const tenantId = 'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178';
    const url = `https://playtomic.com/api/v1/availability?user_id=me&tenant_id=${tenantId}&sport_id=PADEL&start_min=${date}T00:00:00&start_max=${date}T23:59:59`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-requested-with': 'com.playtomic.web'
      }
    });

    const rawData = response.data;
    
    // Agrupar por horas
    const hourlyAvailability = {};
    
    rawData.forEach((court, courtIndex) => {
      court.slots.forEach(slot => {
        const hour = formatTime(slot.start_time).split(':')[0] + ':00';
        
        if (!hourlyAvailability[hour]) {
          hourlyAvailability[hour] = {
            hour,
            courts: [],
            totalSlots: 0,
            minPrice: Infinity,
            maxPrice: -Infinity
          };
        }
        
        hourlyAvailability[hour].courts.push({
          court: courtIndex + 1,
          time: formatTime(slot.start_time),
          price: slot.price,
          duration: slot.duration
        });
        
        hourlyAvailability[hour].totalSlots++;
        hourlyAvailability[hour].minPrice = Math.min(hourlyAvailability[hour].minPrice, slot.price);
        hourlyAvailability[hour].maxPrice = Math.max(hourlyAvailability[hour].maxPrice, slot.price);
      });
    });

    const summary = Object.values(hourlyAvailability).sort((a, b) => a.hour.localeCompare(b.hour));

    if (format === 'chat') {
      let response = `🎾 *Resumen de Disponibilidad*\n`;
      response += `📅 *Fecha:* ${date}\n\n`;
      
      if (summary.length === 0) {
        response += `❌ No hay disponibilidad para esta fecha.`;
      } else {
        summary.forEach(hourData => {
          response += `⏰ *${hourData.hour}* - ${hourData.totalSlots} turnos disponibles\n`;
          response += `   💰 Desde $${hourData.minPrice}`;
          if (hourData.minPrice !== hourData.maxPrice) {
            response += ` hasta $${hourData.maxPrice}`;
          }
          response += `\n\n`;
        });
      }
      
      response += `📞 *Para más detalles:* Consulta por horario específico`;
      
      res.json({ 
        message: response,
        data: summary 
      });
    } else {
      res.json(summary);
    }

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ 
      error: 'Error procesando resumen de disponibilidad',
      details: err.message 
    });
  }
});

// const generateBookingLink = (tenantId, resourceId, startTime, duration, slotId) => {
//   // 1) Tomamos YYYY-MM-DDTHH:MM
//   const clean = startTime.substring(0, 16);
//   // 2) Codificamos todo el string, incluyendo los dos puntos
//   const encodedTime = encodeURIComponent(clean);
//   // 3) Armamos la base del parámetro s=
//   const base = `${tenantId}~${resourceId}~${encodedTime}~${duration}`;
//   // 4) Devolvemos el link, añadiendo slotId si existe
//   return slotId
//     ? `https://playtomic.com/checkout/booking?s=${base}~${slotId}`
//     : `https://playtomic.com/checkout/booking?s=${base}`;
// };

// FUNCIÓN CORREGIDA: generar link de reserva
const generateBookingLink = (tenantId, resourceId, startTime, duration, slotId) => {
  // 1) Asegurar que startTime no tenga 'Z' al final
  let cleanTime = startTime;
  if (startTime.endsWith('Z')) {
    cleanTime = startTime.slice(0, -1); // Remover 'Z'
  }
  
  // 2) Tomamos YYYY-MM-DDTHH:MM (sin segundos ni timezone)
  const timeForUrl = cleanTime.substring(0, 16);
  
  // 3) Codificamos para URL
  const encodedTime = encodeURIComponent(timeForUrl);
  
  // 4) Armamos la base del parámetro s=
  const base = `${tenantId}~${resourceId}~${encodedTime}~${duration}`;
  
  // 5) Devolvemos el link
  return slotId
    ? `https://playtomic.com/checkout/booking?s=${base}~${slotId}`
    : `https://playtomic.com/checkout/booking?s=${base}`;
};

// ENDPOINT CORREGIDO: /generate-booking-link (GET) 
app.get('/generate-booking-link', async (req, res) => {
  try {
    const { resource_id, slot_id, start_time, duration } = req.query;

    if (!resource_id || !start_time || !duration) {
      return res.status(400).json({ 
        error: 'Faltan parámetros obligatorios (resource_id, start_time, duration)' 
      });
    }

    // CORREGIDO: limpiar start_time si tiene 'Z'
    let cleanStartTime = start_time;
    if (start_time.endsWith('Z')) {
      cleanStartTime = start_time.slice(0, -1);
    }

    const bookingLink = generateBookingLink(
      'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178', // tenant_id
      resource_id,
      cleanStartTime,
      duration,
      slot_id
    );

    res.json({ 
      booking_link: bookingLink,
      debug: {
        original_start_time: start_time,
        cleaned_start_time: cleanStartTime
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Error generando enlace' });
  }
});

// booking-link pruebas postman
// app.get('/generate-booking-link', async (req, res) => {
//   try {
//     const { resource_id, slot_id, start_time, duration } = req.query;

//     if (!resource_id || !start_time || !duration) {
//   return res.status(400).json({ error: 'Faltan parámetros obligatorios (resource_id, start_time, duration)' });
// }
    
//     // if (!resource_id || !slot_id || !start_time || !duration) {
//     //   return res.status(400).json({ error: 'Parámetros incompletos' });
//     // }

//     const bookingLink = generateBookingLink(
//       'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178', // tenant_id
//       resource_id,
//       start_time,
//       duration,
//       slot_id
//     );

//     res.json({ booking_link: bookingLink });
//   } catch (err) {
//     res.status(500).json({ error: 'Error generando enlace' });
//   }
// });


// ENDPOINT CORREGIDO: /generate-reservation-link (POST)
app.post('/generate-reservation-link', async (req, res) => {
  try {
    const { courtNumber, date, reservationTime, duration } = req.body;

    if (!courtNumber || !date || !reservationTime || !duration) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos',
        required: ['courtNumber', 'date', 'reservationTime', 'duration']
      });
    }

    const token = await loginAndGetToken();
    const tenantId = 'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178';
    
    // Convertir fecha al formato correcto
    const formattedDate = convertDateFormat(date);
    
    const availabilityUrl = `https://playtomic.com/api/v1/availability?user_id=me&tenant_id=${tenantId}&sport_id=PADEL&start_min=${formattedDate}T00:00:00&start_max=${formattedDate}T23:59:59`;

    const response = await axios.get(availabilityUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-requested-with': 'com.playtomic.web'
      }
    });

    const allCourts = response.data;

    // Agrupar por resource_id (igual que en /availability)
    const courtMap = new Map();
    
    allCourts.forEach(item => {
      const resourceId = item.resource_id;
      
      if (!courtMap.has(resourceId)) {
        courtMap.set(resourceId, {
          resource_id: resourceId,
          slots: []
        });
      }
      
      item.slots.forEach(slot => {
        const fullDateTime = `${item.start_date}T${slot.start_time}`;
        courtMap.get(resourceId).slots.push({
          ...slot,
          start_time_full: fullDateTime
        });
      });
    });

    const courtsArray = Array.from(courtMap.values());

    const courtIndex = courtNumber - 1;
    if (courtIndex < 0 || courtIndex >= courtsArray.length) {
      return res.status(400).json({ 
        error: 'Número de cancha inválido',
        available_courts: courtsArray.length,
        requested: courtNumber
      });
    }

    const selectedCourt = courtsArray[courtIndex];
    const resource_id = selectedCourt.resource_id;
    
    // CORREGIDO: usar buildStartTime sin 'Z'
    const start_time = buildStartTime(formattedDate, reservationTime);

    const bookingLink = generateBookingLink(
      tenantId,
      resource_id,
      start_time,
      duration
    );

    res.json({ 
      booking_link: bookingLink,
      debug: {
        original_date: date,
        formatted_date: formattedDate,
        reservation_time: reservationTime,
        start_time_generated: start_time,
        resource_id: resource_id,
        court_number: courtNumber
      }
    });

  } catch (err) {
    console.error('Error generando link de reserva:', err.message);
    res.status(500).json({ 
      error: 'Error interno', 
      details: err.message 
    });
  }
});

// endpoint para generar el link 
// app.post('/generate-reservation-link', async (req, res) => {
//   try {
//     const { courtNumber, date, reservationTime, duration } = req.body;

//     if (!courtNumber || !date || !reservationTime || !duration) {
//       return res.status(400).json({ error: 'Faltan parámetros requeridos' });
//     }

//     const token = await loginAndGetToken();

//     const tenantId = 'ab9c7555-3ba5-4b57-bbf8-6c7e7f344178';
//     const availabilityUrl = `https://playtomic.com/api/v1/availability?user_id=me&tenant_id=${tenantId}&sport_id=PADEL&start_min=${date}T00:00:00&start_max=${date}T23:59:59`;

//     const response = await axios.get(availabilityUrl, {
//       headers: {
//         Authorization: `Bearer ${token}`,
//         'x-requested-with': 'com.playtomic.web'
//       }
//     });

//     const allCourts = response.data;

//     const courtIndex = courtNumber - 1;
//     if (courtIndex < 0 || courtIndex >= allCourts.length) {
//       return res.status(400).json({ error: 'Número de cancha inválido' });
//     }

//     const selectedCourt = allCourts[courtIndex];
//     const resource_id = selectedCourt.resource_id;
//     const start_time = buildStartTime(date, reservationTime);

//     const bookingLink = generateBookingLink(
//       tenantId,
//       resource_id,
//       start_time,
//       duration
//     );

//     res.json({ booking_link: bookingLink });
//   } catch (err) {
//     console.error('Error generando link de reserva:', err.message);
//     res.status(500).json({ error: 'Error interno', details: err.message });
//   }
// });


// Endpoint de ayuda
app.get('/help', (req, res) => {
  const help = {
    endpoints: {
      '/availability': {
        description: 'Obtiene disponibilidad de canchas con filtros',
        parameters: {
          date: 'Fecha en formato YYYY-MM-DD o DD-MM-YYYY (opcional, default: hoy)',
          startTime: 'Hora de inicio en formato HH:MM (opcional)',
          endTime: 'Hora de fin en formato HH:MM (opcional)',
          format: 'Formato de respuesta: "json" o "chat" (opcional, default: json)'
        },
        examples: [
          '/availability?date=12-06-2025&startTime=15:00&endTime=19:00&format=chat',
          '/availability?date=2025-06-12&startTime=14:30',
          '/availability?format=chat'
        ]
      },
      '/generate-booking-link': {
        description: 'Genera enlace directo a checkout de reserva',
        parameters: {
          resource_id: 'ID de la cancha (obtenido de /availability)',
          slot_id: 'ID del horario (obtenido de /availability)',
          start_time: 'Fecha y hora de inicio en formato ISO (ej: 2025-06-19T10:00:00Z)',
          duration: 'Duración en minutos (ej: 60)'
        },
        examples: [
          '/generate-booking-link?resource_id=085e3c35-0efd-4887-9a0e-011e9985a762&slot_id=d248de72-5ae9-4722-8973-db618ddebd8b&start_time=2025-06-19T10:00:00Z&duration=60'
        ]
      },
      '/availability-summary': {
        description: 'Obtiene resumen de disponibilidad agrupado por horas',
        parameters: {
          date: 'Fecha en formato YYYY-MM-DD o DD-MM-YYYY (opcional, default: hoy)',
          format: 'Formato de respuesta: "json" o "chat" (opcional, default: json)'
        },
        examples: [
          '/availability-summary?date=12-06-2025&format=chat',
          '/availability-summary?format=chat'
        ]
      }
    }
  };
  
  res.json(help);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📋 Ayuda disponible en: http://localhost:${PORT}/help`);
});
