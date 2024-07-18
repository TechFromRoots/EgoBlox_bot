export const allFeaturesMarkup = async () => {
  return {
    message: `Please Select any action below 👇`,
    keyboard: [
      [
        {
          text: 'Create an event Ticket 🎟️',
          callback_data: JSON.stringify({
            command: '/createEvent',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Manage Events',
          callback_data: JSON.stringify({
            command: '/manageEvents',
            language: 'english',
          }),
        },
        {
          text: '📢 Share',
          language: 'english',
          switch_inline_query:
            'EventBlinkBot, your go-to bot for creating event ticket links on solana using Blinks.',
        },
      ],
    ],
  };
};
