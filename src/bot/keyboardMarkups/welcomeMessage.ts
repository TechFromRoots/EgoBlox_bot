export const welcomeMessageMarkup = (username) => {
  const userName = username || '';

  return {
    message: `🛫 Welcome to Wings! 🛬\n\nHello ${userName}! 🌟\nWe're thrilled to have you onboard. Wings is your ultimate travel companion, designed to help you find and book the best flights with ease.\n\nHere’s what you can do with Wings:\n ✈️ Search for Flights - Get the best flight options tailored to your preferences.\n 💸 Book with Crypto - Complete your bookings using Bonk or any SPL token seamlessly.\n\nReady to take off? click the button 👇`,
    markup: [
      [
        {
          text: 'Get Started',
          callback_data: JSON.stringify({
            command: '/welcome',
            language: 'english',
          }),
        },
      ],
    ],
  };
};
