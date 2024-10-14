export const allFeaturesMarkup = async () => {
  return {
    message: `Please Select any action below 👇`,
    keyboard: [
      [
        {
          text: 'Create wallet 💳',
          callback_data: JSON.stringify({
            command: '/createWallet',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Import wallet 🔗',
          callback_data: JSON.stringify({
            command: '/linkWallet',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Pay bills 💡',
          callback_data: JSON.stringify({
            command: '/bills',
            language: 'english',
          }),
        },
        {
          text: 'Send token 💸',
          callback_data: JSON.stringify({
            command: '/sendToken',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Send token 💸',
          callback_data: JSON.stringify({
            command: '/bills',
            language: 'english',
          }),
        },
        {
          text: 'Fund wallet 💵',
          callback_data: JSON.stringify({
            command: '/fundWallet',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: '📢 Share',
          language: 'english',
          switch_inline_query:
            'EgoBlox, managing your crypto has never been easier!.',
        },
      ],
    ],
  };
};
