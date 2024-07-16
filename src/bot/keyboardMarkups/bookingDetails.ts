export const bookingDetails_en = (dbId?, first_Name?, last_Name?, email?) => {
  const firstName = first_Name || '';
  const lastName = last_Name || '';
  const bookingEmail = email || '';

  return {
    message: `Please tap buttons below to fill in your booking details  📝`,
    keyBoardMarkup: [
      [
        {
          text: `First Name? : ${firstName}`,
          callback_data: JSON.stringify({
            command: '/firstName',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Last Name? : ${lastName}`,
          callback_data: JSON.stringify({
            command: '/lastName',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Email  : ${bookingEmail}`,
          callback_data: JSON.stringify({
            command: '/bookingEmail',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: `Pay with Bonk`,
          callback_data: JSON.stringify({
            command: '/GenerateBonkPayment',
            bookingDetailsDbId: Number(dbId),
          }),
        },
      ],
      [
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
