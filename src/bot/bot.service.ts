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
import { User, UserDocument } from 'src/database/schemas/user.schema';
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
const USDC_ADDRESS =
  process.env.ENVIRONMENT === 'TESTNET'
    ? process.env.USDC_ADDRESS_TESTNET
    : process.env.USDC_ADDRESS;

const DAI_ADDRESS =
  process.env.ENVIRONMENT === 'TESTNET'
    ? process.env.DAI_ADDRESS_TESTNET
    : process.env.DAI_ADDRESS;

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

      // Run user and session queries concurrently to save time
      const [session, user] = await Promise.all([
        this.SessionModel.findOne({ chat_id: msg.chat.id }),
        this.UserModel.findOne({ chat_id: msg.chat.id }),
      ]);

      // Handle text inputs if not a command
      if (msg.text !== '/start' && msg.text !== '/menu') {
        return this.handleUserTextInputs(msg, session!, user!);
      }

      const command = msg.text!;
      console.log('Command :', command);

      // Handle /start command
      if (command === '/start') {
        if (session) {
          await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
        }

        const username = msg.from.username;
        if (!user) {
          // Save user
          await this.UserModel.create({
            chat_id: msg.chat.id,
            username,
          });
        }

        const welcome = await welcomeMessageMarkup(username);
        if (welcome) {
          const replyMarkup = { inline_keyboard: welcome.keyboard };
          await this.egoBloxBot.sendMessage(msg.chat.id, welcome.message, {
            reply_markup: replyMarkup,
          });
        }
        return;
      }

      // Handle /menu command
      if (command === '/menu') {
        const allFeatures = await allFeaturesMarkup();
        if (allFeatures) {
          const replyMarkup = { inline_keyboard: allFeatures.keyboard };
          await this.egoBloxBot.sendMessage(msg.chat.id, allFeatures.message, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          });
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
    user?: UserDocument,
  ) => {
    await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
    try {
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

      // detect send token command & detect buy airtime command
      const [matchedSend, matchBuyAirtime] = await Promise.all([
        detectSendToken(msg.text!.trim()),
        detectAirtime(msg.text!.trim()),
      ]);
      console.log('Matchedsend', matchedSend);
      console.log('Matchedairtime', matchBuyAirtime);

      // parse incoming message and handle commands
      try {
        // handle smart account wallet creation
        if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.createSmartWallet
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            const [hashedPin, newWallet] = await Promise.all([
              bcrypt.hash(pin, this.saltRounds),
              this.walletService.createWallet(),
            ]);
            const smartAccount =
              await this.contractInteractionService.getAccount(
                `${newWallet.privateKey}` as `0x${string}`,
              );

            // Encrypt wallet details concurrently
            const [encryptedWalletDetails, defaultEncryptedWalletDetails] =
              await Promise.all([
                this.walletService.encryptWallet(pin, newWallet.privateKey),
                this.walletService.encryptWallet(
                  process.env.DEFAULT_WALLET_PIN!,
                  newWallet.privateKey,
                ),
              ]);

            // Save user wallet details
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

            // Fetch session
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });

            // Combine message deletion operations into one Promise.all
            const deleteMessagesPromises = [
              ...latestSession!.walletPinPromptInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
              ...latestSession!.userInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
            ];

            // Delete all messages concurrently
            await Promise.all(deleteMessagesPromises);

            // Send wallet details to the user
            await this.sendWalletDetails(
              msg.chat.id,
              smartAccount.address,
              'SMART',
            );
          } catch (error) {
            console.error(error);
          }
        } // handle normal wallet creation
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.createWallet
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            // Concurrent hashing and wallet creation
            const [hashedPin, newWallet] = await Promise.all([
              bcrypt.hash(pin, this.saltRounds),
              this.walletService.createWallet(),
            ]);

            // Encrypt wallet details concurrently
            const [encryptedWalletDetails, defaultEncryptedWalletDetails] =
              await Promise.all([
                this.walletService.encryptWallet(pin, newWallet.privateKey),
                this.walletService.encryptWallet(
                  process.env.DEFAULT_WALLET_PIN!,
                  newWallet.privateKey,
                ),
              ]);

            // Save user wallet details
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

            // Fetch session once
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });

            // Combine message deletion into a single Promise.all
            const deleteMessagesPromises = [
              ...latestSession!.walletPinPromptInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
              ...latestSession!.userInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
            ];

            // Execute all message deletions concurrently
            await Promise.all(deleteMessagesPromises);

            // Send wallet details to the user
            await this.sendWalletDetails(msg.chat.id, newWallet.address);
          } catch (error) {
            console.error(error);
          }
        } // wallet import pin
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.importWallet
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            const hashedPin = await bcrypt.hash(pin, this.saltRounds);
            if (user!.walletAddress && user!.defaultWalletDetails) {
              // Concurrently decrypt the wallet and encrypt with new pin
              const decryptedWallet = await this.walletService.decryptWallet(
                process.env.DEFAULT_WALLET_PIN!,
                user!.defaultWalletDetails,
              );

              const encryptedWalletDetails =
                await this.walletService.encryptWallet(
                  pin,
                  decryptedWallet.privateKey,
                );

              // Save user wallet details
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

            // Fetch session once
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });

            // Combine message deletion into one Promise.all
            const deleteMessagesPromises = [
              ...latestSession!.walletPinPromptInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
              ...latestSession!.userInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
            ];

            // Delete all messages concurrently
            await Promise.all(deleteMessagesPromises);

            // Delete user session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } catch (error) {
            console.error(error);
          }
        } // wallet export
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.exportWallet
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            // Compare hashed pin
            const pinMatch = await bcrypt.compare(pin, user!.pin);

            // Decrypt wallet if the pin is correct
            if (pinMatch && user!.walletAddress && user!.walletDetails) {
              const decryptedWallet = await this.walletService.decryptWallet(
                pin,
                user!.walletDetails,
              );

              if (decryptedWallet.privateKey) {
                // Fetch session once
                const latestSession = await this.SessionModel.findOne({
                  chat_id: msg.chat.id,
                });

                // Combine deletion operations into a single Promise.all
                const deleteMessagesPromises = [
                  ...latestSession!.walletPinPromptInputId.map((id) =>
                    this.egoBloxBot.deleteMessage(msg.chat.id, id),
                  ),
                  ...latestSession!.userInputId.map((id) =>
                    this.egoBloxBot.deleteMessage(msg.chat.id, id),
                  ),
                ];

                // Execute all deletions concurrently
                await Promise.all(deleteMessagesPromises);

                // Display the decrypted private key to the user
                await this.displayWalletPrivateKey(
                  msg.chat.id,
                  decryptedWallet.privateKey,
                );

                console.log(
                  'Decrypted wallet private key:',
                  decryptedWallet.privateKey,
                  'Wallet address:',
                  user!.walletAddress,
                );
              }

              // Delete the session after operations
              await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
            } else {
              await this.egoBloxBot.sendMessage(
                msg.chat.id,
                `Processing command failed, Invalid pin`,
              );
            }
          } catch (error) {
            console.error('Error exporting wallet:', error);
            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'An error occurred while exporting the wallet. Please try again later.',
            );
          }
        } // reset wallet
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.resetWallet
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            // Ensure the user exists
            if (!user) {
              return await this.egoBloxBot.sendMessage(
                msg.chat.id,
                'User not found. Please try again.',
              );
            }

            // Compare hashed pin
            const pinMatch = await bcrypt.compare(pin, user.pin);

            // Delete wallet if pin is correct
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

              // Fetch the latest session once
              const latestSession = await this.SessionModel.findOne({
                chat_id: msg.chat.id,
              });

              if (!latestSession) {
                return await this.egoBloxBot.sendMessage(
                  msg.chat.id,
                  'Session not found. Please try again later.',
                );
              }

              // Combine deletion operations into a single Promise.all
              const deleteMessagesPromises = [
                ...latestSession.walletPinPromptInputId.map((id) =>
                  this.egoBloxBot.deleteMessage(msg.chat.id, id),
                ),
                ...latestSession.userInputId.map((id) =>
                  this.egoBloxBot.deleteMessage(msg.chat.id, id),
                ),
              ];

              // Execute all deletions concurrently
              await Promise.all(deleteMessagesPromises);

              // Confirm deletion of the wallet
              await this.egoBloxBot.sendMessage(
                msg.chat.id,
                'Wallet deleted successfully',
              );

              // Delete the session after operations
              await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
            } else {
              await this.egoBloxBot.sendMessage(
                msg.chat.id,
                'Invalid pin. Please try again.',
              );
            }
          } catch (error) {
            console.error('Error resetting wallet:', error);
            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'An error occurred while resetting the wallet. Please try again later.',
            );
          }
        } // handle send token
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.sendToken
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            // compare hashed pin
            const pinMatch = await bcrypt.compare(pin, user!.pin);

            if (!pinMatch) {
              return await this.egoBloxBot.sendMessage(
                msg.chat.id,
                `Processing command failed, Invalid pin`,
              );
            }

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

            const executeTransaction = async (
              transferFn: () => Promise<any>,
              smart = false,
            ) => {
              txn = await transferFn();
              if (smart) {
                await this.TransactionModel.updateOne(
                  { _id: transaction!._id },
                  {
                    userOpHash: txn.userOpHash,
                    status: txn.success ? 'successful' : 'failed',
                    ownerApproved: true,
                    hash: txn.receipt.transactionHash,
                  },
                );
              } else {
                receipt = await txn.wait();
                await this.TransactionModel.updateOne(
                  { _id: transaction!._id },
                  {
                    status: receipt.status === 0 ? 'failed' : 'successful',
                    ownerApproved: true,
                    hash: receipt.transactionHash,
                  },
                );
              }
            };

            switch (transaction!.token) {
              case 'ETH':
                if (user?.WalletType === 'SMART') {
                  await executeTransaction(
                    () =>
                      this.contractInteractionService.executeEthTransferTransaction(
                        walletDetail.privateKey as `0x${string}`,
                        transaction!.receiverAddress as `0x${string}`,
                        Number(transaction!.amount),
                      ),
                    true,
                  );
                } else {
                  await executeTransaction(() =>
                    this.walletService.transferEth(
                      walletDetail.privateKey,
                      transaction!.receiverAddress,
                      Number(transaction!.amount),
                    ),
                  );
                }
                break;

              case 'USDC':
                if (user?.WalletType === 'SMART') {
                  await executeTransaction(
                    () =>
                      this.contractInteractionService.executeTransferErc20Transaction(
                        walletDetail.privateKey as `0x${string}`,
                        USDC_ADDRESS as `0x${string}`,
                        transaction!.receiverAddress as `0x${string}`,
                        Number(transaction!.amount),
                        6,
                      ),
                    true,
                  );
                } else {
                  await executeTransaction(() =>
                    this.walletService.transferUSDC(
                      walletDetail.privateKey,
                      transaction!.receiverAddress,
                      Number(transaction!.amount),
                    ),
                  );
                }
                break;

              case 'DAI':
                if (user?.WalletType === 'SMART') {
                  await executeTransaction(
                    () =>
                      this.contractInteractionService.executeTransferErc20Transaction(
                        walletDetail.privateKey as `0x${string}`,
                        DAI_ADDRESS as `0x${string}`,
                        transaction!.receiverAddress as `0x${string}`,
                        Number(transaction!.amount),
                        6,
                      ),
                    true,
                  );
                } else {
                  await executeTransaction(() =>
                    this.walletService.transferDAI(
                      walletDetail.privateKey,
                      transaction!.receiverAddress,
                      Number(transaction!.amount),
                    ),
                  );
                }
                break;

              default:
                break;
            }

            const notifyAndSendReceipt = async (
              status: boolean,
              hash: string,
            ) => {
              const statusFlag = status ? 1 : 0;
              await this.sendTransactionReceipt(
                msg.chat.id,
                { transactionHash: hash, status: statusFlag },
                `Transfer of ${transaction!.amount} ${transaction!.token} to ${transaction!.receiver}`,
              );
              if (transaction?.receiverChatId) {
                await this.notifyReceiver(
                  transaction.receiverChatId,
                  { transactionHash: hash, status: statusFlag },
                  `Received ${transaction!.amount} ${transaction!.token} from @${user?.username}`,
                );
              }
            };

            // Notify and send receipt for ETH
            if (user?.WalletType === 'SMART') {
              await notifyAndSendReceipt(
                txn.success,
                txn.receipt.transactionHash,
              );
            } else {
              await notifyAndSendReceipt(
                receipt.status === 1,
                receipt.transactionHash,
              );
            }

            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });
            const deleteMessages = async (messageIds: number[]) => {
              for (const id of messageIds) {
                try {
                  await this.egoBloxBot.deleteMessage(msg.chat.id, id);
                } catch (error) {
                  console.log(error);
                }
              }
            };

            // Delete all messages related to PIN prompts and user inputs
            await Promise.all([
              deleteMessages(latestSession!.walletPinPromptInputId),
              deleteMessages(latestSession!.userInputId),
              this.SessionModel.deleteMany({ chat_id: msg.chat.id }),
            ]);
          } catch (error) {
            console.error(`Transaction error: ${error.message}`);
            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              `Transaction failed due to an error. Please try again later.`,
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
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pinMatch = await bcrypt.compare(pin, user!.pin);

            if (pinMatch) {
              // DECRYPT WALLET
              const walletDetail = await this.walletService.decryptWallet(
                pin,
                user!.walletDetails,
              );
              const transaction = await this.TransactionModel.findOne({
                _id: session!.transactionId,
              });
              let txn: any;
              let receipt: any;

              const handleAirtimePurchase = async (
                network: string,
                transactionHash: string,
              ) => {
                const airtime = await this.billsService.buyAirtime(
                  `${transaction!.airtimeDataNumber}`,
                  `${transaction!.airtimeAmount}`,
                );
                if (airtime) {
                  await this.TransactionModel.updateOne(
                    { _id: transaction!._id },
                    {
                      flutterWave_status: airtime.status,
                      flutterWave_reference: airtime.data.reference,
                      flutterWave_tx_ref: airtime.data.tx_ref,
                      flutterWave_bill_Network: airtime.data.network,
                    },
                  );

                  if (process.env.ENVIRONMENT === 'TESTNET') {
                    await this.UserModel.updateOne(
                      { chat_id: msg.chat.id },
                      { testnetAirtimeBonus: true },
                    );
                  }
                  console.log('Airtime purchased:', airtime);
                }
                await this.TransactionModel.updateOne(
                  { _id: transaction!._id },
                  {
                    status: 'successful',
                    ownerApproved: true,
                    hash: transactionHash,
                  },
                );
                await this.sendTransactionReceipt(
                  msg.chat.id,
                  { transactionHash, status: 1 },
                  `₦${transaction!.airtimeAmount} Airtime purchase for ${transaction!.airtimeDataNumber}`,
                );
              };

              switch (transaction!.token) {
                case 'ETH':
                  if (user?.WalletType === 'SMART') {
                    txn =
                      await this.contractInteractionService.executeEthTransferTransaction(
                        walletDetail.privateKey as `0x${string}`,
                        process.env.ADMIN_WALLET as `0x${string}`,
                        Number(transaction!.amount),
                      );
                    if (txn.success)
                      await handleAirtimePurchase(
                        'ETH',
                        txn.receipt.transactionHash,
                      );
                  } else {
                    txn = await this.walletService.transferEth(
                      walletDetail.privateKey,
                      process.env.ADMIN_WALLET!,
                      Number(transaction!.amount),
                    );
                    receipt = await txn.wait();
                    if (receipt.status === 1)
                      await handleAirtimePurchase(
                        'ETH',
                        receipt.transactionHash,
                      );
                  }
                  break;

                case 'USDC':
                  if (user?.WalletType === 'SMART') {
                    txn =
                      await this.contractInteractionService.executeTransferErc20Transaction(
                        walletDetail.privateKey as `0x${string}`,
                        USDC_ADDRESS as `0x${string}`,
                        process.env.ADMIN_WALLET as `0x${string}`,
                        Number(transaction!.amount),
                        6,
                      );
                    if (txn.success)
                      await handleAirtimePurchase(
                        'USDC',
                        txn.receipt.transactionHash,
                      );
                  } else {
                    txn = await this.walletService.transferUSDC(
                      walletDetail.privateKey,
                      process.env.ADMIN_WALLET!,
                      Number(transaction!.amount),
                    );
                    receipt = await txn.wait();
                    if (receipt.status === 1)
                      await handleAirtimePurchase(
                        'USDC',
                        receipt.transactionHash,
                      );
                  }
                  break;

                case 'DAI':
                  if (user?.WalletType === 'SMART') {
                    txn =
                      await this.contractInteractionService.executeTransferErc20Transaction(
                        walletDetail.privateKey as `0x${string}`,
                        DAI_ADDRESS as `0x${string}`,
                        process.env.ADMIN_WALLET as `0x${string}`,
                        Number(transaction!.amount),
                        6,
                      );
                    if (txn.success)
                      await handleAirtimePurchase(
                        'DAI',
                        txn.receipt.transactionHash,
                      );
                  } else {
                    txn = await this.walletService.transferDAI(
                      walletDetail.privateKey,
                      process.env.ADMIN_WALLET!,
                      Number(transaction!.amount),
                    );
                    receipt = await txn.wait();
                    if (receipt.status === 1)
                      await handleAirtimePurchase(
                        'DAI',
                        receipt.transactionHash,
                      );
                  }
                  break;

                default:
                  throw new Error('Invalid token type');
              }

              // Clean up wallet prompt inputs
              const latestSession = await this.SessionModel.findOne({
                chat_id: msg.chat.id,
              });
              const deleteMessages = [
                ...latestSession!.walletPinPromptInputId,
                ...latestSession!.userInputId,
              ].map(async (id) => {
                try {
                  await this.egoBloxBot.deleteMessage(msg.chat.id, id);
                } catch (error) {
                  console.log(`Failed to delete message: ${id}`, error);
                }
              });
              await Promise.all(deleteMessages);
              await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
            } else {
              await this.egoBloxBot.sendMessage(
                msg.chat.id,
                'Invalid PIN. Please try again.',
              );
            }
          } catch (error) {
            console.error('Error processing airtime purchase:', error);
            await this.egoBloxBot.sendMessage(
              msg.chat.id,
              'An error occurred while processing your request. Please try again later.',
            );
          }
        }
        // handle resetPin
        else if (
          isValidPin(msg.text!.trim()) &&
          session!.walletPinPromptInput &&
          session!.resetPins
        ) {
          try {
            await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
            const pin = msg.text!.trim();
            const hashedPin = await bcrypt.hash(pin, this.saltRounds);
            if (user!.walletAddress && user!.defaultWalletDetails) {
              // Concurrently decrypt the wallet and encrypt with new pin
              const decryptedWallet = await this.walletService.decryptWallet(
                process.env.DEFAULT_WALLET_PIN!,
                user!.defaultWalletDetails,
              );

              const encryptedWalletDetails =
                await this.walletService.encryptWallet(
                  pin,
                  decryptedWallet.privateKey,
                );

              // Save user wallet details
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

            // Fetch session once
            const latestSession = await this.SessionModel.findOne({
              chat_id: msg.chat.id,
            });

            // Combine message deletion into one Promise.all
            const deleteMessagesPromises = [
              ...latestSession!.walletPinPromptInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
              ...latestSession!.userInputId.map((id) =>
                this.egoBloxBot.deleteMessage(msg.chat.id, id),
              ),
            ];

            // Delete all messages concurrently
            await Promise.all(deleteMessagesPromises);

            // Delete user session
            await this.SessionModel.deleteMany({ chat_id: msg.chat.id });
          } catch (error) {
            console.error(error);
          }
        }
        //handle import wallet private key
        else if (
          session &&
          session.importWallet &&
          session.importWalletPromptInput
        ) {
          await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
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
          await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
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
          await this.egoBloxBot.sendChatAction(msg.chat.id, 'typing');
          const rateAmount = (async () => {
            const { token, amount } = matchBuyAirtime;

            if (process.env.ENVIRONMENT === 'TESTNET') {
              const bonusUsers = await this.UserModel.find({
                testnetAirtimeBonus: true,
              });
              if (bonusUsers.length >= 50) {
                return await this.egoBloxBot.sendMessage(
                  msg.chat.id,
                  'Sorry This bonus has been exhausted',
                );
              } else if (+amount > 100) {
                // to make sure they can ONLY BUY 100 airtime with testnet
                return await this.egoBloxBot.sendMessage(
                  msg.chat.id,
                  'You can only buy 100 worth of airtime once using testnet token',
                );
              } else if (user!.testnetAirtimeBonus) {
                return await this.egoBloxBot.sendMessage(
                  msg.chat.id,
                  'You can only buy 100 worth of airtime once using testnet token\n you have exhausted you onetime purchase',
                );
              }
            }

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
            amount: await rateAmount,
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

        case '/data':
          return this.egoBloxBot.sendMessage(chatId, 'COMING SOON ⏳');

        case '/light':
          return this.egoBloxBot.sendMessage(chatId, 'COMING SOON ⏳');

        case '/checkBalance':
          return this.showBalance(chatId);

        case '/exportWallet':
          if (user!.WalletType === 'SMART') {
            return this.egoBloxBot.sendMessage(
              chatId,
              `You can't export a smart account wallet`,
            );
          }
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

        case '/resetPin':
          const oldPin = await this.UserModel.find({ chat_id: chatId });
          if (!oldPin) {
            return await this.egoBloxBot.sendMessage(
              query.message.chat.id,
              `There was no pin associated with this wallet`,
            );
          }
          return await this.promptWalletPin(chatId, 'resetPin');

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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      } else if (context === 'resetPin') {
        const pinPromptId = await this.egoBloxBot.sendMessage(
          chatId,
          'Please enter a new 4 digit pin for your wallet transactions ‼️ remember this pin ‼️',
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );
        await this.SessionModel.deleteMany({ chat_id: chatId });
        await this.SessionModel.create({
          chat_id: chatId,
          resetPins: true,
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
      if (process.env.ENVIRONMENT === 'TESTNET') {
        await this.egoBloxBot.sendMessage(
          chatId,
          `to buy airtime use this format:\n/airtime amount phone_number token(token you want to use and buy the airtime)\nNOTE: this is testnet you can only buy 100 worth of airtime once with any testnet token\n e.g:\n\n/airtime 100 07064350087 ETH`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              force_reply: true,
            },
          },
        );
      }
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
            USDC_ADDRESS!,
          );
          daiBalance = await this.walletService.getERC20Balance(
            user!.walletAddress,
            DAI_ADDRESS!,
          );
          break;

        case 'SMART':
          ethBalance = await this.walletService.getEthBalance(
            user!.smartWalletAddress,
          );
          usdcBalance = await this.walletService.getERC20Balance(
            user!.smartWalletAddress,
            USDC_ADDRESS!,
          );
          daiBalance = await this.walletService.getERC20Balance(
            user!.smartWalletAddress,
            DAI_ADDRESS!,
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction!.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        USDC_ADDRESS!,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        DAI_ADDRESS!,
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
      // check balance
      const ethBalance = await this.walletService.getEthBalance(
        transaction!.sender,
      );
      const usdcBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        USDC_ADDRESS!,
      );
      const daiBalance = await this.walletService.getERC20Balance(
        transaction!.sender,
        DAI_ADDRESS!,
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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
      await this.egoBloxBot.sendChatAction(chatId, 'typing');
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

  // Functions to handle specific transaction types
  async handleSmartWalletTransaction(transaction, walletDetail) {
    switch (transaction.token) {
      case 'ETH':
        return await this.contractInteractionService.executeEthTransferTransaction(
          walletDetail.privateKey,
          process.env.ADMIN_WALLET! as `0x${string}`,
          Number(transaction.amount),
        );
      case 'USDC':
        return await this.contractInteractionService.executeTransferErc20Transaction(
          walletDetail.privateKey,
          USDC_ADDRESS as `0x${string}`,
          process.env.ADMIN_WALLET! as `0x${string}`,
          Number(transaction.amount),
          6,
        );
      case 'DAI':
        return await this.contractInteractionService.executeTransferErc20Transaction(
          walletDetail.privateKey,
          DAI_ADDRESS as `0x${string}`,
          process.env.ADMIN_WALLET! as `0x${string}`,
          Number(transaction.amount),
          6,
        );
      default:
        throw new Error('Unsupported token type');
    }
  }

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
