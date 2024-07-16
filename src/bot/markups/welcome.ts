export const welcomeMessageMarkup = async (userName: string) => {
  return {
    message: `Hi @${userName} 👋, Welcome to EventBlinkBot, your go-to bot for creating event ticket links on solana using Blinks. Here is what I can do:\n\n– Help you generate Blinks for your events tickets 🎟️.\n– Send tickets users mails ✉️ .\n\n Shall we start? 👇`,
    keyboard: [
      [
        {
          text: 'Lets get started 🚀',
          callback_data: JSON.stringify({
            command: '/menu',
            language: 'english',
          }),
        },
      ],
    ],
  };
};
