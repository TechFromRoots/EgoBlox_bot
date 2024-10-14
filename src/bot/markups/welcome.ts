export const welcomeMessageMarkup = async (userName: string) => {
  return {
    message: `Hi @${userName} 👋, Welcome to EgoBlox, managing your crypto has never been easier! Here’s what you can do. Here is what I can do:\n\n–💸 Easily send or receive tokens using just your basename or telegram username. No need for complicated wallet addresses—just type in the basename or username and you’re good to go!.\n-💡 Use your tokens to pay for your utility bills and services right from the app. Simplify your life by handling everything in one place!\n\n Shall we start? 👇`,
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
