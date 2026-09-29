import { Injectable, Logger } from '@nestjs/common';
import { Notifier, NotifierPayload } from '../notification/notifier.interface';
import { Device } from './device.entity';

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: unknown;
}

export interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
}

/**
 * Notifier implementation for Expo Push API (iOS and Android devices).
 * Calls Expo Push REST API endpoint (https://exp.host/--/api/v2/push/send)
 * to dispatch notification payload to mobile devices using Expo push tokens.
 */
@Injectable()
export class ExpoPushNotifier implements Notifier<Device> {
  private readonly logger = new Logger(ExpoPushNotifier.name);
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  async send(target: Device, payload: NotifierPayload): Promise<void> {
    if (!target.pushToken || (target.platform !== 'ios' && target.platform !== 'android')) {
      return;
    }

    const response = await fetch(this.expoPushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({
        to: target.pushToken,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: {
          id: payload.id,
          deepLink: payload.deepLink,
          kind: payload.kind,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Expo push API returned status ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as ExpoPushResponse;

    if (result.errors && result.errors.length > 0) {
      const errMsg = result.errors.map((e) => e.message).join(', ');
      throw new Error(`Expo push API error: ${errMsg}`);
    }

    if (result.data) {
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (ticket && ticket.status === 'error') {
        throw new Error(`Expo push ticket error: ${ticket.message || 'Unknown error'}`);
      }
    }
  }
}
