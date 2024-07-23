import { Injectable, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import {
  welcomeMessageMarkup,
  allFeaturesMarkup,
  eventDetails_en,
  pdFDetails,
} from './markups';
import { DatabaseService } from 'src/database/database.service';
import { Prisma } from '@prisma/client';

const token = process.env.TELEGRAM_TOKEN;

@Injectable()
export class BotService {
  private readonly eventBot: TelegramBot;
  private logger = new Logger(BotService.name);
  private pdfUrlUploadPrompt = {};
  private pdfUploadPrompt = {};
  private startedChatting = {};
  private usedCodes = [];

  constructor(private readonly databaseService: DatabaseService) {
    this.eventBot = new TelegramBot(token, { polling: true });
    // event listerner for incomning messages
    this.eventBot.on('message', this.handleRecievedMessages);

    // event Listerner for button requests
    this.eventBot.on('callback_query', this.handleButtonCommands);
  }

  handleRecievedMessages = async (msg: any) => {
    this.logger.debug(msg);
    try {
      await this.eventBot.sendChatAction(msg.chat.id, 'typing');
      // condition to differntiate between users booking inputs
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: msg.chat.id },
      });
      console.log('session  ', session);
      if (msg.text !== '/start' && session) {
        this.handleUserTextInputs(msg, session);
      } else {
        const command = msg.text;
        console.log('Command :', command);
        if (command === '/start') {
          // delete existing user session
          if (session) {
            await this.databaseService.session.deleteMany({
              where: {
                chat_id: msg.chat.id,
              },
            });
          }

          const username = `${msg.from.username}`;
          const welcome = await welcomeMessageMarkup(username);
          // save users country
          await this.saveToDB({
            username,
            chat_id: msg.chat.id,
          });

          if (welcome) {
            const replyMarkup = {
              inline_keyboard: welcome.keyboard,
            };
            await this.eventBot.sendMessage(msg.chat.id, welcome.message, {
              reply_markup: replyMarkup,
            });
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  //Event handler for users inputs
  handleUserTextInputs = async (msg: any, session: any) => {
    function convertDateFormat(dateString) {
      const [day, month, year] = dateString.split('/');
      return `${year}-${month}-${day}`;
    }
    try {
      // from here handles event details
      if (JSON.parse(session.userAnswerId)['messageId'].length !== 0) {
        const answerIds = JSON.parse(session.userAnswerId)['messageId'];
        console.log('answerIds ', answerIds);
        console.log('IDS  ', session);
        await this.updateUserSession(msg.chat.id, {
          userAnswerId: JSON.stringify({
            messageId: [...answerIds, msg.message_id],
          }),
        });
      } else {
        await this.updateUserSession(msg.chat.id, {
          userAnswerId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.userAnswerId)['messageId'],
              msg.message_id,
            ],
          }),
        });
      }
      // Regular expression pattern to match the format DD/MM/YYYY
      const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
      // Check if the date string matches the pattern
      if (!msg.photo) {
        if (datePattern.test(msg.text.trim())) {
          const latestSession = await this.databaseService.session.findFirst({
            where: { chat_id: msg.chat.id },
          });
          if (
            JSON.parse(latestSession.startDatePromptId)['messageId'].length !==
              0 &&
            !latestSession.startDate
          ) {
            const update = await this.updateUserSession(msg.chat.id, {
              startDate: msg.text.trim(),
              startDatePromptId: JSON.stringify({ messageId: [] }),
              userAnswerId: JSON.stringify({ messageId: [] }),
            });
            if (update) {
              const markup = eventDetails_en(
                latestSession.eventName,
                latestSession.description,
                latestSession.location,
                msg.text.trim(),
                latestSession.startTime,
                latestSession.endDate,
                latestSession.endTime,
                latestSession.contacts,
                latestSession.email,
                latestSession.price,
                latestSession.category,
                latestSession.numberOfTickets,
                latestSession.media,
                latestSession.walletAddress,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.keyBoardMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            }
            // loop through startDate prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.startDatePromptId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.startDatePromptId)['messageId'][i],
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.userAnswerId)['messageId'][i],
              );
            }
          } else if (
            // this will handle event enddate
            JSON.parse(session.endDatePromptId)['messageId'].length !== 0 &&
            !session.returnDate
          ) {
            const update = await this.updateUserSession(msg.chat.id, {
              endDate: msg.text.trim(),
              endDatePromptId: JSON.stringify({ messageId: [] }),
              userAnswerId: JSON.stringify({ messageId: [] }),
            });

            if (update) {
              const markup = eventDetails_en(
                latestSession.eventName,
                latestSession.description,
                latestSession.location,
                latestSession.startDate,
                latestSession.startTime,
                msg.text.trim(),
                latestSession.endTime,
                latestSession.contacts,
                latestSession.email,
                latestSession.price,
                latestSession.category,
                latestSession.numberOfTickets,
                latestSession.media,
                latestSession.walletAddress,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.keyBoardMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            }

            // loop through startDate prompt to delete them
            for (
              let i = 0;
              i < JSON.parse(latestSession.endDatePromptId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.endDatePromptId)['messageId'][i],
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.userAnswerId)['messageId'][i],
              );
            }
          }
        } else {
          console.log('Not a date');
        }
      }

      // this detects the time format
      function detectTimeFormat(str) {
        const regex =
          /\b(?:0?[1-9]|1[0-2]):[0-5][0-9]\s?[ap]m\s?[a-zA-Z]{3}\b/i;
        const match = str.match(regex);
        if (match) {
          return {
            time: match[0],
            originalString: str,
          };
        }
        return null;
      }

      if (!msg.photo) {
        const time = detectTimeFormat(msg.text.trim());

        if (time !== null && time.time !== '') {
          const latestSession = await this.databaseService.session.findFirst({
            where: { chat_id: msg.chat.id },
          });
          if (
            !latestSession.startTime &&
            JSON.parse(latestSession.startTimePromptId)['messageId'].length !==
              0
          ) {
            console.log('time :', time.time);
            const update = await this.updateUserSession(msg.chat.id, {
              startTime: time.time,
              startTimePromptId: JSON.stringify({ messageId: [] }),
              userAnswerId: JSON.stringify({ messageId: [] }),
            });
            if (update) {
              const promises = [];
              // loop through departure prompt to delete them
              for (
                let i = 0;
                i <
                JSON.parse(latestSession.startTimePromptId)['messageId'].length;
                i++
              ) {
                promises.push(
                  await this.eventBot.deleteMessage(
                    msg.chat.id,
                    JSON.parse(latestSession.startTimePromptId)['messageId'][i],
                  ),
                );
              }
              // loop through to delet all userReply
              for (
                let i = 0;
                i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
                i++
              ) {
                promises.push(
                  await this.eventBot.deleteMessage(
                    msg.chat.id,
                    JSON.parse(latestSession.userAnswerId)['messageId'][i],
                  ),
                );
              }

              const markup = eventDetails_en(
                latestSession.eventName,
                latestSession.description,
                latestSession.location,
                latestSession.startDate,
                msg.text.trim(),
                latestSession.endDate,
                latestSession.endTime,
                latestSession.contacts,
                latestSession.email,
                latestSession.price,
                latestSession.category,
                latestSession.numberOfTickets,
                latestSession.media,
                latestSession.walletAddress,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.keyBoardMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            }
          } else if (
            !latestSession.endTime &&
            JSON.parse(latestSession.endTimePromptId)['messageId'].length !== 0
          ) {
            const update = await this.updateUserSession(msg.chat.id, {
              endTime: time.time,
              endTimePromptId: JSON.stringify({ messageId: [] }),
              userAnswerId: JSON.stringify({ messageId: [] }),
            });
            if (update) {
              const markup = eventDetails_en(
                latestSession.eventName,
                latestSession.description,
                latestSession.location,
                latestSession.startDate,
                latestSession.startTime,
                latestSession.endDate,
                msg.text.trim(),
                latestSession.contacts,
                latestSession.email,
                latestSession.price,
                latestSession.category,
                latestSession.numberOfTickets,
                latestSession.media,
                latestSession.walletAddress,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.keyBoardMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            }
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i < JSON.parse(latestSession.endTimePromptId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.endTimePromptId)['messageId'][i],
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              await this.eventBot.deleteMessage(
                msg.chat.id,
                JSON.parse(latestSession.userAnswerId)['messageId'][i],
              );
            }
          } else {
            console.log('nothing');
          }
        } else {
          console.log('not time');
        }
      }

      // parse incoming message and handle commands
      try {
        const latestSession = await this.databaseService.session.findFirst({
          where: { chat_id: msg.chat.id },
        });
        if (
          !latestSession.eventName &&
          JSON.parse(latestSession.eventNamePromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            eventName: msg.text.trim(),
            eventNamePromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              msg.text.trim(),
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.eventNamePromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.eventNamePromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.description &&
          JSON.parse(latestSession.descriptionPromptId)['messageId'].length !==
            0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            description: msg.text.trim(),
            descriptionPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              msg.text.trim(),
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.descriptionPromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.descriptionPromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.location &&
          JSON.parse(latestSession.locationPromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            location: msg.text.trim(),
            locationPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              msg.text.trim(),
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.locationPromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.locationPromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.contacts &&
          JSON.parse(latestSession.contactPromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            contacts: msg.text.trim(),
            contactPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              msg.text.trim(),
              latestSession.email,
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i < JSON.parse(latestSession.contactPromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.contactPromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.email &&
          JSON.parse(latestSession.emailPromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            email: msg.text.trim(),
            emailPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              msg.text.trim(),
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i < JSON.parse(latestSession.emailPromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.emailPromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.price &&
          JSON.parse(latestSession.pricePromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            price: msg.text.trim(),
            pricePromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              msg.text.trim(),
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i < JSON.parse(latestSession.pricePromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.pricePromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.category &&
          JSON.parse(latestSession.categoryPromptId)['messageId'].length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            category: msg.text.trim(),
            categoryPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              msg.text.trim(),
              latestSession.numberOfTickets,
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.categoryPromptId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.categoryPromptId)['messageId'][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          !latestSession.numberOfTickets &&
          JSON.parse(latestSession.numberOfTicketsPromptId)['messageId']
            .length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            numberOfTickets: msg.text.trim(),
            numberOfTicketsPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              latestSession.category,
              msg.text.trim(),
              latestSession.media,
              latestSession.walletAddress,
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.numberOfTicketsPromptId)['messageId']
                .length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.numberOfTicketsPromptId)[
                    'messageId'
                  ][i],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else if (
          msg.photo &&
          !latestSession.media &&
          JSON.parse(latestSession.mediaPromptId)['messageId'].length !== 0
        ) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          const file = await this.eventBot.getFile(fileId);
          if (file) {
            const filePath = file.file_path;
            const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
            console.log(fileUrl);
            const response = await fetch(
              `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
            );
            console.log(response.url);
            // Fetch the image from Telegram
            const imageResponse = await fetch(fileUrl);
            const arrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log('image response :', buffer);

            this.eventBot.sendMessage(
              msg.chat.id,
              `Image received! You can download it from: ${fileId}`,
            );
            const update = await this.updateUserSession(msg.chat.id, {
              media: fileUrl,
              mediaPromptId: JSON.stringify({ messageId: [] }),
              userAnswerId: JSON.stringify({ messageId: [] }),
            });
            if (update) {
              const markup = eventDetails_en(
                latestSession.eventName,
                latestSession.description,
                latestSession.location,
                latestSession.startDate,
                latestSession.startTime,
                latestSession.endDate,
                latestSession.endTime,
                latestSession.contacts,
                latestSession.email,
                latestSession.price,
                latestSession.category,
                latestSession.numberOfTickets,
                fileId,
                latestSession.walletAddress,
              );
              await this.eventBot.sendPhoto(msg.chat.id, fileId);
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.keyBoardMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );

              const promises = [];
              // loop through departure prompt to delete them
              for (
                let i = 0;
                i < JSON.parse(latestSession.mediaPromptId)['messageId'].length;
                i++
              ) {
                promises.push(
                  await this.eventBot.deleteMessage(
                    msg.chat.id,
                    JSON.parse(latestSession.mediaPromptId)['messageId'][i],
                  ),
                );
              }
              // loop through to delet all userReply
              for (
                let i = 0;
                i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
                i++
              ) {
                promises.push(
                  await this.eventBot.deleteMessage(
                    msg.chat.id,
                    JSON.parse(latestSession.userAnswerId)['messageId'][i],
                  ),
                );
              }
            }
          }
        } else if (
          !latestSession.walletAddress &&
          JSON.parse(latestSession.walletAddressPromptId)['messageId']
            .length !== 0
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            walletAddress: msg.text.trim(),
            walletAddressPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const markup = eventDetails_en(
              latestSession.eventName,
              latestSession.description,
              latestSession.location,
              latestSession.startDate,
              latestSession.startTime,
              latestSession.endDate,
              latestSession.endTime,
              latestSession.contacts,
              latestSession.email,
              latestSession.price,
              latestSession.category,
              latestSession.numberOfTickets,
              latestSession.media,
              msg.text.trim(),
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.keyBoardMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );

            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.walletAddressPromptId)['messageId']
                .length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.walletAddressPromptId)['messageId'][
                    i
                  ],
                ),
              );
            }
            // loop through to delet all userReply
            for (
              let i = 0;
              i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.userAnswerId)['messageId'][i],
                ),
              );
            }
          }
        } else {
          return await this.eventBot.sendMessage(
            msg.chat.id,
            `Processing command failed, please try again`,
          );
        }
      } catch (error) {
        console.error(error);

        return await this.eventBot.sendMessage(
          msg.chat.id,
          `Processing command failed, please try again`,
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  handleButtonCommands = async (query: any) => {
    this.logger.debug(query);
    let command: string;
    let sourceId: string;
    const first_name = query.from.first_name;
    // const last_name = query.from.last_name;
    // const user_Id = query.from.id;
    const username = `${first_name}`;

    // function to check if query.data is a json type
    function isJSON(str) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        return false;
      }
    }

    if (isJSON(query.data)) {
      command = JSON.parse(query.data).command;
      sourceId = JSON.parse(query.data).sourceId;
    } else {
      command = query.data;
    }

    const chatId = query.message.chat.id;
    // const userId = query.from.id;

    try {
      switch (command) {
        case '/menu':
          await this.eventBot.sendChatAction(chatId, 'typing');
          await this.sendAllFeature(chatId);
          return;

        case '/createEvent':
          await this.eventBot.sendChatAction(query.message.chat.id, 'typing');
          const sessionExist1 = await this.databaseService.session.findMany({
            where: {
              chat_id: chatId,
            },
          });
          if (sessionExist1) {
            // delete session first
            await this.databaseService.session.deleteMany({
              where: {
                chat_id: query.message.chat.id,
              },
            });
            // then create new one
            await this.createSession(query.message.chat.id, {
              sessionOn: true,
              user: {
                connect: { chat_id: query.message.chat.id },
              },
              eventNamePromptId: JSON.stringify({
                messageId: [],
              }),
              descriptionPromptId: JSON.stringify({
                messageId: [],
              }),
              userAnswerId: JSON.stringify({ messageId: [] }),
              locationPromptId: JSON.stringify({
                messageId: [],
              }),
              startDatePromptId: JSON.stringify({
                messageId: [],
              }),
              startTimePromptId: JSON.stringify({
                messageId: [],
              }),
              endDatePromptId: JSON.stringify({
                messageId: [],
              }),
              endTimePromptId: JSON.stringify({
                messageId: [],
              }),
              contactPromptId: JSON.stringify({
                messageId: [],
              }),
              emailPromptId: JSON.stringify({
                messageId: [],
              }),
              pricePromptId: JSON.stringify({
                messageId: [],
              }),
              categoryPromptId: JSON.stringify({
                messageId: [],
              }),
              numberOfTicketsPromptId: JSON.stringify({
                messageId: [],
              }),
              mediaPromptId: JSON.stringify({
                messageId: [],
              }),
              walletAddressPromptId: JSON.stringify({
                messageId: [],
              }),
            });
          } else {
            await this.createSession(query.message.chat.id, {
              sessionOn: true,
              user: {
                connect: { chat_id: query.message.chat.id },
              },
              eventNamePromptId: JSON.stringify({
                messageId: [],
              }),
              descriptionPromptId: JSON.stringify({
                messageId: [],
              }),
              userAnswerId: JSON.stringify({ messageId: [] }),
              locationPromptId: JSON.stringify({
                messageId: [],
              }),
              startDatePromptId: JSON.stringify({
                messageId: [],
              }),
              startTimePromptId: JSON.stringify({
                messageId: [],
              }),
              endDatePromptId: JSON.stringify({
                messageId: [],
              }),
              endTimePromptId: JSON.stringify({
                messageId: [],
              }),
              contactPromptId: JSON.stringify({
                messageId: [],
              }),
              emailPromptId: JSON.stringify({
                messageId: [],
              }),
              pricePromptId: JSON.stringify({
                messageId: [],
              }),
              categoryPromptId: JSON.stringify({
                messageId: [],
              }),
              numberOfTicketsPromptId: JSON.stringify({
                messageId: [],
              }),
              mediaPromptId: JSON.stringify({
                messageId: [],
              }),
              walletAddressPromptId: JSON.stringify({
                messageId: [],
              }),
            });
          }
          return await this.createEvent(query.message.chat.id);

        case '/eventName':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventNameSelection(query.message.chat.id);

        case '/eventDescription':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventDescriptionSelection(query.message.chat.id);

        case '/eventLocation':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventLocationSelection(query.message.chat.id);

        case '/eventStartDate':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventStartDateSelection(query.message.chat.id);

        case '/eventTime':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventStartTimeSelection(query.message.chat.id);

        case '/eventEndDate':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventEndDateSelection(query.message.chat.id);

        case '/eventEndTime':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.eventEndTimeSelection(query.message.chat.id);

        case '/contact':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.contactSelection(query.message.chat.id);

        case '/email':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.emailSelection(query.message.chat.id);

        case '/ticketPrice':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.priceSelection(query.message.chat.id);

        case '/ticketCategory':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.categorySelection(query.message.chat.id);

        case '/ticketNumber':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.ticketNumberSelection(query.message.chat.id);

        case '/eventMedia':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.mediaSelection(query.message.chat.id);

        case '/organizerWallet':
          await this.eventBot.sendChatAction(chatId, 'typing');
          return await this.walletSelection(query.message.chat.id);

        // close opened markup and delete result
        case '/closedelete':
          await this.eventBot.sendChatAction(query.message.chat.id, 'typing');
          await this.databaseService.session.deleteMany({
            where: { chat_id: chatId },
          });
          //Number(bookingDetailsDbId)
          return await this.eventBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        // case '/viewFiles':
        //   try {
        //     await this.eventBot.sendMessage(chatId, '⏳ Request Processing .....');
        //     const allFiles = await this.databaseService.pdf.findMany({
        //       where: { owner: chatId },
        //     });
        //     if (allFiles) {
        //       const allFilesArray = [...allFiles];
        //       if (allFilesArray.length == 0) {
        //         return this.eventBot.sendMessage(
        //           chatId,
        //           '❓ Your PDF list is empty',
        //         );
        //       } else {
        //         allFilesArray.map(async (file) => {
        //           try {
        //             const pdfDetail = await pdFDetails(
        //               file.name,
        //               file.url,
        //               file.sourceId,
        //             );
        //             if (pdfDetail) {
        //               const Markup = {
        //                 inline_keyboard: pdfDetail.keyboard,
        //               };

        //               await this.eventBot.sendMessage(chatId, file.name, {
        //                 reply_markup: Markup,
        //               });
        //             } else {
        //               return;
        //             }
        //           } catch (error) {
        //             console.log(error);
        //           }
        //         });
        //       }
        //     }
        //   } catch (error) {
        //     console.log(error);
        //   }

        default:
          return await this.eventBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendAllFeature = async (chatId: any) => {
    try {
      const allFeatures = await allFeaturesMarkup();
      if (allFeatures) {
        const replyMarkup = {
          inline_keyboard: allFeatures.keyboard,
        };
        await this.eventBot.sendMessage(chatId, allFeatures.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  // create event markup
  createEvent = async (chatId) => {
    try {
      const markup = eventDetails_en('', '', '', '');
      const eventDetailMarkup = { inline_keyboard: markup.keyBoardMarkup };
      const eventDetails = await this.eventBot.sendMessage(
        chatId,
        markup.message,
        { reply_markup: eventDetailMarkup },
      );
      await this.updateUserSession(chatId, {
        bookingMarkdownId: eventDetails.message_id,
      });
      return eventDetails;
    } catch (error) {
      console.log(error);
    }
  };

  fileUploadByUrlPrompt = async (chatId: any) => {
    try {
      const uploadUrlPrompt = await this.eventBot.sendMessage(
        chatId,
        'Input the PDF url 🔗: make sure it is viewable',
        { reply_markup: { force_reply: true } },
      );
      if (uploadUrlPrompt) {
        this.pdfUrlUploadPrompt[chatId] = [uploadUrlPrompt.message_id];
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  fileUploadPrompt = async (chatId: any) => {
    try {
      const uploadPrompt = await this.eventBot.sendMessage(
        chatId,
        'Upload a PDF file 🔗: make sure it is less than 5mb',
        { reply_markup: { force_reply: true } },
      );
      if (uploadPrompt) {
        this.pdfUploadPrompt[chatId] = [uploadPrompt.message_id];
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  async createSession(
    chat_id: number,
    BookingSessionDto: Prisma.SessionCreateInput,
  ) {
    try {
      const exist = await this.databaseService.session.findFirst({
        where: { chat_id },
      });
      if (!exist) {
        return this.databaseService.session.create({
          data: BookingSessionDto,
        });
      } else {
        return this.updateUserSession(chat_id, BookingSessionDto);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async updateUserSession(
    chat_id: number,
    updateUserSessionDto: Prisma.SessionUpdateInput,
  ) {
    try {
      return await this.databaseService.session.updateMany({
        where: { chat_id },
        data: updateUserSessionDto,
      });
    } catch (error) {
      console.log(error);
    }
  }

  async saveToDB(saveUserDto: Prisma.UserCreateInput) {
    try {
      const isSaved = await this.databaseService.user.findFirst({
        where: { chat_id: saveUserDto.chat_id },
      });
      if (!isSaved) {
        return this.databaseService.user.create({ data: saveUserDto });
      }
      return;
    } catch (error) {
      console.error(error);
    }
  }

  eventNameSelection = async (chatId) => {
    try {
      const eventNamePrompt = await this.eventBot.sendMessage(
        chatId,
        '📝 Enter name of your event.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.eventNamePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          eventName: null,
          eventNamePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.eventNamePromptId)['messageId'],
              eventNamePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventDescriptionSelection = async (chatId) => {
    try {
      const eventDescriptionPrompt = await this.eventBot.sendMessage(
        chatId,
        '📝 Enter event description.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.descriptionPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          description: null,
          descriptionPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.descriptionPromptId)['messageId'],
              eventDescriptionPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventLocationSelection = async (chatId) => {
    try {
      const eventLocationPrompt = await this.eventBot.sendMessage(
        chatId,
        '📍 Enter event location.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.locationPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          location: null,
          locationPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.locationPromptId)['messageId'],
              eventLocationPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventStartDateSelection = async (chatId) => {
    try {
      const eventStartDatePrompt = await this.eventBot.sendMessage(
        chatId,
        '📅 Enter event start date(dd/mm/yyyy). e.g 20/04/2024',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.startDatePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          startDate: null,
          startDatePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.startDatePromptId)['messageId'],
              eventStartDatePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventStartTimeSelection = async (chatId) => {
    try {
      const eventStartTimePrompt = await this.eventBot.sendMessage(
        chatId,
        '🕛 Enter event start time. e.g: 12:00pm UTC',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.startTimePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          startTime: null,
          startTimePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.startTimePromptId)['messageId'],
              eventStartTimePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventEndDateSelection = async (chatId) => {
    try {
      const eventEndDatePrompt = await this.eventBot.sendMessage(
        chatId,
        '📅 Enter event end date(dd/mm/yyyy). e.g 20/04/2024',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.endDatePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          endDate: null,
          endDatePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.endDatePromptId)['messageId'],
              eventEndDatePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  eventEndTimeSelection = async (chatId) => {
    try {
      const eventEndTimePrompt = await this.eventBot.sendMessage(
        chatId,
        '🕛 Enter event end time. e.g: 01:00pm UTC',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.endTimePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          endTime: null,
          endTimePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.endTimePromptId)['messageId'],
              eventEndTimePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  contactSelection = async (chatId) => {
    try {
      const contactPrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter contacts or socials, saperate multiple inputs with a comma.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.contactPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          contacts: null,
          contactPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.contactPromptId)['messageId'],
              contactPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  emailSelection = async (chatId) => {
    try {
      const emailPrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter email.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.emailPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          email: null,
          emailPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.emailPromptId)['messageId'],
              emailPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  priceSelection = async (chatId) => {
    try {
      const pricePrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter Ticket price in sol.',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.pricePromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          price: null,
          pricePromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.pricePromptId)['messageId'],
              pricePrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  categorySelection = async (chatId) => {
    try {
      const categoryPrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter Ticket category. e.g (VIP, EarlyBirds etc)',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.categoryPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          category: null,
          categoryPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.categoryPromptId)['messageId'],
              categoryPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  ticketNumberSelection = async (chatId) => {
    try {
      const numberOfTicketsPrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter the number of Ticket you want to sell',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.numberOfTicketsPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          numberOfTickets: null,
          numberOfTicketsPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.numberOfTicketsPromptId)['messageId'],
              numberOfTicketsPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  mediaSelection = async (chatId) => {
    try {
      const mediaPrompt = await this.eventBot.sendMessage(
        chatId,
        'upload a media for the ticket',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.mediaPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          media: null,
          mediaPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.mediaPromptId)['messageId'],
              mediaPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  walletSelection = async (chatId) => {
    try {
      const walletPrompt = await this.eventBot.sendMessage(
        chatId,
        'Enter your wallet Address',
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      const session = await this.databaseService.session.findFirst({
        where: { chat_id: chatId },
      });
      if (session) {
        const promptIds = JSON.parse(session.walletAddressPromptId);
        console.log('prompts :', promptIds['messageId']);
        await this.updateUserSession(chatId, {
          walletAddress: null,
          walletAddressPromptId: JSON.stringify({
            messageId: [
              ...JSON.parse(session.walletAddressPromptId)['messageId'],
              walletPrompt.message_id,
            ],
          }),
        });
        return;
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };

  getMedia = async (fileId) => {
    try {
      // Get the file path from Telegram
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
      );
      const data = await response.json();

      if (data.ok) {
        const filePath = data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        // Fetch the image from Telegram
        const imageResponse = await fetch(fileUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return { imageResponse, buffer };
      }
      return;
    } catch (error) {
      console.log(error);
    }
  };
}
