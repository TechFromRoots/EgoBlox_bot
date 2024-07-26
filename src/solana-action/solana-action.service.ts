import { Injectable } from '@nestjs/common';
import {
  ACTIONS_CORS_HEADERS,
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { DatabaseService } from 'src/database/database.service';

const ADMIN_WALLET = new PublicKey(process.env.ADMIN_WALLET);
const baseURL =
  process.env.NODE_ENV === 'production'
    ? 'https://eventblink.xyz'
    : 'http://localhost:3001';

@Injectable()
export class SolanaActionService {
  constructor(private readonly database: DatabaseService) {}

  getAction = async (eventId?: string) => {
    try {
      console.log(baseURL);

      const eventTicket = await this.database.event.findFirst({
        where: { id: +eventId || 6 },
      });

      if (eventTicket) {
        const payload: ActionGetResponse = {
          icon: eventTicket?.media
            ? `${baseURL}/bot/${eventTicket.media}`
            : `https://i.ibb.co/PxqQCTQ/eventblinkbot-high-resolution-logo.jpg`,
          title: eventTicket?.eventName,
          description: eventTicket?.description,
          label: `Buy Ticket  (${eventTicket?.price} SOL)`,
          disabled: false,
          links: {
            actions: [
              {
                href: `${baseURL}/solana-action?event=${eventTicket?.id}&email={Email}&name={Name}`,
                label: `Buy Ticket  (${eventTicket?.price ? eventTicket.price : 0} SOL)`, // button text
                parameters: [
                  {
                    name: 'Name', // name template literal
                    label: 'Enter you name', // placeholder for the input
                  },
                  {
                    name: 'Email', // name template literal
                    label: 'Enter your email address', // placeholder for the input
                  },
                ],
              },
            ],
          },
        };
        return payload;
      }
    } catch (error) {
      console.log(error);
    }
  };

  postAction = async (data: any) => {
    try {
      console.log(baseURL);
      const eventTicket = await this.database.event.findFirst({
        where: { id: +data.event },
      });

      if (!eventTicket) {
        return;
      }

      const connection = new Connection(
        process.env.SOLANA_RPC! || clusterApiUrl('devnet'),
      );

      // // Ensure the receiving account will be rent exempt
      // const minimumBalance = await connection.getMinimumBalanceForRentExemption(
      //   0, // Note: simple accounts that just store native SOL have `0` bytes of data
      // );

      let ticketPrice = +eventTicket.price || 0;
      const organizerPubkey: PublicKey = new PublicKey(
        eventTicket?.walletAddress as string,
      );
      let account: PublicKey = new PublicKey(data.account);
      const transaction = new Transaction();

      // Transfer 90% of the funds to the event Organizer's address
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: account,
          toPubkey: organizerPubkey,
          lamports: Math.floor(ticketPrice * LAMPORTS_PER_SOL * 0.9),
        }),
      );

      // Transfer 10% of the funds to the default SOL address
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: account,
          toPubkey: ADMIN_WALLET,
          lamports: Math.floor(ticketPrice * LAMPORTS_PER_SOL * 0.1),
        }),
      );

      // Set the end user as the fee payer
      transaction.feePayer = account;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const payload: ActionPostResponse = {
        transaction: transaction
          .serialize({
            requireAllSignatures: false,
            verifySignatures: true,
          })
          .toString('base64'),
        message: `You've successfully purchased ${eventTicket?.eventName} tickets for ${eventTicket?.price} SOL 🎊`,
      };
      console.log('Payload:', payload);
      console.log('Transaction:', transaction);
      return payload;
    } catch (error) {
      console.log(error);
    }
  };
}
