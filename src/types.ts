export interface Env {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  GOOGLE_CALENDAR_IDS: string;  // カンマ区切りで複数カレンダーID（例: "user1@gmail.com,user2@gmail.com"）
  ENVIRONMENT: string;
}

// Slack Slash Command payload
export interface SlackSlashCommand {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

// Slack Block Kit types
export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  response_type?: 'in_channel' | 'ephemeral';
  replace_original?: boolean;
  delete_original?: boolean;
}
