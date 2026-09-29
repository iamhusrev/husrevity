import { Injectable, Logger } from '@nestjs/common';
import { Notifier, NotifierPayload } from '../notification/notifier.interface';
import { SlackLink } from './slack-link.entity';
import { SlackApiService } from './slack-api.service';

/**
 * Notifier implementation for Slack channel.
 * Calls SlackApiService.postMessage to dispatch notification payload
 * to a linked Slack user's DM.
 */
@Injectable()
export class SlackNotifier implements Notifier<SlackLink> {
  private readonly logger = new Logger(SlackNotifier.name);

  constructor(private readonly slackApi: SlackApiService) {}

  async send(target: SlackLink, payload: NotifierPayload): Promise<void> {
    if (!target.slackUserId || target.status !== 'linked') {
      return;
    }

    const text = payload.body
      ? `${payload.title}\n${payload.body}`
      : payload.title;

    const result = await this.slackApi.postMessage(target.slackUserId, text);

    if (!result) {
      throw new Error(
        `Slack postMessage failed for slackUserId ${target.slackUserId}`,
      );
    }
  }
}
