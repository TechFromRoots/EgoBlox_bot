export const pdFDetails = async (title: string, url: any, sourceId: any) => {
  return {
    title: ` 📝 Title: ${title} `,
    keyboard: [
      [
        {
          text: '📁 PDF Link',
          url: url,
        },
        {
          text: 'get Summary 📄',
          callback_data: JSON.stringify({
            command: '/summary',
            sourceId: sourceId,
          }),
        },
      ],
      [
        {
          text: '💬 Chat with pdf ',
          callback_data: JSON.stringify({
            command: '/chatPdf',
            sourceId: sourceId,
          }),
        },
      ],
    ],
  };
};
