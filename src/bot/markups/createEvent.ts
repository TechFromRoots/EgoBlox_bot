export const eventDetails_en = (
  dbId?,
  event_Name?,
  event_Description?,
  location?,
  start_date?,
  time?,
  end_date?,
  end_time?,
  contacts?,
  email?,
  price?,
  category?,
  number_of_Tickets?,
  image?,
  walletAddress?,
) => {
  const eventName = event_Name || '';
  const eventDescription = event_Description || '';
  const eventLocaton = location || '';
  const startDate = start_date || '';
  const eventTime = time || '';
  const endDate = end_date || '';
  const eventEndTime = end_time || '';
  const organizerContacts = contacts || '';
  const organizerEmail = email || '';
  const ticketPrice = price || '';
  const ticketCategory = category || '';
  const numberOfTickets = number_of_Tickets || '';
  const eventImage = image || '';
  const organizerWallet = walletAddress || '';

  return {
    message: `Please tap buttons below to fill in your Event details  📝`,
    keyBoardMarkup: [
      [
        {
          text: `Event Name? : ${eventName}`,
          callback_data: JSON.stringify({
            command: '/eventName',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Description? :\n ${eventDescription}`,
          callback_data: JSON.stringify({
            command: '/eventDescription',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Location📍? : ${eventLocaton}`,
          callback_data: JSON.stringify({
            command: '/eventLocation',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `start date📅? : ${startDate}`,
          callback_data: JSON.stringify({
            command: '/eventStartDate',
            language: 'english',
          }),
        },
        {
          text: `Time🕛? : ${eventTime}`,
          callback_data: JSON.stringify({
            command: '/eventTime',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `End Date 📅? : ${endDate}`,
          callback_data: JSON.stringify({
            command: '/eventEndDate',
            language: 'english',
          }),
        },
        {
          text: `Time🕛? : ${eventEndTime}`,
          callback_data: JSON.stringify({
            command: '/eventEndTime',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Contacts/socials? : ${organizerContacts}`,
          callback_data: JSON.stringify({
            command: '/contact',
            language: 'english',
          }),
        },
        {
          text: `Email? : ${organizerEmail}`,
          callback_data: JSON.stringify({
            command: '/bookingEmail',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Ticket Price? :\n${ticketPrice}`,
          callback_data: JSON.stringify({
            command: '/ticketPrice',
            language: 'english',
          }),
        },
        {
          text: `Category? :\n${ticketCategory}`,
          callback_data: JSON.stringify({
            command: '/ticketCategory',
            language: 'english',
          }),
        },
        {
          text: `No of Tickets? :\n${numberOfTickets}`,
          callback_data: JSON.stringify({
            command: '/ticketCategory',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `event media? : ${eventImage}`,
          callback_data: JSON.stringify({
            command: '/eventMedia',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Wallet Address? : ${organizerWallet}`,
          callback_data: JSON.stringify({
            command: '/organizerWallet',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Generate Ticket 🎟️\nBLInk`,
          callback_data: JSON.stringify({
            command: '/GenerateBlinkLink',
            bookingDetailsDbId: Number(dbId),
          }),
        },
        {
          text: '❌ Close',
          callback_data: JSON.stringify({
            command: '/closedelete',
            bookingDetailsDbId: Number(dbId),
          }),
        },
      ],
    ],
  };
};
