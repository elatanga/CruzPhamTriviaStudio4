
export type SMSType = 'DOUBLE_TROUBLE' | 'TRIPLE_THREAT' | 'SABOTAGE' | 'MEGA_STEAL';

export interface SMSArmedMove {
  type: SMSType;
  armedAt: string;
  armedBy: string;
}

export interface SMSState {
  deployments: Record<string, SMSArmedMove>; // Key: tileId
  isLive: boolean;
  lastUpdate: number;
}

export interface SMSResolution {
  points: number;
  label: string;
  isBlocked?: boolean;
}
