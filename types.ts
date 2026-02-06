

export interface Question {
  id: string;
  text: string;
  points: number;
  answer: string;
  isRevealed: boolean;
  isAnswered: boolean;
  isVoided?: boolean;
  isDoubleOrNothing?: boolean;
}

export interface Category {
  id: string;
  title: string;
  questions: Question[];
}

export type SizeScale = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface Player {
  id: string;
  name: string;
  score: number;
  color: string;
  wildcardsUsed?: number; 
  wildcardActive?: boolean; 
  stealsCount?: number; 
}

export interface GameTimer {
  duration: number; 
  endTime: number | null; 
  isRunning: boolean;
}

export interface BoardViewSettings {
  // Canonical Sizing Model
  categoryTitleScale: SizeScale;
  playerNameScale: SizeScale;
  tileScale: SizeScale;
  
  // Layout Controls
  scoreboardScale: number; // Width multiplier (0.8 - 1.4)
  tilePaddingScale: number; // Spacing multiplier (0.5 - 1.5)
  
  // Metadata
  updatedAt: string;
}

export interface PlayEvent {
  id: string;
  atIso: string;
  atMs: number;
  action: 'AWARD' | 'STEAL' | 'VOID' | 'RETURN';
  tileId: string;
  categoryIndex?: number;
  categoryName?: string;
  rowIndex?: number;
  basePoints?: number;
  effectivePoints?: number;
  attemptedPlayerId?: string;
  attemptedPlayerName?: string;
  awardedPlayerId?: string;
  awardedPlayerName?: string;
  stealerPlayerId?: string;
  stealerPlayerName?: string;
  notes?: string;
}

export type AnalyticsEventType = 
  | 'SESSION_STARTED' 
  | 'SESSION_ENDED'
  | 'TILE_OPENED'
  | 'ANSWER_REVEALED'
  | 'POINTS_AWARDED'
  | 'POINTS_STOLEN'
  | 'TILE_VOIDED'
  | 'QUESTION_RETURNED'
  | 'QUESTION_EDITED'
  | 'AI_TILE_REPLACE_START'
  | 'AI_TILE_REPLACE_APPLIED'
  | 'AI_TILE_REPLACE_FAILED'
  | 'AI_CATEGORY_REPLACE_START'
  | 'AI_CATEGORY_REPLACE_APPLIED'
  | 'AI_CATEGORY_REPLACE_FAILED'
  | 'AI_BOARD_REGEN_START'
  | 'AI_BOARD_REGEN_APPLIED'
  | 'AI_BOARD_REGEN_FAILED'
  | 'PLAYER_ADDED'
  | 'PLAYER_REMOVED'
  | 'PLAYER_EDITED'
  | 'PLAYER_SELECTED'
  | 'SCORE_ADJUSTED'
  | 'WILDCARD_USED'
  | 'WILDCARD_RESET'
  | 'TIMER_CONFIG_CHANGED'
  | 'TIMER_STARTED'
  | 'TIMER_STOPPED'
  | 'TIMER_RESET'
  | 'TIMER_FINISHED'
  | 'VIEW_SETTINGS_CHANGED'
  | 'CATEGORY_RENAMED';

export interface GameAnalyticsEvent {
  id: string;
  ts: number;
  iso: string;
  type: AnalyticsEventType;
  actor?: {
    role: 'director' | 'system' | 'player';
    playerId?: string;
    playerName?: string;
  };
  context: {
    showId?: string;
    templateId?: string;
    tileId?: string;
    playerId?: string;
    categoryIndex?: number;
    rowIndex?: number;
    categoryName?: string;
    points?: number;
    playerName?: string;
    delta?: number;
    before?: any;
    after?: any;
    message?: string;
    note?: string;
    // Added difficulty to context to fix Property 'difficulty' does not exist error in logFormatter.ts
    difficulty?: Difficulty;
  };
}

export interface GameState {
  showTitle: string;
  isGameStarted: boolean;
  categories: Category[];
  players: Player[];
  activeQuestionId: null | string;
  activeCategoryId: null | string;
  selectedPlayerId: null | string;
  history: string[];
  timer: GameTimer;
  viewSettings: BoardViewSettings;
  lastPlays: PlayEvent[];
  events: GameAnalyticsEvent[]; 
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId: string;
  data?: any;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type ErrorCode = 
  | 'ERR_INVALID_CREDENTIALS' 
  | 'ERR_RATE_LIMIT' 
  | 'ERR_FORBIDDEN' 
  | 'ERR_PROVIDER_DOWN'
  | 'ERR_NETWORK'
  | 'ERR_AI_GENERATION'
  | 'ERR_LIMIT_REACHED'
  | 'ERR_UNKNOWN'
  | 'ERR_SESSION_EXPIRED'
  | 'ERR_BOOTSTRAP_COMPLETE'
  | 'ERR_VALIDATION'
  | 'ERR_REQUEST_NOT_FOUND'
  | 'ERR_REQUEST_ALREADY_PROCESSED';

export class AppError extends Error {
  public code: ErrorCode;
  public correlationId: string;
  
  constructor(code: ErrorCode, message: string, correlationId?: string) {
    super(message);
    this.code = code;
    this.correlationId = correlationId || 'unknown';
    this.name = 'AppError';
  }
}

export type UserRole = 'MASTER_ADMIN' | 'ADMIN' | 'PRODUCER';
export type UserSource = 'MANUAL_CREATE' | 'REQUEST_APPROVAL';
export type UserStatus = 'ACTIVE' | 'REVOKED';

export interface DeliveryLog {
  id: string;
  method: 'EMAIL' | 'SMS';
  status: 'SENT' | 'FAILED';
  timestamp: string;
  providerId?: string;
  error?: string;
}

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  tiktokHandle?: string;
  preferredUsername?: string;
  source: UserSource;
  originalRequestId?: string;
}

export interface User {
  id: string;
  username: string;
  tokenHash: string; 
  role: UserRole;
  status: UserStatus;
  email?: string;
  phone?: string; 
  profile: UserProfile;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null; 
  createdBy?: string;
  lastDelivery?: DeliveryLog;
}

export interface Session {
  id: string;
  username: string;
  role: UserRole;
  createdAt: number;
  userAgent: string;
}

export interface TokenRequest {
  id: string;
  firstName: string;
  lastName: string;
  tiktokHandle: string;
  preferredUsername: string;
  phoneE164: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string; 
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  userId?: string; 
  adminNotifyStatus: 'PENDING' | 'SENT' | 'FAILED';
  adminNotifyError?: string;
  userNotifyStatus: 'PENDING' | 'SENT' | 'FAILED';
  userNotifyError?: string;
}

export interface AuthResponse {
  success: boolean;
  session?: Session;
  message?: string;
  code?: ErrorCode;
}

export type AuditAction = 
  | 'BOOTSTRAP' 
  | 'LOGIN' 
  | 'TOKEN_ISSUED' 
  | 'TOKEN_REFRESHED' 
  | 'TOKEN_REVOKED' 
  | 'ACCESS_GRANTED' 
  | 'ACCESS_REVOKED' 
  | 'USER_CREATED' 
  | 'USER_UPDATED' 
  | 'USER_DELETED' 
  | 'ADMIN_CREATED' 
  | 'MESSAGE_SENT_EMAIL' 
  | 'MESSAGE_SENT_SMS' 
  | 'REQUEST_APPROVED' 
  | 'REQUEST_REJECTED' 
  | 'REQUEST_SUBMITTED' 
  | 'ADMIN_NOTIFIED';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole?: string;
  targetId?: string;
  action: AuditAction;
  details: string;
  metadata?: any;
}

export interface Show {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export interface TemplateConfig {
  playerCount: number;
  playerNames?: string[];
  categoryCount: number;
  rowCount: number;
  pointScale?: number;
}

export interface GameTemplate {
  id: string;
  showId: string;
  topic: string;
  config: TemplateConfig;
  categories: Category[];
  createdAt: string;
  lastModified?: string;
}

export type SpecialMoveType = 'DOUBLE_TROUBLE' | 'TRIPLE_THREAT' | 'SABOTAGE' | 'MEGA_STEAL';

export interface SMSDeployment {
  moveType: SpecialMoveType;
  status: 'ARMED' | 'TRIGGERED';
  armedBy: string;
  armedAt: number;
  triggeredAt?: number;
}

export interface SMSActiveMoveContext {
  tileId: string;
  moveType: SpecialMoveType;
  appliedAt: number;
  restrictions: {
    stealAllowed: boolean;
    failAllowed: boolean;
  };
}

export interface SpecialMovesState {
  version: string;
  deployments: Record<string, SMSDeployment>; 
  activeMove: SMSActiveMoveContext | null;
  updatedAt: number;
}