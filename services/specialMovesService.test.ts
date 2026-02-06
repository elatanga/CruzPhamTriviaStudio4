
import { SpecialMovesService } from './specialMovesService';
import { SpecialMoveType, Question } from '../types';

declare const jest: any;
declare const describe: any;
declare const test: any;
declare const expect: any;

const mockQuestion: Question = {
  id: 'q1',
  text: 'Test Q',
  answer: 'Test A',
  points: 100,
  isRevealed: false,
  isAnswered: false
};

describe('SpecialMovesService Logic', () => {
  
  test('Arming: Correct state transition on valid arm', () => {
    const initialState = SpecialMovesService.createInitialState();
    const result = SpecialMovesService.arm(initialState, 'q1', 'DOUBLE_TROUBLE', 'producer_1', mockQuestion);
    
    expect(result.ok).toBe(true);
    expect(result.nextState?.deployments['q1'].moveType).toBe('DOUBLE_TROUBLE');
    expect(result.nextState?.deployments['q1'].status).toBe('ARMED');
  });

  test('Arming: Prevents arming of already answered tiles', () => {
    const initialState = SpecialMovesService.createInitialState();
    const answeredQ = { ...mockQuestion, isAnswered: true };
    const result = SpecialMovesService.arm(initialState, 'q1', 'SABOTAGE', 'p1', answeredQ);
    
    expect(result.ok).toBe(false);
    expect(result.message).toContain('already played');
  });

  test('Triggering: Creates correct move context', () => {
    const state = SpecialMovesService.createInitialState();
    const { nextState: armedState } = SpecialMovesService.arm(state, 'q1', 'TRIPLE_THREAT', 'p1', mockQuestion);
    
    const { activeMove } = SpecialMovesService.trigger(armedState!, 'q1');
    expect(activeMove?.moveType).toBe('TRIPLE_THREAT');
    expect(activeMove?.tileId).toBe('q1');
  });

  test('Resolution: Double Trouble logic (Award & Fail)', () => {
    const ctx: any = { moveType: 'DOUBLE_TROUBLE', tileId: 'q1' };
    
    const award = SpecialMovesService.resolve(ctx, 'AWARD', 100);
    expect(award.delta).toBe(200);
    
    const fail = SpecialMovesService.resolve(ctx, 'FAIL', 100);
    expect(fail.delta).toBe(-100);
  });

  test('Resolution: Triple Threat logic (Award & Fail)', () => {
    const ctx: any = { moveType: 'TRIPLE_THREAT', tileId: 'q1' };
    
    const award = SpecialMovesService.resolve(ctx, 'AWARD', 200);
    expect(award.delta).toBe(600);
    
    const fail = SpecialMovesService.resolve(ctx, 'FAIL', 200);
    expect(fail.delta).toBe(-260); // 200 * 1.3
  });

  test('Resolution: Mega Steal logic (Standard Award is Zero)', () => {
    const ctx: any = { moveType: 'MEGA_STEAL', tileId: 'q1' };
    
    const award = SpecialMovesService.resolve(ctx, 'AWARD', 100);
    expect(award.delta).toBe(0);
    
    const steal = SpecialMovesService.resolve(ctx, 'STEAL', 100);
    expect(steal.delta).toBe(200);
  });
});
