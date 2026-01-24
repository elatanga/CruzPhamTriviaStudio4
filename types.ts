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

export interface Player {
  id: string;
  name: string;
  score: number;
  color: string;
}

export interface GameTimer {
  duration: number; // Default duration setting in seconds
  endTime: number | null; // Target timestamp
  isRunning: boolean;
}

export interface BoardViewSettings {
  boardFontScale: number; // 0.85 - 1.35
  tileScale: number; // 0.85 - 1.15
  updatedAt: string;
}

export interface GameState {
  showTitle: string;
  isGameStarted: boolean;
  categories: Category[];
  players: Player[];
  activeQuestionId: string | null;
  activeCategoryId: string | null;
  selectedPlayerId: string | null;
  history: string[];
  timer: GameTimer;
  viewSettings: BoardViewSettings;
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

// --- ERROR HANDLING ---

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

// --- AUTHENTICATION & ADMIN TYPES ---

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
  tokenHash: string; // SHA-256 hash
  role: UserRole;
  status: UserStatus;
  
  // Contact
  email?: string;
  phone?: string; // E.164
  
  // Detailed Profile
  profile: UserProfile;

  // Metadata
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null; // ISO Date or null for permanent
  createdBy?: string;
  
  // Tracking
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
  userId?: string; // Linked user after approval

  // Admin Notification (New Request Alert)
  adminNotifyStatus: 'PENDING' | 'SENT' | 'FAILED';
  adminNotifyError?: string;

  // User Notification (Approval/Rejection)
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

// --- DATA TYPES ---

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