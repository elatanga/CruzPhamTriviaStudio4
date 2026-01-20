import { Show, GameTemplate, Category, TemplateConfig } from '../types';
import { logger } from './logger';

const STORAGE_KEYS = {
  SHOWS: 'cruzpham_db_shows',
  TEMPLATES: 'cruzpham_db_templates',
};

class DataService {
  private getShowsDB(): Show[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SHOWS) || '[]');
  }

  private saveShowsDB(shows: Show[]) {
    localStorage.setItem(STORAGE_KEYS.SHOWS, JSON.stringify(shows));
  }

  private getTemplatesDB(): GameTemplate[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.TEMPLATES) || '[]');
  }

  private saveTemplatesDB(templates: GameTemplate[]) {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
  }

  // --- SHOWS ---

  getShowsForUser(username: string): Show[] {
    const allShows = this.getShowsDB();
    return allShows.filter(s => s.userId === username).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  createShow(username: string, title: string): Show {
    const newShow: Show = {
      id: crypto.randomUUID(),
      userId: username,
      title,
      createdAt: new Date().toISOString()
    };
    const shows = this.getShowsDB();
    shows.push(newShow);
    this.saveShowsDB(shows);
    logger.info(`[DataService] Created show: ${title} for ${username}`);
    return newShow;
  }

  // --- TEMPLATES ---

  getTemplatesForShow(showId: string): GameTemplate[] {
    const all = this.getTemplatesDB();
    return all.filter(t => t.showId === showId).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  createTemplate(showId: string, topic: string, config: TemplateConfig, categories: Category[]): GameTemplate {
    const currentTemplates = this.getTemplatesForShow(showId);
    if (currentTemplates.length >= 40) {
      throw new Error('LIMIT_REACHED');
    }

    const newTemplate: GameTemplate = {
      id: crypto.randomUUID(),
      showId,
      topic,
      config,
      categories,
      createdAt: new Date().toISOString()
    };

    const all = this.getTemplatesDB();
    all.push(newTemplate);
    this.saveTemplatesDB(all);
    logger.info(`[DataService] Saved template: ${topic} for show ${showId}`);
    return newTemplate;
  }

  updateTemplate(template: GameTemplate) {
    let all = this.getTemplatesDB();
    const idx = all.findIndex(t => t.id === template.id);
    if (idx !== -1) {
      all[idx] = { ...template, lastModified: new Date().toISOString() };
      this.saveTemplatesDB(all);
      logger.info(`[DataService] Updated template: ${template.id}`);
    }
  }

  deleteTemplate(templateId: string) {
    let all = this.getTemplatesDB();
    all = all.filter(t => t.id !== templateId);
    this.saveTemplatesDB(all);
    logger.info(`[DataService] Deleted template: ${templateId}`);
  }

  importTemplate(showId: string, jsonContent: string): GameTemplate {
    const currentTemplates = this.getTemplatesForShow(showId);
    if (currentTemplates.length >= 40) throw new Error('LIMIT_REACHED');

    let parsed: any;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (e) {
      throw new Error('INVALID_JSON');
    }

    // Validation
    if (!parsed.topic || !Array.isArray(parsed.categories) || !parsed.config) {
      throw new Error('INVALID_SCHEMA');
    }
    
    // Constraint Checks
    if (parsed.categories.length > 8 || parsed.config.rowCount > 10 || parsed.config.playerCount > 8) {
      throw new Error('CONSTRAINT_VIOLATION');
    }

    // Sanitize and re-ID
    const newTemplate: GameTemplate = {
      id: crypto.randomUUID(),
      showId, // Force to current show
      topic: parsed.topic + ' (Imported)',
      config: parsed.config,
      categories: parsed.categories.map((c: any) => ({
        ...c,
        id: crypto.randomUUID(),
        questions: c.questions.map((q: any) => ({
          ...q,
          id: crypto.randomUUID(),
          isRevealed: false,
          isAnswered: false
        }))
      })),
      createdAt: new Date().toISOString()
    };

    const all = this.getTemplatesDB();
    all.push(newTemplate);
    this.saveTemplatesDB(all);
    return newTemplate;
  }
}

export const dataService = new DataService();