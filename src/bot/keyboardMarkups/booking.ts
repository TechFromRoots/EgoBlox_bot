export const booking_en = (from?, to?, date1?, date2?, multicityData?) => {
  const departureCity = from || '';
  const destinationCity = to || '';
  const dateFrom = date1 || '';
  const dateReturn = date2 || '';
  const multicityDatas = multicityData || [];
  return {
    message: {
      oneWayMarkup: ` ➡️🛫. Search for available flights.\n\n1. Select Departure city\n\n2. Select Destination City\n\n3. Pick date of departure `,
      returnMarkup: ` ⬅️➡️🛫. Search for available flights.\n\n1. Select Departure city\n\n2. Select Destination City\n\n3. Pick date of departure \n\n4. Pick date of return `,
      multiCityMarkup: ` ✈ ✈. Search for available Multi-city flights.\n1. Click on the add Button to add flights\n\n${multicityDatas.map(
        (data) => {
          return `📍 ${data.fromEntityId} - ${data.toEntityId}: ${data.departDate} \n`;
        },
      )}`,
    },
    oneWayMarkup: [
      [
        {
          text: '❌ Close',
          callback_data: JSON.stringify({
            command: '/close',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `🏠 departure city? : ${departureCity}`,
          callback_data: JSON.stringify({
            command: '/departureCity',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `🛫 destination city ?: ${destinationCity}`,
          callback_data: JSON.stringify({
            command: '/destinationCity',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `📅 date of departure: ${dateFrom}`,
          callback_data: JSON.stringify({
            command: '/dateOfDeparture',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Search 🔎',
          callback_data: JSON.stringify({
            command: '/searchOneWayFlight',
            language: 'english',
          }),
        },
      ],
    ],
    returnMarkup: [
      [
        {
          text: '❌ Close',
          callback_data: JSON.stringify({
            command: '/close',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `🏠 departure city? : ${departureCity}`,
          callback_data: JSON.stringify({
            command: '/departureCity',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `🛫 destination city ?: ${destinationCity}`,
          callback_data: JSON.stringify({
            command: '/destinationCity',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `📅 date of departure: ${dateFrom}`,
          callback_data: JSON.stringify({
            command: '/dateOfDeparture',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `📅 date of return: ${dateReturn}`,
          callback_data: JSON.stringify({
            command: '/dateOfReturn',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Search 🔎',
          callback_data: JSON.stringify({
            command: '/searchReturnFlight',
            language: 'english',
          }),
        },
      ],
    ],
    multiCityMarkup: [
      [
        {
          text: '❌ Close',
          callback_data: JSON.stringify({
            command: '/close',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `➕ Add flight`,
          callback_data: JSON.stringify({
            command: '/addflights',
            language: 'english',
          }),
        },
        {
          text: 'Search 🔎',
          callback_data: JSON.stringify({
            command: '/searchMultiCityFlight',
            language: 'english',
          }),
        },
      ],
    ],
  };
};
