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
    // try {
    //   // from here handles flight search details

    //   if (JSON.parse(session.userAnswerId)['messageId'].length !== 0) {
    //     const answerIds = JSON.parse(session.userAnswerId)['messageId'];
    //     console.log('answerIds ', answerIds);
    //     console.log('IDS  ', session);
    //     await this.updateUserSession(msg.chat.id, {
    //       userAnswerId: JSON.stringify({
    //         messageId: [...answerIds, msg.message_id],
    //       }),
    //     });
    //   } else {
    //     await this.updateUserSession(msg.chat.id, {
    //       userAnswerId: JSON.stringify({
    //         messageId: [
    //           ...JSON.parse(session.userAnswerId)['messageId'],
    //           msg.message_id,
    //         ],
    //       }),
    //     });
    //   }
    //   // Regular expression pattern to match the format DD/MM/YYYY
    //   const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
    //   // Check if the date string matches the pattern
    //   if (datePattern.test(msg.text.trim())) {
    //     const latestSession = await this.databaseService.session.findFirst({
    //       where: { chat_id: msg.chat.id },
    //     });
    //     if (
    //       JSON.parse(latestSession.departureDatePromptId)['messageId']
    //         .length !== 0 &&
    //       !latestSession.departureDate
    //     ) {
    //       const update = await this.updateUserSession(msg.chat.id, {
    //         departureDate: msg.text.trim(),
    //         departureDatePromptId: JSON.stringify({ messageId: [] }),
    //         userAnswerId: JSON.stringify({ messageId: [] }),
    //       });
    //       if (update) {
    //         if (latestSession.one_way_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             latestSession.destinationCity,
    //             msg.text.trim(),
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.oneWayMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.return_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             latestSession.destinationCity,
    //             msg.text.trim(),
    //             latestSession.returnDate,
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.returnMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.multi_city_search_state) {
    //           await this.updateUserSession(msg.chat.id, {
    //             multicitySearchData: JSON.stringify({
    //               flights: [
    //                 ...JSON.parse(latestSession.multicitySearchData)['flights'],
    //                 {
    //                   fromEntityId: latestSession.destinationCityCode,
    //                   toEntityId: latestSession.departureCityCode,
    //                   departDate: convertDateFormat(msg.text.trim()),
    //                 },
    //               ],
    //             }),
    //           });
    //           const multicityData =
    //             await this.databaseService.session.findFirst({
    //               where: {
    //                 chat_id: msg.chat.id,
    //               },
    //             });
    //           if (multicityData) {
    //             console.log('MUlti data', multicityData);
    //             const markup = booking_en(
    //               '',
    //               '',
    //               '',
    //               '',
    //               JSON.parse(multicityData.multicitySearchData)['flights'],
    //             );
    //             //TODO: change markup to multicity
    //             await this.eventBot.editMessageText(
    //               markup.message.multiCityMarkup,
    //               {
    //                 chat_id: msg.chat.id,
    //                 message_id: Number(latestSession.bookingMarkdownId),
    //                 reply_markup: { inline_keyboard: markup.multiCityMarkup },
    //               },
    //             );
    //           }
    //         }
    //       }
    //       // loop through departuredate prompt to delete them
    //       for (
    //         let i = 0;
    //         i <
    //         JSON.parse(latestSession.departureDatePromptId)['messageId'].length;
    //         i++
    //       ) {
    //         await this.eventBot.deleteMessage(
    //           msg.chat.id,
    //           JSON.parse(latestSession.departureDatePromptId)['messageId'][i],
    //         );
    //       }
    //       // loop through to delet all userReply
    //       for (
    //         let i = 0;
    //         i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
    //         i++
    //       ) {
    //         await this.eventBot.deleteMessage(
    //           msg.chat.id,
    //           JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //         );
    //       }
    //     } else if (
    //       // this will handle return flight
    //       JSON.parse(session.returnDatePromptId)['messageId'].length !== 0 &&
    //       !session.returnDate
    //     ) {
    //       const update = await this.updateUserSession(msg.chat.id, {
    //         returnDate: msg.text.trim(),
    //         returnDatePromptId: JSON.stringify({ messageId: [] }),
    //         userAnswerId: JSON.stringify({ messageId: [] }),
    //       });

    //       if (update) {
    //         if (latestSession.one_way_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             latestSession.destinationCity,
    //             msg.text.trim(),
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.oneWayMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.return_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             latestSession.destinationCity,
    //             latestSession.departureDate,
    //             msg.text.trim(),
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.returnMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );

    //           // loop through departuredate prompt to delete them
    //           for (
    //             let i = 0;
    //             i <
    //             JSON.parse(latestSession.returnDatePromptId)['messageId']
    //               .length;
    //             i++
    //           ) {
    //             await this.eventBot.deleteMessage(
    //               msg.chat.id,
    //               JSON.parse(latestSession.returnDatePromptId)['messageId'][i],
    //             );
    //           }
    //           // loop through to delet all userReply
    //           for (
    //             let i = 0;
    //             i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
    //             i++
    //           ) {
    //             await this.eventBot.deleteMessage(
    //               msg.chat.id,
    //               JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //             );
    //           }
    //         } else if (latestSession.multi_city_search_state) {
    //           const markup = booking_en(
    //             msg.text.trim(),
    //             latestSession.destinationCity,
    //             latestSession.departureDate,
    //           );
    //           //TODO: change markup to multicity
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.returnMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         }
    //       }
    //     }
    //   } else {
    //     console.log('Not a date');
    //   }

    //   // this extracts the airport code, when a user presses the inline button
    //   function extractStringInBracket(sentence) {
    //     const start = sentence.indexOf('(') + 1;
    //     const end = sentence.indexOf(')', start);
    //     return sentence.substring(start, end);
    //   }

    //   // if (JSON.parse(session.userAnswerId)['messageId'].length !== 0) {
    //   //   const answerIds = JSON.parse(session.userAnswerId)['messageId'];
    //   //   console.log('answerIds ', answerIds);
    //   //   console.log('IDS  ', session);
    //   //   await this.updateUserSession(msg.chat.id, {
    //   //     userAnswerId: JSON.stringify({
    //   //       messageId: [...answerIds, msg.message_id],
    //   //     }),
    //   //   });
    //   // } else {
    //   //   await this.updateUserSession(msg.chat.id, {
    //   //     userAnswerId: JSON.stringify({
    //   //       messageId: [
    //   //         ...JSON.parse(session.userAnswerId)['messageId'],
    //   //         msg.message_id,
    //   //       ],
    //   //     }),
    //   //   });
    //   // }

    //   // handle airport selected by a user
    //   const airportCode = extractStringInBracket(msg.text.trim());

    //   // save this to a db
    //   if (airportCode !== undefined && airportCode !== '') {
    //     const latestSession = await this.databaseService.session.findFirst({
    //       where: { chat_id: msg.chat.id },
    //     });
    //     if (!latestSession.departureCityCode) {
    //       console.log('code ', airportCode);
    //       const update = await this.updateUserSession(msg.chat.id, {
    //         departureCityCode: airportCode,
    //         departureCity: msg.text.trim(),
    //         departureCityPromptId: JSON.stringify({ messageId: [] }),
    //         userAnswerId: JSON.stringify({ messageId: [] }),
    //       });
    //       if (update) {
    //         const promises = [];
    //         // loop through departure prompt to delete them
    //         for (
    //           let i = 0;
    //           i <
    //           JSON.parse(latestSession.departureCityPromptId)['messageId']
    //             .length;
    //           i++
    //         ) {
    //           promises.push(
    //             await this.eventBot.deleteMessage(
    //               msg.chat.id,
    //               JSON.parse(latestSession.departureCityPromptId)['messageId'][
    //                 i
    //               ],
    //             ),
    //           );
    //         }
    //         // loop through to delet all userReply
    //         for (
    //           let i = 0;
    //           i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
    //           i++
    //         ) {
    //           promises.push(
    //             await this.eventBot.deleteMessage(
    //               msg.chat.id,
    //               JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //             ),
    //           );
    //         }

    //         if (latestSession.one_way_search_state) {
    //           const markup = booking_en(
    //             msg.text.trim(),
    //             latestSession.destinationCity,
    //             latestSession.departureDate,
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.oneWayMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.return_search_state) {
    //           const markup = booking_en(
    //             msg.text.trim(),
    //             latestSession.destinationCity,
    //             latestSession.departureDate,
    //             latestSession.returnDate,
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.returnMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.multi_city_search_state) {
    //           const deletedAllResponse = await Promise.all(promises);
    //           if (deletedAllResponse) {
    //             await this.destinationCitySelection(latestSession.chat_id);
    //           }
    //         }
    //       }
    //     } else if (!latestSession.destinationCityCode) {
    //       const update = await this.updateUserSession(msg.chat.id, {
    //         destinationCityCode: airportCode,
    //         destinationCity: msg.text.trim(),
    //         destinationCityPromptId: JSON.stringify({ messageId: [] }),
    //         userAnswerId: JSON.stringify({ messageId: [] }),
    //       });
    //       if (update) {
    //         if (latestSession.one_way_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             msg.text.trim(),
    //             latestSession.departureDate,
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.oneWayMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.return_search_state) {
    //           const markup = booking_en(
    //             latestSession.departureCity,
    //             msg.text.trim(),
    //             latestSession.departureDate,
    //             latestSession.returnDate,
    //           );
    //           await this.eventBot.editMessageReplyMarkup(
    //             { inline_keyboard: markup.returnMarkup },
    //             {
    //               chat_id: msg.chat.id,
    //               message_id: Number(latestSession.bookingMarkdownId),
    //             },
    //           );
    //         } else if (latestSession.multi_city_search_state) {
    //           await this.departureDateSelection(latestSession.chat_id);
    //         }
    //       }
    //       // loop through departure prompt to delete them
    //       for (
    //         let i = 0;
    //         i <
    //         JSON.parse(latestSession.destinationCityPromptId)['messageId']
    //           .length;
    //         i++
    //       ) {
    //         await this.eventBot.deleteMessage(
    //           msg.chat.id,
    //           JSON.parse(latestSession.destinationCityPromptId)['messageId'][i],
    //         );
    //       }
    //       // loop through to delet all userReply
    //       for (
    //         let i = 0;
    //         i < JSON.parse(latestSession.userAnswerId)['messageId'].length;
    //         i++
    //       ) {
    //         await this.eventBot.deleteMessage(
    //           msg.chat.id,
    //           JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //         );
    //       }
    //     } else {
    //       //TODO: handle multicity
    //       // this.multicityCode[msg.chat.id] = airportCode;
    //       // this.thirdCity[msg.chat.id] = (msg.text).trim();
    //     }
    //   } else {
    //     console.log('code is empty');
    //   }
    //   // parse incoming message and handle commands
    //   try {
    //     const latestSession = await this.databaseService.session.findFirst({
    //       where: { chat_id: msg.chat.id },
    //     });
    //     if (
    //       !latestSession.departureCityCode ||
    //       !latestSession.destinationCityCode ||
    //       latestSession.multi_city_search_state
    //     ) {
    //       const matchedCity = await this.flightSearchService.searchAirport(
    //         msg.text.trim(),
    //       );
    //       if (matchedCity) {
    //         // Define your keyboard layout
    //         const cities = matchedCity.map((city) => {
    //           return [`${city['name']}, ${city['location']} (${city.iata})`];
    //         });
    //         //the markup from yhr returned cities
    //         const keyboard = cities;

    //         // Create a reply keyboard markup
    //         const SelectCityMarkup = {
    //           keyboard: keyboard,
    //           one_time_keyboard: true,
    //           remove_keyboard: true,
    //         };
    //         switch (latestSession.language) {
    //           case 'english':
    //             //TODO: SEND reply button along
    //             if (!latestSession.departureCityCode) {
    //               const selectCityPrompt = await this.eventBot.sendMessage(
    //                 msg.chat.id,
    //                 `Please choose the city from the list 👇`,
    //                 { reply_markup: SelectCityMarkup },
    //               );
    //               if (selectCityPrompt) {
    //                 await this.updateUserSession(msg.chat.id, {
    //                   departureCityPromptId: JSON.stringify({
    //                     messageId: [
    //                       ...JSON.parse(session.departureCityPromptId)[
    //                         'messageId'
    //                       ],
    //                       selectCityPrompt.message_id,
    //                     ],
    //                   }),
    //                 });
    //                 return;
    //               }
    //             } else if (
    //               JSON.parse(latestSession.destinationCityPromptId)['messageId']
    //                 .length !== 0 &&
    //               !latestSession.destinationCityCode
    //             ) {
    //               const selectCityPrompt = await this.eventBot.sendMessage(
    //                 msg.chat.id,
    //                 `Please choose the city from the list 👇`,
    //                 { reply_markup: SelectCityMarkup },
    //               );
    //               if (selectCityPrompt) {
    //                 await this.updateUserSession(msg.chat.id, {
    //                   destinationCityPromptId: JSON.stringify({
    //                     messageId: [
    //                       ...JSON.parse(latestSession.destinationCityPromptId)[
    //                         'messageId'
    //                       ],
    //                       selectCityPrompt.message_id,
    //                     ],
    //                   }),
    //                 });
    //                 return;
    //               }
    //             } else if (
    //               JSON.parse(latestSession.destinationCityPromptId)['messageId']
    //                 .length !== 0 &&
    //               latestSession.destinationCityCode &&
    //               !latestSession.departureDatePromptId
    //             ) {
    //               // loop through destination prompt to delete them
    //               for (
    //                 let i = 0;
    //                 i <
    //                 JSON.parse(latestSession.destinationCityPromptId)[
    //                   'messageId'
    //                 ].length;
    //                 i++
    //               ) {
    //                 await this.eventBot.deleteMessage(
    //                   msg.chat.id,
    //                   JSON.parse(latestSession.destinationCityPromptId)[
    //                     'messageId'
    //                   ][i],
    //                 );
    //               }
    //               // loop through to delete all userReply
    //               for (
    //                 let i = 0;
    //                 i <
    //                 JSON.parse(latestSession.userAnswerId)['messageId'].length;
    //                 i++
    //               ) {
    //                 await this.eventBot.deleteMessage(
    //                   msg.chat.id,
    //                   JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //                 );
    //               }
    //               //TODO:delete userAnswerId
    //               // delete this.userAnswerId[msg.chat.id];

    //               const markup = booking_en(
    //                 latestSession.departureCity[msg.chat.id],
    //                 latestSession.destinationCity[msg.chat.id],
    //                 latestSession.departureDate[msg.chat.id],
    //               );
    //               const setDestinationCity =
    //                 await this.eventBot.editMessageReplyMarkup(
    //                   { inline_keyboard: markup.oneWayMarkup },
    //                   {
    //                     chat_id: msg.chat.id,
    //                     message_id: session.bookingMarkdownId,
    //                   },
    //                 );
    //               if (setDestinationCity) {
    //                 return;
    //               }
    //               return;
    //             } else if (
    //               JSON.parse(latestSession.departureDatePromptId)['messageId']
    //                 .length !== 0 &&
    //               latestSession.departureDate
    //             ) {
    //               const markup = booking_en(
    //                 latestSession.departureCity,
    //                 latestSession.destinationCity,
    //                 latestSession.departureDate,
    //               );
    //               const setDepartureDate =
    //                 await this.eventBot.editMessageReplyMarkup(
    //                   {
    //                     inline_keyboard: markup.oneWayMarkup,
    //                   },
    //                   {
    //                     chat_id: msg.chat.id,
    //                     message_id: Number(latestSession.bookingMarkdownId),
    //                   },
    //                 );
    //               if (setDepartureDate) {
    //                 // loop through destination prompt to delete them

    //                 for (
    //                   let i = 0;
    //                   JSON.parse(latestSession.departureDatePromptId)[
    //                     'messageId'
    //                   ].length;
    //                   i++
    //                 ) {
    //                   await this.eventBot.deleteMessage(
    //                     msg.chat.id,
    //                     JSON.parse(latestSession.departureDatePromptId)[
    //                       'messageId'
    //                     ][i],
    //                   );
    //                 }
    //                 // loop through to delete all userReply
    //                 for (
    //                   let i = 0;
    //                   i <
    //                   JSON.parse(latestSession.userAnswerId)['messageId']
    //                     .length;
    //                   i++
    //                 ) {
    //                   await this.eventBot.deleteMessage(
    //                     msg.chat.id,
    //                     JSON.parse(latestSession.userAnswerId)['messageId'][i],
    //                   );
    //                 }
    //                 // delete this.userAnswerId[msg.chat.id];
    //                 return;
    //               }
    //             }
    //             return;

    //           default:
    //             const searchReplyMarkup = {
    //               inline_keyboard: searchType_en.searchTypeMarkup,
    //             };
    //             this.eventBot.sendMessage(
    //               msg.chat.id,
    //               'Please select the type of search 👇',
    //               {
    //                 reply_markup: searchReplyMarkup,
    //               },
    //             );
    //         }
    //       }
    //     }
    //   } catch (error) {
    //     console.log('second');
    //     console.error(error);

    //     return await this.eventBot.sendMessage(
    //       msg.chat.id,
    //       `Processing command failed, please try again`,
    //     );
    //   }
    // } catch (error) {
    //   console.log(error);
    // }
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
          const uniqueCode = await this.generateNkowaId();
          let userNkowaId = 0;
          //   if (uniqueCode) {
          //     const user = await this.saveUserToDB({
          //       chat_id: chatId,
          //       nkowa_id: uniqueCode,
          //     });
          //     if (user) {
          //       userNkowaId = user.nkowa_id;
          //     }
          //     await this.sendAllFeature(chatId, username, userNkowaId);
          //     return;
          //   }
          await this.sendAllFeature(chatId);
          return;

        // proceed to buy ticket, this triggers the details markup
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
              one_way_search_state: true,
              return_search_state: false,
              multi_city_search_state: false,
              user: {
                connect: { chat_id: query.message.chat.id },
              },
              departureCityPromptId: JSON.stringify({
                messageId: [],
              }),
              destinationCityPromptId: JSON.stringify({
                messageId: [],
              }),
              userAnswerId: JSON.stringify({ messageId: [] }),
              departureDatePromptId: JSON.stringify({
                messageId: [],
              }),
              returnDatePromptId: JSON.stringify({
                messageId: [],
              }),
            });
          } else {
            await this.createSession(query.message.chat.id, {
              one_way_search_state: true,
              return_search_state: false,
              multi_city_search_state: false,
              user: { connect: { chat_id: query.message.chat.id } },
              departureCityPromptId: JSON.stringify({
                messageId: [],
              }),
              destinationCityPromptId: JSON.stringify({
                messageId: [],
              }),
              userAnswerId: JSON.stringify({ messageId: [] }),
              departureDatePromptId: JSON.stringify({
                messageId: [],
              }),
              returnDatePromptId: JSON.stringify({ messageId: [] }),
            });
          }
          return await this.createEvent(query.message.chat.id);

        // close opened markup and delete result
        case '/closedelete':
          await this.eventBot.sendChatAction(query.message.chat.id, 'typing');
          await this.databaseService.session.deleteMany({
            where: { chat_id: chatId },
          });
          await this.databaseService.session.deleteMany({
            where: { chat_id: chatId },
          });
          //Number(bookingDetailsDbId)
          return await this.eventBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        case '/fileUploadUrl':
          await this.fileUploadByUrlPrompt(chatId);
          if (this.startedChatting[chatId].chat) {
            delete this.startedChatting[chatId];
            return;
          }
          return;

        case '/fileUpload':
          await this.fileUploadPrompt(chatId);
          if (this.startedChatting[chatId].chat) {
            delete this.startedChatting[chatId];
            return;
          }
          return;

        // case '/summary':
        //   try {
        //     await this.eventBot.sendMessage(chatId, '⏳ Request Processing .....');
        //     const summary = await this.ragService.getSummary(sourceId);
        //     if (summary) {
        //       return this.eventBot.sendMessage(chatId, summary.summary);
        //     } else {
        //       return this.eventBot.sendMessage(chatId, 'Error processing summary');
        //     }
        //   } catch (error) {
        //     console.log(error);
        //   }

        case '/chatPdf':
          try {
            const prompt = this.eventBot.sendMessage(
              chatId,
              'Start chatting 💬 ...',
            );
            if (prompt) {
              // trigger start chat
              return (this.startedChatting[chatId] = {
                sourceId: sourceId,
                chat: true,
              });
            }
          } catch (error) {
            console.log(error);
          }

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

  // Method to  save a new userdata to the database
  //   async saveUserToDB(saveUserDto: Prisma.UserCreateInput) {
  //     try {
  //       const isSaved = await this.databaseService.user.findFirst({
  //         where: { chat_id: saveUserDto.chat_id },
  //       });
  //       if (!isSaved) {
  //         return this.databaseService.user.create({ data: saveUserDto });
  //       }
  //       return isSaved;
  //     } catch (error) {
  //       console.error(error);
  //     }
  //   }

  generateNkowaId = async () => {
    // Generate a random 4-digit number
    let code = Math.floor(1000 + Math.random() * 9000);

    // Check if the code is already in use
    // If yes, generate a new one until it's unique
    while (this.usedCodes.includes(code)) {
      code = Math.floor(1000 + Math.random() * 9000);
    }

    // Add the code to the list of used codes
    this.usedCodes.push(code);

    return code;
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
}
