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

@Injectable()
export class BotService {
  private readonly eventBot: TelegramBot;
  private logger = new Logger(BotService.name);
  private pdfUrlUploadPrompt = {};
  private pdfUploadPrompt = {};
  private startedChatting = {};
  private usedCodes = [];

  constructor(private readonly databaseService: DatabaseService) {
    this.eventBot = new TelegramBot(
      '7042026574:AAF415xg_dgxz6axoZXLHsbw87cB3CuhLic',
      { polling: true },
    );
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
              latestSession.departureCity,
              latestSession.destinationCity,
              msg.text.trim(),
            );
            await this.eventBot.editMessageReplyMarkup(
              { inline_keyboard: markup.oneWayMarkup },
              {
                chat_id: msg.chat.id,
                message_id: Number(latestSession.bookingMarkdownId),
              },
            );
          }
          // loop through departuredate prompt to delete them
          for (
            let i = 0;
            i <
            JSON.parse(latestSession.departureDatePromptId)['messageId'].length;
            i++
          ) {
            await this.eventBot.deleteMessage(
              msg.chat.id,
              JSON.parse(latestSession.departureDatePromptId)['messageId'][i],
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
          // this will handle return flight
          JSON.parse(session.returnDatePromptId)['messageId'].length !== 0 &&
          !session.returnDate
        ) {
          const update = await this.updateUserSession(msg.chat.id, {
            returnDate: msg.text.trim(),
            returnDatePromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });

          if (update) {
            if (latestSession.one_way_search_state) {
              const markup = booking_en(
                latestSession.departureCity,
                latestSession.destinationCity,
                msg.text.trim(),
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.oneWayMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            } else if (latestSession.return_search_state) {
              const markup = booking_en(
                latestSession.departureCity,
                latestSession.destinationCity,
                latestSession.departureDate,
                msg.text.trim(),
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.returnMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );

              // loop through departuredate prompt to delete them
              for (
                let i = 0;
                i <
                JSON.parse(latestSession.returnDatePromptId)['messageId']
                  .length;
                i++
              ) {
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.returnDatePromptId)['messageId'][i],
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
            } else if (latestSession.multi_city_search_state) {
              const markup = booking_en(
                msg.text.trim(),
                latestSession.destinationCity,
                latestSession.departureDate,
              );
              //TODO: change markup to multicity
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.returnMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            }
          }
        }
      } else {
        console.log('Not a date');
      }

      // this extracts the airport code, when a user presses the inline button
      function extractStringInBracket(sentence) {
        const start = sentence.indexOf('(') + 1;
        const end = sentence.indexOf(')', start);
        return sentence.substring(start, end);
      }

      // if (JSON.parse(session.userAnswerId)['messageId'].length !== 0) {
      //   const answerIds = JSON.parse(session.userAnswerId)['messageId'];
      //   console.log('answerIds ', answerIds);
      //   console.log('IDS  ', session);
      //   await this.updateUserSession(msg.chat.id, {
      //     userAnswerId: JSON.stringify({
      //       messageId: [...answerIds, msg.message_id],
      //     }),
      //   });
      // } else {
      //   await this.updateUserSession(msg.chat.id, {
      //     userAnswerId: JSON.stringify({
      //       messageId: [
      //         ...JSON.parse(session.userAnswerId)['messageId'],
      //         msg.message_id,
      //       ],
      //     }),
      //   });
      // }

      // handle airport selected by a user
      const airportCode = extractStringInBracket(msg.text.trim());

      // save this to a db
      if (airportCode !== undefined && airportCode !== '') {
        const latestSession = await this.databaseService.session.findFirst({
          where: { chat_id: msg.chat.id },
        });
        if (!latestSession.departureCityCode) {
          console.log('code ', airportCode);
          const update = await this.updateUserSession(msg.chat.id, {
            departureCityCode: airportCode,
            departureCity: msg.text.trim(),
            departureCityPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            const promises = [];
            // loop through departure prompt to delete them
            for (
              let i = 0;
              i <
              JSON.parse(latestSession.departureCityPromptId)['messageId']
                .length;
              i++
            ) {
              promises.push(
                await this.eventBot.deleteMessage(
                  msg.chat.id,
                  JSON.parse(latestSession.departureCityPromptId)['messageId'][
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

            if (latestSession.one_way_search_state) {
              const markup = booking_en(
                msg.text.trim(),
                latestSession.destinationCity,
                latestSession.departureDate,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.oneWayMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            } else if (latestSession.return_search_state) {
              const markup = booking_en(
                msg.text.trim(),
                latestSession.destinationCity,
                latestSession.departureDate,
                latestSession.returnDate,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.returnMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            } else if (latestSession.multi_city_search_state) {
              const deletedAllResponse = await Promise.all(promises);
              if (deletedAllResponse) {
                await this.destinationCitySelection(latestSession.chat_id);
              }
            }
          }
        } else if (!latestSession.destinationCityCode) {
          const update = await this.updateUserSession(msg.chat.id, {
            destinationCityCode: airportCode,
            destinationCity: msg.text.trim(),
            destinationCityPromptId: JSON.stringify({ messageId: [] }),
            userAnswerId: JSON.stringify({ messageId: [] }),
          });
          if (update) {
            if (latestSession.one_way_search_state) {
              const markup = booking_en(
                latestSession.departureCity,
                msg.text.trim(),
                latestSession.departureDate,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.oneWayMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            } else if (latestSession.return_search_state) {
              const markup = booking_en(
                latestSession.departureCity,
                msg.text.trim(),
                latestSession.departureDate,
                latestSession.returnDate,
              );
              await this.eventBot.editMessageReplyMarkup(
                { inline_keyboard: markup.returnMarkup },
                {
                  chat_id: msg.chat.id,
                  message_id: Number(latestSession.bookingMarkdownId),
                },
              );
            } else if (latestSession.multi_city_search_state) {
              await this.departureDateSelection(latestSession.chat_id);
            }
          }
          // loop through departure prompt to delete them
          for (
            let i = 0;
            i <
            JSON.parse(latestSession.destinationCityPromptId)['messageId']
              .length;
            i++
          ) {
            await this.eventBot.deleteMessage(
              msg.chat.id,
              JSON.parse(latestSession.destinationCityPromptId)['messageId'][i],
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
          //TODO: handle multicity
          // this.multicityCode[msg.chat.id] = airportCode;
          // this.thirdCity[msg.chat.id] = (msg.text).trim();
        }
      } else {
        console.log('code is empty');
      }
      // parse incoming message and handle commands
      try {
        const latestSession = await this.databaseService.session.findFirst({
          where: { chat_id: msg.chat.id },
        });
        if (
          !latestSession.departureCityCode ||
          !latestSession.destinationCityCode ||
          latestSession.multi_city_search_state
        ) {
          const matchedCity = await this.flightSearchService.searchAirport(
            msg.text.trim(),
          );
          if (matchedCity) {
            // Define your keyboard layout
            const cities = matchedCity.map((city) => {
              return [`${city['name']}, ${city['location']} (${city.iata})`];
            });
            //the markup from yhr returned cities
            const keyboard = cities;

            // Create a reply keyboard markup
            const SelectCityMarkup = {
              keyboard: keyboard,
              one_time_keyboard: true,
              remove_keyboard: true,
            };
            switch (latestSession.language) {
              case 'english':
                //TODO: SEND reply button along
                if (!latestSession.departureCityCode) {
                  const selectCityPrompt = await this.eventBot.sendMessage(
                    msg.chat.id,
                    `Please choose the city from the list 👇`,
                    { reply_markup: SelectCityMarkup },
                  );
                  if (selectCityPrompt) {
                    await this.updateUserSession(msg.chat.id, {
                      departureCityPromptId: JSON.stringify({
                        messageId: [
                          ...JSON.parse(session.departureCityPromptId)[
                            'messageId'
                          ],
                          selectCityPrompt.message_id,
                        ],
                      }),
                    });
                    return;
                  }
                } else if (
                  JSON.parse(latestSession.destinationCityPromptId)['messageId']
                    .length !== 0 &&
                  !latestSession.destinationCityCode
                ) {
                  const selectCityPrompt = await this.eventBot.sendMessage(
                    msg.chat.id,
                    `Please choose the city from the list 👇`,
                    { reply_markup: SelectCityMarkup },
                  );
                  if (selectCityPrompt) {
                    await this.updateUserSession(msg.chat.id, {
                      destinationCityPromptId: JSON.stringify({
                        messageId: [
                          ...JSON.parse(latestSession.destinationCityPromptId)[
                            'messageId'
                          ],
                          selectCityPrompt.message_id,
                        ],
                      }),
                    });
                    return;
                  }
                } else if (
                  JSON.parse(latestSession.destinationCityPromptId)['messageId']
                    .length !== 0 &&
                  latestSession.destinationCityCode &&
                  !latestSession.departureDatePromptId
                ) {
                  // loop through destination prompt to delete them
                  for (
                    let i = 0;
                    i <
                    JSON.parse(latestSession.destinationCityPromptId)[
                      'messageId'
                    ].length;
                    i++
                  ) {
                    await this.eventBot.deleteMessage(
                      msg.chat.id,
                      JSON.parse(latestSession.destinationCityPromptId)[
                        'messageId'
                      ][i],
                    );
                  }
                  // loop through to delete all userReply
                  for (
                    let i = 0;
                    i <
                    JSON.parse(latestSession.userAnswerId)['messageId'].length;
                    i++
                  ) {
                    await this.eventBot.deleteMessage(
                      msg.chat.id,
                      JSON.parse(latestSession.userAnswerId)['messageId'][i],
                    );
                  }
                  //TODO:delete userAnswerId
                  // delete this.userAnswerId[msg.chat.id];

                  const markup = booking_en(
                    latestSession.departureCity[msg.chat.id],
                    latestSession.destinationCity[msg.chat.id],
                    latestSession.departureDate[msg.chat.id],
                  );
                  const setDestinationCity =
                    await this.eventBot.editMessageReplyMarkup(
                      { inline_keyboard: markup.oneWayMarkup },
                      {
                        chat_id: msg.chat.id,
                        message_id: session.bookingMarkdownId,
                      },
                    );
                  if (setDestinationCity) {
                    return;
                  }
                  return;
                } else if (
                  JSON.parse(latestSession.departureDatePromptId)['messageId']
                    .length !== 0 &&
                  latestSession.departureDate
                ) {
                  const markup = booking_en(
                    latestSession.departureCity,
                    latestSession.destinationCity,
                    latestSession.departureDate,
                  );
                  const setDepartureDate =
                    await this.eventBot.editMessageReplyMarkup(
                      {
                        inline_keyboard: markup.oneWayMarkup,
                      },
                      {
                        chat_id: msg.chat.id,
                        message_id: Number(latestSession.bookingMarkdownId),
                      },
                    );
                  if (setDepartureDate) {
                    // loop through destination prompt to delete them

                    for (
                      let i = 0;
                      JSON.parse(latestSession.departureDatePromptId)[
                        'messageId'
                      ].length;
                      i++
                    ) {
                      await this.eventBot.deleteMessage(
                        msg.chat.id,
                        JSON.parse(latestSession.departureDatePromptId)[
                          'messageId'
                        ][i],
                      );
                    }
                    // loop through to delete all userReply
                    for (
                      let i = 0;
                      i <
                      JSON.parse(latestSession.userAnswerId)['messageId']
                        .length;
                      i++
                    ) {
                      await this.eventBot.deleteMessage(
                        msg.chat.id,
                        JSON.parse(latestSession.userAnswerId)['messageId'][i],
                      );
                    }
                    // delete this.userAnswerId[msg.chat.id];
                    return;
                  }
                }
                return;

              default:
                const searchReplyMarkup = {
                  inline_keyboard: searchType_en.searchTypeMarkup,
                };
                this.eventBot.sendMessage(
                  msg.chat.id,
                  'Please select the type of search 👇',
                  {
                    reply_markup: searchReplyMarkup,
                  },
                );
            }
          }
        }
      } catch (error) {
        console.log('second');
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
        '📅 Enter event start date.',
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
          description: JSON.stringify({
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
        '🕛 Enter event start time.',
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
          description: JSON.stringify({
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
        '📅 Enter event end date.',
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
          description: JSON.stringify({
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
        '🕛 Enter event end time.',
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
        'Enter Ticket category',
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
          description: JSON.stringify({
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
}
