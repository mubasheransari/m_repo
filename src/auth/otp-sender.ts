import { Injectable, Logger } from '@nestjs/common';

/**
 * Replace the body of send() with a real provider:
 *  - email: Resend / SES / Nodemailer
 *  - phone: Twilio or a local Pakistani SMS gateway
 * In development the code is printed to the server console.
 */
@Injectable()
export class OtpSender {
  private readonly log = new Logger('OtpSender');
  async send(identifier: string, code: string): Promise<void> {
    this.log.warn(`[DEV] OTP for ${identifier}: ${code}`);
  }
}
