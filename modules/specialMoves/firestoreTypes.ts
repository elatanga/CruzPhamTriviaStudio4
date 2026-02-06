
import { SpecialMoveType } from '../../types';

export type SMSRequestState = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELED";
export type SMSMoveScope = "TILE" | "PLAYER" | "GLOBAL";

/**
 * games/{gameId}/specialMoves_requests/{requestId}
 */
export interface SMSRequestDoc {
  id: string;
  state: SMSRequestState;
  moveType: SpecialMoveType;
  scope: SMSMoveScope;
  targetId?: string; // PlayerId or CategoryId
  tileId?: string;
  ttlMs?: number; // Intended duration
  actorId: string;
  actorRole: "director";
  createdAt: number;
  idempotencyKey: string;
  correlationId: string;
  rejectionReason?: string;
}

/**
 * games/{gameId}/specialMoves_active/{activeId}
 */
export interface SMSActiveDoc {
  id: string;
  moveType: SpecialMoveType;
  scope: SMSMoveScope;
  targetId?: string;
  tileId?: string;
  appliedAt: number;
  expiresAt: number; // TTL Absolute Timestamp
  requestId: string;
  correlationId: string;
}

/**
 * games/{gameId}/specialMoves_overlay/{docId="current"}
 * Projecting state for O(1) frontend lookups.
 */
export interface SMSOverlayDoc {
  deploymentsByTileId: Record<string, {
    status: "ARMED" | "NONE";
    moveType?: SpecialMoveType;
    updatedAt: number;
  }>;
  activeByTargetId: Record<string, {
    moveType: SpecialMoveType;
    expiresAt: number;
  }[]>;
  updatedAt: number;
  version: number;
}

/**
 * games/{gameId}/specialMoves_audit/{auditId}
 */
export interface SMSAuditDoc {
  id: string;
  eventType: string;
  summary: string;
  createdAt: number;
  correlationId: string;
  idempotencyKey: string;
  metadata?: any;
}
