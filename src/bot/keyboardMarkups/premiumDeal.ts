export const premiumDeal_en = {
  premiumDealMarkup: [
    [
      {
        text: '💳 Join Premium - $10/year',
        callback_data: JSON.stringify({
          command: '/premiumPay',
          language: 'english',
        }),
      },
    ],
    [
      {
        text: '☰ Menu',
        callback_data: JSON.stringify({
          command: '/menu',
          language: 'english',
        }),
      },
      {
        text: '❌ Close',
        callback_data: JSON.stringify({
          command: '/close',
          language: 'english',
        }),
      },
    ],
  ],
};
