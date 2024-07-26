import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Texts - Download Beeper for Android</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #1977c4;
            color: rgb(0, 0, 0);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }

        .container {
            text-align: center;
        }


        .logo {
            width: 100%;
            max-width: 150px;
            height: auto;
            margin-bottom: 20px;
        }

        .download-button {
            background-color: #3b82f6;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            cursor: pointer;
            border-radius: 5px;
            text-decoration: none;
            display: inline-block;
        }

        .footer {
            margin-top: 20px;
        }

        .footer a {
            color: #3b82f6;
            text-decoration: none;
            margin: 0 10px;
        }

        @media (max-width: 600px) {
            .download-button {
                padding: 10px 20px;
                font-size: 14px;
            }
        }
    </style>
</head>

<body>
    <div class="container">
        <img src="https://i.ibb.co/PxqQCTQ/eventblinkbot-high-resolution-logo.jpg" alt="Texts Logo" class="logo">
        <h1>EventBlink Bot</h1>
        <p>Your go-to bot for creating event ticket links on solana using Blinks</p>
        <p>You can manage your events,get information about your ticket sales, attendees and also get email notification
            about your events sent to attendees</p>
        <a href="https://t.me/EventBlink_bot?start" class="download-button">Get Started</a>
        <div class="footer">
            <p>
                &copy; 2024 EventBlink Bot - All Rights Reserved.
            </p>
        </div>
    </div>
</body>

</html>`;
  }
}
