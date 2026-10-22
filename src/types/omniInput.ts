export type OmniActionType =
  | 'NEXT_STEP'
  | 'PREV_STEP'
  | 'START_RECORDING'
  | 'FORCE_SUBMIT'
  | 'RESTART'
  | 'SELECT_SCENARIO'
  | 'TOGGLE_REMOTE_DRAWER';

export type OmniInputSource =
  | 'touch'
  | 'clicker'
  | 'keyboard'
  | 'voice_vad'
  | 'remote_web'
  | 'watchdog';

export interface OmniActionMessage {
  type: OmniActionType;
  source: OmniInputSource;
  timestamp: number;
  payload?: any;
}
