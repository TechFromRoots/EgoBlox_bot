import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import {
  welcomeMessageMarkup,
  allFeaturesMarkup,
  wallerDetailsMarkup,
  showBalanceMarkup,
  exportWalletWarningMarkup,
  displayPrivateKeyMarkup,
  resetWalletWarningMarkup,
  walletFeaturesMarkup,
  transactionReceiptMarkup,
  showBillsMarkup,
  selectWalletTypeMarkup,
  notifyReceiverMarkup,
} from './markups';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/database/schemas/user.schema';
import { Model } from 'mongoose';
import { Session, SessionDocument } from 'src/database/schemas/session.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/database/schemas/transaction.schema';
import { WalletService } from 'src/wallet/wallet.service';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { detectSendToken } from './utils/detectSendToken.utils';
import { detectAirtime } from './utils/detectAirtime.utils';
import { BillsService } from 'src/bills/bills.service';
import { ContractInteractionService } from 'src/paymaster-contract-interaction/contract-interaction.service';

// import { base, baseSepolia } from 'viem/chains';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

//dynamically import coinbaseOnchainkit
async function loadGetAddressModule(name: string) {
  const { getAddress } = await import('@coinbase/onchainkit/identity');
  return getAddress({ name });
}

@Injectable()
export class BotService {
  private readonly egoBloxBot: TelegramBot;
  private logger = new Logger(BotService.name);
  private readonly saltRounds = 10;
  private readonly getAddress = loadGetAddressModule;

  constructor(
    private readonly walletService: WalletService,
    private readonly billsService: BillsService,
    private readonly contractInteractionService: ContractInteractionService,
    @InjectModel(User.name) private readonly UserModel: Model<User>,
    @InjectModel(Session.name) private readonly SessionModel: Model<Session>,
    @InjectModel(Transaction.name)
    private readonly TransactionModel: Model<Transaction>,
  ) {
    this.egoBloxBot = new TelegramBot(token!, { polling: true });
    // event listerner for incomning messages
    this.egoBloxBot.on('message', this.handleRecievedMessages);

    // event Listerner for button requests
    this.egoBloxBot.on('callback_query', this.handleButtonCommands);
  }

  handleRecievedMessages = async (msg: any) => {
    this.logger.debug(msg);
    try {
      await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
      // condition to differntiate between users actions on the bot
      const session: SessionDocument | null = await this.SessionModel.findOne({
        chat_id: msg.chat.id,
      });
      const user = await this.UserModel.findOne({
        chat_id: msg.chat.id,
      });
      console.log('session  ', session);
      if (msg.text! !== '/start' && msg.text! !== '/menu') {
        this.handleUserTextInputs(msg, session!);
      } else {
        const command = msg.text!;
        console.log('Command :', command);
        if (command === '/start') {
          // delete existing user session
          if (session) {
            await this.SessionModel.deleteMany({
              chat_id: msg.chat.id,
            });
          }
          const username = `${msg.from.username}`;
          if (!user) {
            // save user
            await this.UserModel.create({
              chat_id: msg.chat.id,
              username,
            });
          }

          const welcome = await welcomeMessageMarkup(username);

          if (welcome) {
            const replyMarkup = {
              inline_keyboard: welcome.keyboard,
            };
            await this.egoBloxBot.sendMessage(msg.chat.id, welcome.message, {
              reply_markup: replyMarkup,
            });
          }
        } else if (command === '/menu') {
          const allFeatures = await allFeaturesMarkup();
          if (allFeatures) {
            const replyMarkup = {
              inline_keyboard: allFeatures.keyboard,
            };
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              allFeatures.message,
              {
                parse_mode: 'HTML',
                reply_markup: replyMarkup,
              },
            );
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  //handler for users inputs
  handleUserTextInputs = async (
    msg: TelegramBot.Message,
    session?: SessionDocument,
  ) => {
    await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
    try {
      const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
      if (session) {
        // update users answerId
        await this.SessionModel.updateOne(
          { _id: session._id },
          { $push: { userInputId: msg.message_id } },
        );
      }

      // function to detect 4 digit pin
      function isValidPin(pin) {
        const pinRegex = /^\d{4}$/;
        return pinRegex.test(pin);
      }

      // detect send token command
      const matchedSend = detectSendToken(msg.text!.trim());
      console.log('Matchedsend', matchedSend);

      // detect buy airtime command
      const matchBuyAirtime = detectAirtime(msg.text!.trim());
      console.log('Matchedairtime', matchBuyAirtime);
      // parse incoming message and handle commands
      try {
        // handle smart account wallet creation
        if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.createSmartWallet
        ) {
          const pin = msg.text!.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const newWallet = this.walletService.createWallet();
          const smartAccount = await this.contractInteractionService.getAccount(
            `${newWallet.privateKey}` as `0x${string}`,
          );
          // encrypt wallet details with pin
          const encryptedWalletDetails = await this.walletService.encryptWallet(
            pin,
            newWallet.privateKey,
          );

          // encrypt with deafault pin(for recovery)
          const defaultEncryptedWalletDetails =
            await this.walletService.encryptWallet(
              process.env.DEFAULT_WALLET_PIN!,
              newWallet.privateKey,
            );
          // save  user wallet details
          await this.UserModel.updateOne(
            { chat_id: msg.chat.id },
            {
              WalletType: 'SMART',
              defaultWalletDetails: defaultEncryptedWalletDetails.json,
              walletDetails: encryptedWalletDetails.json,
              pin: hashedPin,
              walletAddress: newWallet.address,
              smartWalletAddress: smartAccount.address,
            },
          );

          const promises: any[] = [];
          const latestSession = await this.SessionModel.findOne({
            chat_id: msg.chat.id,
          });
          // loop through pin prompt to delete them
          for (
            let i = 0;
            i < latestSession!.walletPinPromptInputId.length;
            i++
          ) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.walletPinPromptInputId[i],
              ),
            );
          }
          // loop through to delete all userReply
          for (let i = 0; i < latestSession!.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.userInputId[i],
              ),
            );
          }

          await this.sendWalletDetails(
            msg.chat.id,
            smartAccount.address,
            'SMART',
          );
        } // handle normal wallet creation
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.createWallet
        ) {
          const pin = msg.text!.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const newWallet = this.walletService.createWallet();

          // encrypt wallet details with pin
          const encryptedWalletDetails = await this.walletService.encryptWallet(
            pin,
            newWallet.privateKey,
          );

          // encrypt with deafault pin(for recovery)
          const defaultEncryptedWalletDetails =
            await this.walletService.encryptWallet(
              process.env.DEFAULT_WALLET_PIN!,
              newWallet.privateKey,
            );
          // save  user wallet details
          await this.UserModel.updateOne(
            { chat_id: msg.chat.id },
            {
              WalletType: 'NORMAL',
              defaultWalletDetails: defaultEncryptedWalletDetails.json,
              walletDetails: encryptedWalletDetails.json,
              pin: hashedPin,
              walletAddress: newWallet.address,
            },
          );

          const promises: any[] = [];
          const latestSession = await this.SessionModel.findOne({
            chat_id: msg.chat.id,
          });
          // loop through pin prompt to delete them
          for (
            let i = 0;
            i < latestSession!.walletPinPromptInputId.length;
            i++
          ) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.walletPinPromptInputId[i],
              ),
            );
          }
          // loop through to delete all userReply
          for (let i = 0; i < latestSession!.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.userInputId[i],
              ),
            );
          }

          await this.sendWalletDetails(msg.chat.id, newWallet.address);
        } // wallet import pin
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.importWallet
        ) {
          const pin = msg.text!.trim();
          const hashedPin = await bcrypt.hash(pin, this.saltRounds);
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // check if a user wallet details exist, then decrypt with default pin and and encrypt again
          if (user!.walletAddress && user!.defaultWalletDetails) {
            const decryptedWallet = await this.walletService.decryptWallet(
              process.env.DEFAULT_WALLET_PIN!,
              user!.defaultWalletDetails,
            );
            const encryptedWalletDetails =
              await this.walletService.encryptWallet(
                pin,
                decryptedWallet.privateKey,
              );
            // save  user wallet details
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                walletDetails: encryptedWalletDetails.json,
                pin: hashedPin,
                walletAddress: decryptedWallet.address,
              },
            );

            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'Transaction pin successfully updated',
            );
          }

          const promises: any[] = [];
          const latestSession = await this.SessionModel.findOne({
            chat_id: msg.chat.id,
          });
          // loop through pin prompt to delete them
          for (
            let i = 0;
            i < latestSession!.walletPinPromptInputId.length;
            i++
          ) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.walletPinPromptInputId[i],
              ),
            );
          }
          // loop through to delete all userReply
          for (let i = 0; i < latestSession!.userInputId.length; i++) {
            promises.push(
              await this.egoBloxBot.deleteMessage(
                msg.chat.id,
                latestSession!.userInputId[i],
              ),
            );
          }

          await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
        } // wallet export
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.exportWallet
        ) {
          const pin = msg.text!.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user!.pin);
          // decrypt wallet if pin is correct
          if (pinMatch && user!.walletAddress && user!.walletDetails) {
            const decryptedWallet = await this.walletService.decryptWallet(
              pin,
              user!.walletDetails,
            );

            if (decryptedWallet.privateKey) {
              const promises: any[] = [];
              const latestSession = await this.SessionModel.findOne({
                chat_id: msg.chat.id,
              });
              // loop through pin prompt to delete them
              for (
                let i = 0;
                i < latestSession!.walletPinPromptInputId.length;
                i++
              ) {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.walletPinPromptInputId[i],
                  ),
                );
              }
              // loop through to delete all userReply
              for (let i = 0; i < latestSession!.userInputId.length; i++) {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.userInputId[i],
                  ),
                );
              }
              console.log(
                'user details :',
                decryptedWallet.privateKey,
                user!.walletAddress,
              );
              // display wallet key
              await this.displayWalletPrivateKey(
                msg.chat.id,
                decryptedWallet.privateKey,
              );
            }

            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        } // reset wallet
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.resetWallet
        ) {
          const pin = msg.text!.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user!.pin);
          // delete wallet if pin is correct
          if (pinMatch) {
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                $unset: {
                  smartWalletAddress: '',
                  walletAddress: '',
                  walletDetails: '',
                  defaultWalletDetails: '',
                  pin: '',
                },
              },
            );

            const promises: any[] = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession!.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession!.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }

            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'Wallet deleted successfully',
            );

            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        } // handle send token
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.sendToken
        ) {
          const pin = msg.text!.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user!.pin);
          // send Token if pin is correct
          if (pinMatch) {
            // DECRYPT WALLET
            const walletDetail = await this.walletService.decryptWallet(
              pin,
              user!.walletDetails,
            );
            // get the transaction
            const transaction = await this.TransactionModel.findOne({
              _id: session!.transactionId,
            });
            let txn: any;
            let receipt: any;

            switch (transaction!.token) {
              case 'ETH':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeEthTransferTransaction(
                      walletDetail.privateKey as `0x${string}`,
                      transaction!.receiverAddress as `0x${string}`,
                      Number(transaction!.amount),
                    );

                  console.log(txn);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );
                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      {
                        transactionHash: txn.receipt.transactionHash,
                        status: txn.success === true ? 1 : 0,
                      },
                      `Received ${transaction!.amount} ${transaction!.token} from @${user.username}`,
                    );
                  }
                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
                  );

                  break;
                } else {
                  txn = await this.walletService.transferEth(
                    walletDetail.privateKey,
                    transaction!.receiverAddress,
                    Number(transaction!.amount),
                  );

                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      receipt,
                      `Received ${transaction!.amount} ${transaction!.token} from @${user?.username}`,
                    );
                  }
                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
                  );

                  break;
                }

              case 'USDC':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeTransferErc20Transaction(
                      walletDetail.privateKey as `0x${string}`,
                      process.env.USDC_ADDRESS as `0x${string}`,
                      transaction!.receiverAddress as `0x${string}`,
                      Number(transaction!.amount),
                      6,
                    );

                  console.log(txn);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `Transfer of ${transaction!.amount} ${transaction!.token} to @${user.username}`,
                  );
                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      {
                        transactionHash: txn.receipt.transactionHash,
                        status: txn.success === true ? 1 : 0,
                      },
                      `Received ${transaction!.amount} ${transaction!.token} from @${user.username}`,
                    );
                  }
                  break;
                } else {
                  txn = await this.walletService.transferUSDC(
                    walletDetail.privateKey,
                    transaction!.receiverAddress,
                    Number(transaction!.amount),
                  );
                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
                  );
                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      receipt,
                      `Received ${transaction!.amount} ${transaction!.token} from @${user?.username}`,
                    );
                  }

                  break;
                }

              case 'DAI':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeTransferErc20Transaction(
                      walletDetail.privateKey as `0x${string}`,
                      process.env.DAI_ADDRESS as `0x${string}`,
                      transaction!.receiverAddress as `0x${string}`,
                      Number(transaction!.amount),
                      6,
                    );

                  console.log(txn);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
                  );
                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      {
                        transactionHash: txn.receipt.transactionHash,
                        status: txn.success === true ? 1 : 0,
                      },
                      `Received ${transaction!.amount} ${transaction!.token} from @${user.username}`,
                    );
                  }

                  break;
                } else {
                  txn = await this.walletService.transferDAI(
                    walletDetail.privateKey,
                    transaction!.receiverAddress,
                    Number(transaction!.amount),
                  );
                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
                  );

                  if (transaction?.receiverChatId) {
                    await this.notifyReceiver(
                      transaction?.receiverChatId,
                      receipt,
                      `Received ${transaction!.amount} ${transaction!.token} from @${user?.username}`,
                    );
                  }

                  break;
                }

              default:
                break;
            }

            const promises: any[] = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            console.log('latest session', latestSession);
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession!.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession!.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // delete all session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        }
        // handle buy airtime
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.airtime
        ) {
          const pin = msg.text!.trim();
          const user = await this.UserModel.findOne({ chat_id: msg.chat.id });
          // compare hashed pin
          const pinMatch = await bcrypt.compare(pin, user!.pin);
          // send Token if pin is correct
          if (pinMatch) {
            // DECRYPT WALLET
            const walletDetail = await this.walletService.decryptWallet(
              pin,
              user!.walletDetails,
            );
            // get the transaction
            const transaction = await this.TransactionModel.findOne({
              _id: session!.transactionId,
            });
            let txn: any;
            let receipt: any;
            switch (transaction!.token) {
              case 'ETH':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeEthTransferTransaction(
                      walletDetail.privateKey as `0x${string}`,
                      process.env.ADMIN_WALLET as `0x${string}`,
                      Number(transaction!.amount),
                    );
                  console.log(txn);

                  if (txn.success === true) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction

                      console.log('paid airtime', airtime);
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }
                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                } else {
                  txn = await this.walletService.transferEth(
                    walletDetail.privateKey,
                    process.env.ADMIN_WALLET!,
                    Number(transaction!.amount),
                  );
                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  if (receipt.status == 1) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction

                      console.log('paid airtime', airtime);
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }

                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                }

              case 'USDC':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeTransferErc20Transaction(
                      walletDetail.privateKey as `0x${string}`,
                      process.env.USDC_ADDRESS as `0x${string}`,
                      process.env.ADMIN_WALLET as `0x${string}`,
                      Number(transaction!.amount),
                      6,
                    );
                  console.log(txn);

                  if (txn.success === true) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }

                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                } else {
                  txn = await this.walletService.transferUSDC(
                    walletDetail.privateKey,
                    process.env.ADMIN_WALLET!,
                    Number(transaction!.amount),
                  );
                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  if (receipt.status == 1) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }

                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                }

              case 'DAI':
                if (user?.WalletType === 'SMART') {
                  txn =
                    await this.contractInteractionService.executeTransferErc20Transaction(
                      walletDetail.privateKey as `0x${string}`,
                      process.env.DAI_ADDRESS as `0x${string}`,
                      process.env.ADMIN_WALLET as `0x${string}`,
                      Number(transaction!.amount),
                      6,
                    );
                  console.log(txn);
                  console.log(receipt);

                  if (txn.success === true) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }

                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      userOpHash: txn.userOpHash,
                      status: txn.success === true ? 'successful' : 'failed',
                      ownerApproved: true,
                      hash: receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    {
                      transactionHash: txn.receipt.transactionHash,
                      status: txn.success === true ? 1 : 0,
                    },
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                } else {
                  txn = await this.walletService.transferDAI(
                    walletDetail.privateKey,
                    process.env.ADMIN_WALLET!,
                    Number(transaction!.amount),
                  );
                  console.log(txn);
                  receipt = await txn.wait();
                  console.log(receipt);
                  if (receipt.status == 1) {
                    // buy airtime
                    const airtime = await this.billsService.buyAirtime(
                      `${transaction!.airtimeDataNumber}`,
                      `${transaction!.airtimeAmount}`,
                    );
                    if (airtime) {
                      //update transaction
                      await this.TransactionModel.updateOne(
                        { _id: transaction!._id },
                        {
                          flutterWave_status: airtime.status,
                          flutterWave_reference: airtime.data.reference,
                          flutterWave_tx_ref: airtime.data.tx_ref,
                          flutterWave_bill_Network: airtime.data.network,
                        },
                      );
                    }
                  }

                  //update transaction
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      status: receipt.status === 0 ? 'failed' : 'successful',
                      ownerApproved: true,
                      hash: txn.receipt.transactionHash,
                    },
                  );

                  await this.sendTransactionReceipt(
                    msg.chat.id,
                    receipt,
                    `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber} `,
                  );
                  break;
                }

              default:
                break;
            }

            const promises: any[] = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            console.log('latest session', latestSession);
            // loop through pin prompt to delete them
            for (
              let i = 0;
              i < latestSession!.walletPinPromptInputId.length;
              i++
            ) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.walletPinPromptInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession!.userInputId.length; i++) {
              try {
                promises.push(
                  await this.egoBloxBot.deleteMessage(
                    msg.chat.id,
                    latestSession!.userInputId[i],
                  ),
                );
              } catch (error) {
                console.log(error);
              }
            }
            // delete all session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } else {
            return await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Processing command failed, Invalid pin`,
            );
          }
        }
        //handle import wallet private key
        else if (
          session &&
          session.importWallet &&
          session.importWalletPromptInput
        ) {
          if (await this.isPrivateKey(msg.text!.trim(), msg.chat.id)) {
            const privateKey = msg.text!.trim();
            console.log(privateKey);
            const importedWallet = this.walletService.getAddressFromPrivateKey(
              `${privateKey}`,
            );
            console.log(importedWallet);

            // encrypt wallet details with  default
            const encryptedWalletDetails =
              await this.walletService.encryptWallet(
                process.env.DEFAULT_WALLET_PIN!,
                privateKey,
              );

            // save  user wallet details
            await this.UserModel.updateOne(
              { chat_id: msg.chat.id },
              {
                defaultWalletDetails: encryptedWalletDetails.json,
                walletAddress: importedWallet.address,
              },
            );

            const promises: any[] = [];
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            // loop through  import privateKey prompt to delete them
            for (
              let i = 0;
              i < latestSession!.importWalletPromptInputId.length;
              i++
            ) {
              promises.push(
                await this.egoBloxBot.deleteMessage(
                  msg.chat.id,
                  latestSession!.importWalletPromptInputId[i],
                ),
              );
            }
            // loop through to delete all userReply
            for (let i = 0; i < latestSession!.userInputId.length; i++) {
              promises.push(
                await this.egoBloxBot.deleteMessage(
                  msg.chat.id,
                  latestSession!.userInputId[i],
                ),
              );
            }

            await this.sendWalletDetails(msg.chat.id, importedWallet.address);
            return this.promptWalletPin(msg.chat.id, 'import');
          }
          return;
        }
        // detect send action
        else if (matchedSend) {
          let receiverAddress: string;
          let receiver_chatId;
          if (matchedSend.walletType === 'ens') {
            receiverAddress = await this.getAddress(matchedSend.receiver);
          } else if (matchedSend.walletType === 'username') {
            const receiver = await this.UserModel.findOne({
              username: matchedSend.receiver,
            });
            receiver_chatId = receiver?.chat_id;
            if (receiver?.WalletType === 'SMART') {
              receiverAddress = receiver!.smartWalletAddress;
            } else {
              receiverAddress = receiver!.walletAddress;
            }
          } else receiverAddress = matchedSend.receiver;

          // save transaction
          const transaction = await this.TransactionModel.create({
            chat_id: msg.chat.id,
            token: matchedSend.token,
            amount: matchedSend.amount,
            sender:
              user?.WalletType === 'SMART'
                ? user?.smartWalletAddress
                : user!.walletAddress,
            receiver: matchedSend.receiver,
            receiverChatId: receiver_chatId,
            ownerApproved: false,
            receiverType: matchedSend.walletType,
            receiverAddress,
            type: 'SEND',
          });
          if (transaction) {
            return await this.sendTokenWalletPinPrompt(
              msg.chat.id,
              transaction,
            );
          }
        }
        // detect buy airtime action
        else if (matchBuyAirtime) {
          const rateAmount = (() => {
            const { token, amount } = matchBuyAirtime;
            const rates = {
              ETH: process.env.ETH_RATE!,
              USDC: process.env.USDC_RATE!,
              DAI: process.env.DAI_RATE!,
            };

            if (token === 'ETH') {
              return (Number(amount) / Number(rates.ETH)).toFixed(18);
            } else if (token === 'USDC') {
              return (Number(amount) / Number(rates.USDC)).toFixed(6);
            } else if (token === 'DAI') {
              return (Number(amount) / Number(rates.DAI)).toFixed(6);
            }

            return null; // Handle the case where token is not ETH, USDC, or DAI
          })();

          // save transaction
          const transaction = await this.TransactionModel.create({
            chat_id: msg.chat.id,
            token: matchBuyAirtime.token,
            airtimeAmount: matchBuyAirtime.amount,
            amount: rateAmount,
            sender:
              user?.WalletType === 'SMART'
                ? user?.smartWalletAddress
                : user!.walletAddress,
            airtimeDataNumber: matchBuyAirtime.phoneNumber,
            type: 'AIRTIME',
            ownerApproved: false,
          });
          if (transaction) {
            return await this.buyAirtimeWalletPinPrompt(
              msg.chat.id,
              transaction,
            );
          }
        }
      } catch (error) {
        console.error(error);

        return await this.egoBloxBot.sendMessage(
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
    // let markdownId: string;

    // const last_name = query.from.last_name;
    // const user_Id = query.from.id;

    // function to check if query.data is a json type
    function isJSON(str) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        console.log(e);
        return false;
      }
    }

    if (isJSON(query.data)) {
      command = JSON.parse(query.data).command;
      //   markdownId = JSON.parse(query.data).eventDetailsId;
    } else {
      command = query.data;
    }

    const chatId = query.message.chat.id;
    // const userId = query.from.id;

    try {
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
      const user = await this.UserModel.findOne({ chat_id: chatId });
      let session: SessionDocument;
      switch (command) {
        case '/menu':
          await this.sendAllFeature(chatId);
          // await this.sendAllFeatureKeyboard(chatId);
          return;

        case '/walletFeatures':
          await this.sendAllWalletFeature(chatId);
          return;

        case '/createWallet':
          // check if user already have a wallet
          if (user!.walletAddress) {
            return this.sendWalletDetails(chatId, user!.walletAddress);
          }
          await this.sendSelectWalletTypeMarkup(chatId);
          return;

        case '/createSmartWallet':
          // check if user already have a wallet
          if (user!.walletAddress && user?.WalletType === 'SMART') {
            return this.sendWalletDetails(
              chatId,
              user!.smartWalletAddress,
              'SMART',
            );
          } else if (user?.WalletType === 'NORMAL' && user.walletAddress) {
            await this.egoBloxBot.sendMessage(
              query.message.chat.id,
              `Your already have a wallet linked`,
            );
            return this.sendWalletDetails(chatId, user!.walletAddress);
          }
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            createSmartWallet: true,
          });
          if (session) {
            await this.promptWalletPin(chatId, 'create');
            return;
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/createNormalWallet':
          // check if user already have a wallet
          if (user!.walletAddress && user?.WalletType === 'NORMAL') {
            return this.sendWalletDetails(chatId, user!.walletAddress);
          } else if (user?.WalletType === 'SMART' && user.smartWalletAddress) {
            await this.egoBloxBot.sendMessage(
              query.message.chat.id,
              `Your already have a smart account linked`,
            );
            return this.sendWalletDetails(
              chatId,
              user!.smartWalletAddress,
              'SMART',
            );
          }
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            createWallet: true,
          });
          if (session) {
            await this.promptWalletPin(chatId, 'create');
            return;
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/linkWallet':
          // check if user already have a wallet
          if (user!.walletAddress) {
            await this.egoBloxBot.sendMessage(
              query.message.chat.id,
              `‼️ You already have a wallet\n\nto link a new, make sure to export and secure you old wallet and then click on the reset wallet button`,
            );
            return this.sendWalletDetails(chatId, user!.walletAddress);
          }
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            importWallet: true,
          });
          if (session) {
            await this.promptWalletPrivateKEY(chatId);
            return;
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/fundWallet':
          if (user?.walletAddress || user?.smartWalletAddress) {
            switch (user?.WalletType) {
              case 'SMART':
                return await this.egoBloxBot.sendMessage(
                  chatId,
                  `Your Smart Address:\n<b><code>${user?.smartWalletAddress}</code></b>\n\n send token to your address above `,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [
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
                    },
                  },
                );
              case 'NORMAL':
                return await this.egoBloxBot.sendMessage(
                  chatId,
                  `Your Address:\n<b><code>${user?.walletAddress}</code></b>\n\n send token to your address above `,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [
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
                    },
                  },
                );

              default:
                return await this.egoBloxBot.sendMessage(
                  chatId,
                  'You dont have any wallet Address to fund',
                );
            }
          }

        case '/bills':
          return this.sendBillsMarkup(chatId);

        case '/sendToken':
          return this.promptSendToken(chatId);

        case '/airtime':
          return this.promptBuyAirtime(chatId);

        case '/checkBalance':
          return this.showBalance(chatId);

        case '/exportWallet':
          return this.showExportWalletWarning(chatId);

        case '/confirmExportWallet':
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            exportWallet: true,
          });
          if (session) {
            return this.walletPinPrompt(chatId);
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        case '/resetWallet':
          return this.showResetWalletWarning(chatId);

        case '/confirmReset':
          // delete any existing session if any
          await this.SessionModel.deleteMany({ chat_id: chatId });
          // create a new session
          session = await this.SessionModel.create({
            chat_id: chatId,
            resetWallet: true,
          });
          if (session) {
            return this.walletPinPrompt(chatId);
          }
          return await this.egoBloxBot.sendMessage(
            query.message.chat.id,
            `Processing command failed, please try again`,
          );

        //   close opened markup and delete session
        case '/closeDelete':
          await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
          await this.SessionModel.deleteMany({
            chat_id: chatId,
          });
          return await this.egoBloxBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        case '/close':
          await this.egoBloxBot.sendChatAction(query.message.chat.id, 'typing');
          return await this.egoBloxBot.deleteMessage(
            query.message.chat.id,
            query.message.message_id,
          );

        default:
          return await this.egoBloxBot.sendMessage(
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
        await this.egoBloxBot.sendMessage(chatId, allFeatures.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendAllFeatureKeyboard = async (chatId: any) => {
    try {
      // Define the one-time keyboard layout
      const options: TelegramBot.SendMessageOptions = {
        parse_mode: 'HTML',
        reply_markup: {
          keyboard: [
            [{ text: 'Wallet 💳' }, { text: 'Bills 💡' }],
            [{ text: 'Send token 💸' }],
          ],
          one_time_keyboard: true, // Keyboard will disappear after one use
          resize_keyboard: true, // Resizes keyboard to fit screen
        },
      };
      await this.egoBloxBot.sendMessage(chatId, 'Menu', options);
    } catch (error) {
      console.log(error);
    }
  };

  sendBillsMarkup = async (chatId: any) => {
    try {
      const allBills = await showBillsMarkup();
      if (allBills) {
        const replyMarkup = {
          inline_keyboard: allBills.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, allBills.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendAllWalletFeature = async (chatId: any) => {
    try {
      const allWalletFeatures = await walletFeaturesMarkup();
      if (allWalletFeatures) {
        const replyMarkup = {
          inline_keyboard: allWalletFeatures.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, allWalletFeatures.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendSelectWalletTypeMarkup = async (chatId: any) => {
    try {
      const walletType = await selectWalletTypeMarkup();
      if (walletType) {
        const replyMarkup = {
          inline_keyboard: walletType.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, walletType.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptWalletPin = async (chatId: TelegramBot.ChatId, context?: string) => {
    try {
      if (context === 'create') {
        const pinPromptId = await this.egoBloxBot.sendMessage(
          chatId,
          'Please enter a 4 digit pin for your wallet transactions ‼️ please remember this pin ‼️',
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );
        await this.SessionModel.updateOne(
          { chat_id: chatId },
          {
            walletPinPromptInput: true,
            $push: { walletPinPromptInputId: pinPromptId.message_id },
          },
        );
      } else if (context === 'import') {
        const pinPromptId = await this.egoBloxBot.sendMessage(
          chatId,
          'Please enter a 4 digit pin for your wallet transactions ‼️ please remember this pin ‼️',
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );
        await this.SessionModel.deleteMany({ chat_id: chatId });
        await this.SessionModel.create({
          chat_id: chatId,
          importWallet: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [pinPromptId.message_id],
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptWalletPrivateKEY = async (chatId: TelegramBot.ChatId) => {
    try {
      const privateKeyPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter wallet's private key`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (privateKeyPromptId) {
        await this.SessionModel.updateOne(
          { chat_id: chatId },
          {
            importWalletPromptInput: true,
            $push: { importWalletPromptInputId: privateKeyPromptId.message_id },
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  promptSendToken = async (chatId: TelegramBot.ChatId) => {
    try {
      await this.egoBloxBot.sendMessage(
        chatId,
        `to send token use this format:\n/send amount token address or basename or telegram Username\n e.g:\n\n/send 0.5 ETH ekete.base.eth\n/send 0.5 ETH @eketeUg\n/send 0.5 ETH 0x2189878C4963B84Fd737640db71D7650214c4A18`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
          },
        },
      );
    } catch (error) {
      console.log(error);
    }
  };

  promptBuyAirtime = async (chatId: TelegramBot.ChatId) => {
    try {
      await this.egoBloxBot.sendMessage(
        chatId,
        `to buy airtime use this format:\n/airtime amount phone_number token(token you want to use and buy the airtime)\n e.g:\n\n/airtime 100 07064350087 ETH`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            force_reply: true,
          },
        },
      );
    } catch (error) {
      console.log(error);
    }
  };

  sendWalletDetails = async (
    ChatId: TelegramBot.ChatId,
    walletAddress: string,
    type?: string,
  ) => {
    await this.egoBloxBot.sendChatAction(ChatId, 'typing');
    try {
      const walletDetails = await wallerDetailsMarkup(walletAddress, type);
      if (wallerDetailsMarkup!) {
        const replyMarkup = {
          inline_keyboard: walletDetails.keyboard,
        };
        // delete createwallet session
        await this.SessionModel.deleteMany({ chat_id: ChatId });
        return await this.egoBloxBot.sendMessage(
          ChatId,
          walletDetails.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  showBalance = async (chatId: TelegramBot.ChatId) => {
    try {
      const user = await this.UserModel.findOne({ chat_id: chatId });
      if (!user?.smartWalletAddress && !user?.walletAddress) {
        return this.egoBloxBot.sendMessage(
          chatId,
          `You don't have a wallet connected`,
        );
      }

      let ethBalance;
      let usdcBalance;
      let daiBalance;
      switch (user?.WalletType) {
        case 'NORMAL':
          ethBalance = await this.walletService.getEthBalance(
            user!.walletAddress,
          );
          usdcBalance = await this.walletService.getERC20Balance(
            user!.walletAddress,
            process.env.USDC_ADDRESS!,
          );
          daiBalance = await this.walletService.getERC20Balance(
            user!.walletAddress,
            process.env.DAI_ADDRESS!,
          );
          break;

        case 'SMART':
          ethBalance = await this.walletService.getEthBalance(
            user!.smartWalletAddress,
          );
          usdcBalance = await this.walletService.getERC20Balance(
            user!.smartWalletAddress,
            process.env.USDC_ADDRESS!,
          );
          daiBalance = await this.walletService.getERC20Balance(
            user!.smartWalletAddress,
            process.env.DAI_ADDRESS!,
          );
          break;

        default:
          break;
      }

      const showBalance = await showBalanceMarkup(
        ethBalance.balance,
        usdcBalance.balance,
        daiBalance.balance,
      );
      if (showBalance) {
        const replyMarkup = { inline_keyboard: showBalance.keyboard };

        return await this.egoBloxBot.sendMessage(chatId, showBalance.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  showExportWalletWarning = async (chatId: TelegramBot.ChatId) => {
    try {
      const showExportWarning = await exportWalletWarningMarkup();
      if (showExportWarning) {
        const replyMarkup = { inline_keyboard: showExportWarning.keyboard };

        return await this.egoBloxBot.sendMessage(
          chatId,
          showExportWarning.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  displayWalletPrivateKey = async (
    chatId: TelegramBot.ChatId,
    privateKey: string,
  ) => {
    try {
      const displayPrivateKey = await displayPrivateKeyMarkup(privateKey);
      if (displayPrivateKey) {
        const replyMarkup = { inline_keyboard: displayPrivateKey.keyboard };

        const sendPrivateKey = await this.egoBloxBot.sendMessage(
          chatId,
          displayPrivateKey.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
        if (sendPrivateKey) {
          // Delay the message deletion by 1 minute
          setTimeout(async () => {
            try {
              // Delete the message after 1 minute
              await this.egoBloxBot.deleteMessage(
                chatId,
                sendPrivateKey.message_id,
              );
            } catch (error) {
              console.error('Error deleting message:', error);
            }
          }, 60000);
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  walletPinPrompt = async (chatId: TelegramBot.ChatId) => {
    try {
      const session = await this.SessionModel.findOne({ chat_id: chatId });
      const walletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (walletPinPromptId) {
        if (session) {
          await this.SessionModel.updateOne(
            { chat_id: chatId },
            {
              walletPinPromptInput: true,
              $push: { walletPinPromptInputId: walletPinPromptId.message_id },
            },
          );
        }
        await this.SessionModel.create({
          chat_id: chatId,
          walletPinPromptInput: true,
          walletPinPromptInputId: [walletPinPromptId.message_id],
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendTokenWalletPinPrompt = async (
    chatId: TelegramBot.ChatId,
    transaction?: TransactionDocument,
  ) => {
    try {
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction!.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        process.env.USDC_ADDRESS!,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        process.env.DAI_ADDRESS!,
      );
      if (
        transaction!.token === 'ETH' &&
        ethBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient ETH balance\nBalance: ${ethBalance.balance} ETH`,
        );
      } else if (
        transaction!.token === 'USDC' &&
        usdcBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient USDC balance\nBalance: ${usdcBalance.balance} USDC`,
        );
      } else if (
        transaction!.token === 'DAI' &&
        daiBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient DAI balance\nBalance: ${daiBalance.balance} DAI`,
        );
      }

      const sendTokenWalletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (sendTokenWalletPinPromptId) {
        await this.SessionModel.deleteMany({ chat_id: chatId });

        await this.SessionModel.create({
          chat_id: chatId,
          sendToken: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [sendTokenWalletPinPromptId.message_id],
          transactionId: transaction!._id,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  buyAirtimeWalletPinPrompt = async (
    chatId: TelegramBot.ChatId,
    transaction?: TransactionDocument,
  ) => {
    try {
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction!.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        process.env.USDC_ADDRESS!,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        process.env.DAI_ADDRESS!,
      );
      if (
        transaction!.token === 'ETH' &&
        ethBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient ETH balance\nBalance: ${ethBalance.balance} ETH\n\nAirtime amount: ${transaction!.airtimeAmount}\nETH amount: ${transaction!.amount} ETH`,
        );
      } else if (
        transaction!.token === 'USDC' &&
        usdcBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient USDC balance\nBalance: ${usdcBalance.balance} USDC\n\nAirtime amount: ${transaction!.airtimeAmount}\nUSDC amount: ${transaction!.amount} USDC`,
        );
      } else if (
        transaction!.token === 'DAI' &&
        daiBalance.balance < +transaction!.amount
      ) {
        return await this.egoBloxBot.sendMessage(
          chatId,
          `Insufficient DAI balance\nBalance: ${daiBalance.balance} DAI\n\nAirtime amount: ${transaction!.airtimeAmount}\nDAI amount: ${transaction!.amount} DAI`,
        );
      }

      const buyAirtimWalletPinPromptId = await this.egoBloxBot.sendMessage(
        chatId,
        `Please enter your wallet pin`,
        {
          reply_markup: {
            force_reply: true,
          },
        },
      );
      if (buyAirtimWalletPinPromptId) {
        await this.SessionModel.deleteMany({ chat_id: chatId });

        await this.SessionModel.create({
          chat_id: chatId,
          airtime: true,
          walletPinPromptInput: true,
          walletPinPromptInputId: [buyAirtimWalletPinPromptId.message_id],
          transactionId: transaction!._id,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  showResetWalletWarning = async (chatId: TelegramBot.ChatId) => {
    try {
      const showResetWarning = await resetWalletWarningMarkup();
      if (showResetWarning) {
        const replyMarkup = { inline_keyboard: showResetWarning.keyboard };

        return await this.egoBloxBot.sendMessage(
          chatId,
          showResetWarning.message,
          {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          },
        );
      }
    } catch (error) {
      console.log(error);
    }
  };

  sendTransactionReceipt = async (
    chatId: any,
    transactionReceipt: any,
    description?: any,
  ) => {
    try {
      const receipt = await transactionReceiptMarkup(
        transactionReceipt,
        description,
      );
      if (receipt) {
        const replyMarkup = {
          inline_keyboard: receipt.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, receipt.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  notifyReceiver = async (
    chatId: any,
    transactionReceipt: any,
    description?: any,
  ) => {
    try {
      const receipt = await notifyReceiverMarkup(
        transactionReceipt,
        description,
      );
      if (receipt) {
        const replyMarkup = {
          inline_keyboard: receipt.keyboard,
        };
        await this.egoBloxBot.sendMessage(chatId, receipt.message, {
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      }
    } catch (error) {
      console.log(error);
    }
  };

  // utitlity functions
  isPrivateKey = async (input: string, chatId: number): Promise<boolean> => {
    const latestSession = await this.SessionModel.findOne({ chat_id: chatId });
    const trimmedInput = input.trim();
    const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
    if (privateKeyRegex.test(trimmedInput)) {
      return true;
    } else if (latestSession) {
      if (latestSession!.importWallet) {
        this.egoBloxBot.sendMessage(chatId, 'Invalid Private KEY');
      }

      const promises: any[] = [];
      // loop through  import privateKey prompt to delete them
      for (let i = 0; i < latestSession.importWalletPromptInputId.length; i++) {
        try {
          promises.push(
            await this.egoBloxBot.deleteMessage(
              chatId,
              latestSession!.importWalletPromptInputId[i],
            ),
          );
        } catch (error) {
          console.log(error);
        }
      }
      // loop through to delet all userReply
      for (let i = 0; i < latestSession.userInputId.length; i++) {
        try {
          promises.push(
            await this.egoBloxBot.deleteMessage(
              chatId,
              latestSession.userInputId[i],
            ),
          );
        } catch (error) {
          console.log(error);
        }
      }
      return false;
    }
    return false;
  };
}
