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

  getAction = async (eventId: string) => {
    try {
      console.log(baseURL);
      const eventTicket = await this.database.event.findFirst({
        where: { id: +eventId },
      });

      if (eventTicket) {
        const payload: ActionGetResponse = {
          icon: eventTicket?.media
            ? await new URL(`${baseURL}/bot/${eventTicket.media}`).toString()
            : `https://i.ibb.co/PxqQCTQ/eventblinkbot-high-resolution-logo.jpg`,
          title: eventTicket.eventName,
          description: eventTicket.description,
          label: `Buy Ticket  (${eventTicket.price} SOL)`,
          disabled: true,
          links: {
            actions: [
              {
                href: '/api/actions/donate?amount={amount}',
                label: `Buy Ticket  (${eventTicket.price ? eventTicket.price : 0} SOL)`, // button text
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
}
