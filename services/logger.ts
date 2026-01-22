
import { LogLevel, LogEntry } from '../types';

class Logger {
  private correlationId: string;

  constructor() {
    this.correlationId = crypto.randomUUID();
    console.log(`[Logger] Session started. CorrelationID: ${this.correlationId}`);
  }

  // Sanitize sensitive data
  // Changed from private to public to allow testing
  public maskPII(data: any): any {
    if (typeof data === 'string') {
      // Mask Email
      let text = data.replace(/([a-zA-Z0-9._-]+)(@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi, (match, user, domain) => {
        return `${user.substring(0, 2)}***${domain}`;
      });
      // Mask Phone (Basic Global format)
      text = text.replace(/(\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, (match) => {
        return `${match.substring(0, 3)}****${match.substring(match.length - 2)}`;
      });
      // Mask Token (look for sk-, mk-, ak-, pk-)
      text = text.replace(/([smakp]k-[a-zA-Z0-9]{3})[a-zA-Z0-9]+/g, '$1********');
      return text;
    }
    
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.maskPII(item));
      }
      const masked: any = {};
      for (const key in data) {
        if (key.toLowerCase().includes('token') || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
          masked[key] = '********';
        } else {
          masked[key] = this.maskPII(data[key]);
        }
      }
      return masked;
    }
    return data;
  }

  private log(level: LogLevel, message: string, data?: any) {
    const safeData = data ? this.maskPII(data) : undefined;
    const safeMessage = this.maskPII(message);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: safeMessage,
      correlationId: this.correlationId,
      data: safeData,
    };

    // In a real app, this would beacon to a backend (e.g., Datadog, Splunk)
    const color = level === 'error' ? 'color: red' : level === 'warn' ? 'color: orange' : 'color: #FFD700';
    
    console.groupCollapsed(`%c[${level.toUpperCase()}] ${safeMessage}`, color);
    console.log('Timestamp:', entry.timestamp);
    console.log('CorrelationID:', entry.correlationId);
    if (safeData) console.log('Data:', safeData);
    console.groupEnd();
  }

  info(message: string, data?: any) { this.log('info', message, data); }
  warn(message: string, data?: any) { this.log('warn', message, data); }
  error(message: string, data?: any) { this.log('error', message, data); }
  debug(message: string, data?: any) { this.log('debug', message, data); }

  getCorrelationId() { return this.correlationId; }
}

export const logger = new Logger();