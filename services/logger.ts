
import { LogLevel, LogEntry, LogCategory } from '../types';

class Logger {
  private correlationId: string;

  constructor() {
    this.correlationId = crypto.randomUUID();
    this.info('SYSTEM', 'Logger initialized', { correlationId: this.correlationId });
  }

  // Sanitize sensitive data
  public maskPII(data: any): any {
    if (typeof data === 'string') {
      let text = data;
      
      // Mask Email
      text = text.replace(/([a-zA-Z0-9._-]+)(@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, (match, user, domain) => {
        return `${user.substring(0, 2)}***${domain}`;
      });
      
      // Mask Phone (Basic Global format)
      text = text.replace(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, (match) => {
        return `${match.substring(0, 3)}****${match.substring(match.length - 2)}`;
      });
      
      // Mask Token (sk-, mk-, ak-, pk-)
      text = text.replace(/([smakp]k-[a-zA-Z0-9]{3})[a-zA-Z0-9]+/g, '$1********');
      
      // Mask Google/Firebase Keys (AIza...)
      text = text.replace(/(AIza[a-zA-Z0-9_-]{5})[a-zA-Z0-9_-]+/g, '$1********');

      return text;
    }
    
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.maskPII(item));
      }
      
      // Handle Error objects specifically since they don't stringify well
      if (data instanceof Error) {
        return {
          name: data.name,
          message: this.maskPII(data.message),
          stack: this.maskPII(data.stack || '')
        };
      }

      const masked: any = {};
      for (const key in data) {
        if (
          key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')
        ) {
          masked[key] = '********';
        } else {
          masked[key] = this.maskPII(data[key]);
        }
      }
      return masked;
    }
    return data;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: any) {
    const safeData = data ? this.maskPII(data) : undefined;
    const safeMessage = this.maskPII(message);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message: safeMessage,
      correlationId: this.correlationId,
      data: safeData,
    };

    // Style for browser console
    const styles = {
      info: 'color: #3b82f6',
      warn: 'color: #f59e0b',
      error: 'color: #ef4444; font-weight: bold',
      debug: 'color: #9ca3af',
    };
    
    const catStyle = 'background: #222; color: #fbbf24; padding: 2px 4px; border-radius: 2px; font-size: 9px; font-weight: bold; margin-right: 6px; border: 1px solid #444;';

    console.groupCollapsed(`%c${category}%c${safeMessage}`, catStyle, styles[level]);
    console.log('Timestamp:', entry.timestamp);
    console.log('CorrelationID:', entry.correlationId);
    if (safeData) console.log('Data:', safeData);
    console.groupEnd();
  }

  info(category: LogCategory, message: string, data?: any) { this.log('info', category, message, data); }
  warn(category: LogCategory, message: string, data?: any) { this.log('warn', category, message, data); }
  error(category: LogCategory, message: string, data?: any) { this.log('error', category, message, data); }
  debug(category: LogCategory, message: string, data?: any) { this.log('debug', category, message, data); }

  getCorrelationId() { return this.correlationId; }
}

export const logger = new Logger();
