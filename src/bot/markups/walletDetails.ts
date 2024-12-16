import * as dotenv from 'dotenv';
dotenv.config();

export const wallerDetailsMarkup = async (address: any, type?: string) => {
  const BASE_SCAN_URL =
    process.env.ENVIRONMENT === 'TESTNET'
      ? process.env.BASE_SCAN_URL_TESTNET
      : process.env.BASE_SCAN_URL;
  return {
    message: `<b>${type === 'SMART' ? 'Your SMART Wallet:' : 'Your Wallet:'}</b>\n\n<b>Address:</b> <code>${address}</code>\n\n Tap to copy the address and send Eth, USDC or any token on base to deposit.`,
    keyboard: [
      [
        {
          text: '🔎 View on basescan',
          url: `${BASE_SCAN_URL}/address/${address}`,
        },
        {
          text: 'check Balance',
          callback_data: JSON.stringify({
            command: '/checkBalance',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Export wallet',
          callback_data: JSON.stringify({
            command: '/exportWallet',
            language: 'english',
          }),
        },
        {
          text: 'Reset wallet',
          callback_data: JSON.stringify({
            command: '/resetWallet',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Reset Pin',
          callback_data: JSON.stringify({
            command: '/resetPin',
            language: 'english',
          }),
        },
      ],
      [
        {
          text: 'Close ❌',
          callback_data: JSON.stringify({
            command: '/close',
            language: 'english',
          }),
        },
      ],
    ],
  };
};
