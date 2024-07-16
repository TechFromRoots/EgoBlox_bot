export const menuMarkup_en = {
  markup: [
    [
      {
        text: '🔎 Search Flights',
        callback_data: JSON.stringify({
          command: '/newSearch',
          language: 'english',
        }),
      },
      {
        text: '🎫 Premium Deals',
        callback_data: JSON.stringify({
          command: '/premiumDeals',
          language: 'english',
        }),
      },
    ],
    // [
    //   { text: '🔔 Flight Alerts', callback_data: '/SetAlerts' },
    //   {
    //     text: '🔓 CheapFlight Premium',
    //     callback_data: JSON.stringify({
    //       command: '/premiumDeals',
    //       language: 'english',
    //     }),
    //   },
    // ],
    [
      {
        text: '⚙️ Settings',
        callback_data: JSON.stringify({
          command: '/settings',
          language: 'english',
        }),
      },
      {
        text: '📢 Share',
        language: 'english',
        switch_inline_query:
          'is a bot designed to search for cheap flights 🛩, track ticket prices, and book with Bonk and other SPL tokens.',
      },
    ],
  ],
};
