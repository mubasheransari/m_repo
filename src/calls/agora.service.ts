import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RtcRole, RtcTokenBuilder } from 'agora-token';

export type RtcCredentials = {
  /** Agora App ID (public: the app needs it to start the engine). */
  appId: string;
  /** Agora channel to join. One fresh channel per call. */
  channel: string;
  /** This member's numeric Agora user id inside the channel. */
  uid: number;
  /** Token that allows exactly this uid into exactly this channel. */
  token: string;
  /** Seconds from now until the token stops working. For a capped (video) call that is the end of the call. */
  expiresInSeconds: number;
};

/**
 * Builds Agora RTC tokens. The App Certificate (the secret that signs tokens) lives only here, on the server.
 *
 * .env:
 *   AGORA_APP_ID=<32 character App ID from console.agora.io>
 *   AGORA_APP_CERTIFICATE=<32 character App Certificate; enable it for the project in the Agora console>
 */
@Injectable()
export class AgoraService {
  private get appId() { return (process.env.AGORA_APP_ID || '').trim(); }
  private get certificate() { return (process.env.AGORA_APP_CERTIFICATE || '').trim(); }

  /** The App ID is public by design (every phone needs it to start the engine); only the certificate is secret. */
  get publicAppId(): string { return this.appId; }

  configured(): boolean {
    return this.appId.length > 0 && this.certificate.length > 0;
  }

  /** Answers 503 (instead of crashing) when the server has no Agora keys yet. */
  assertConfigured(): void {
    if (!this.configured()) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'CALLS_NOT_CONFIGURED',
        message: 'Calling is not available right now. Please try again later.',
      });
    }
  }

  /**
   * A token valid for `ttlSeconds` from now. Agora counts this as RELATIVE seconds (agora-token 2.x), and when the join privilege
   * ends the user is removed from the channel: that is what stops a capped video call even if the phone ignores the server.
   */
  token(channel: string, uid: number, ttlSeconds: number): RtcCredentials {
    this.assertConfigured();
    const ttl = Math.max(1, Math.floor(ttlSeconds));
    const token = RtcTokenBuilder.buildTokenWithUid(this.appId, this.certificate, channel, uid, RtcRole.PUBLISHER, ttl, ttl);
    return { appId: this.appId, channel, uid, token, expiresInSeconds: ttl };
  }
}
