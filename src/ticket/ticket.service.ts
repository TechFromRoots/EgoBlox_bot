import { Injectable } from '@nestjs/common';
import puppeteer, { Puppeteer } from 'puppeteer';

@Injectable()
export class TicketService {
  generateTicketShot = async () => {
    try {
      // create a dynamic HTML string for the certificate
      const html = await this.ticketTemplate();
      // Use Puppeteer to generate the PNG
      // const browser = await puppeteer.launch({
      //   headless: "new",
      // });

      const browser = await puppeteer.launch({
        executablePath:
          process.env.NODE_ENV === 'production'
            ? process.env.PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
        timeout: 60000, // Set a higher timeout value
      });
      const page = await browser.newPage();

      await page.setContent(html);
      //   await page.addStyleTag({ content: css });

      // Adjust the viewport size if necessary
      await page.setViewport({ width: 1172, height: 698 });
      //{ width: 900, height: 850 }
      // {width: 1080, height: 1024}
      /*  
      take a screenshot and save it as a PNG, 
      use clip to crop the image if needed 
    */
      const screenshot = await page.screenshot();

      // close the browser
      await browser.close();

      console.log(screenshot);
      // returns the screenshot
      return screenshot;
    } catch (error) {
      console.log(error);
    }
  };

  ticketTemplate = async () => {
    try {
      const ticketHTML = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Event Ticket</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f7f7f7;
        }

        .ticket {
            background-color: white;
            border: 1px solid #ccc;
            border-radius: 5px;
            width: 600px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        .ticket h1 {
            font-size: 20px;
            margin-bottom: 10px;
        }

        .ticket p {
            margin: 5px 0;
            font-size: 16px;
        }

        .ticket .header,
        .ticket .details {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .ticket .header img {
            width: 200px;
        }

        .ticket .qr-code img {
            width: 150px;
            height: 150px;
        }

        .ticket .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 14px;
            color: #999;
        }
    </style>
</head>

<body>
    <div class="ticket">
        <div class="header">
            <h1>This is your ticket</h1>
            <!-- <img src="https://i.ibb.co/PxqQCTQ/eventblinkbot-high-resolution-logo.jpg" alt="Google Developer Groups"> -->
            <p>EventBlink Bot</p>
        </div>
        <div class="details">
            <div>
                <p><strong>Google Developer Groups - GDG Enugu</strong></p>
                <p>Google I/O Extended: Enugu Chapter</p>
                <p>Hotel Sylvia Independence Avenue, Enugu</p>
                <p><strong>JUL 13, 2024, 9:00 AM (WAT)</strong></p>
                <p><strong>ISSUED TO</strong>: Emmanuel Ekete</p>
                <p><strong>ORDER NUMBER</strong>: GOOGE241069761</p>
                <p><strong>TICKET</strong>: Google I/O Extended FREE</p>
                <p><strong>Registered</strong>: JUN 26, 2024</p>
            </div>
            <div class="qr-code">
                <img src="https://i.ibb.co/PxqQCTQ/eventblinkbot-high-resolution-logo.jpg" alt="QR Code">
            </div>
        </div>
        <div class="footer">
            &copy; 2024 EventBlink Bot - All Rights Reserved.
        </div>
    </div>
</body>

</html>`;
      return ticketHTML;
    } catch (error) {
      console.log(error);
    }
  };
}
