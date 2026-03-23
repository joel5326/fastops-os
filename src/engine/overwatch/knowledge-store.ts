import type { KnowledgeArticle } from './types.js';

export class KnowledgeStore {
  private articles = new Map<string, KnowledgeArticle>();
  private signalIndex = new Map<string, string[]>();

  load(articles: KnowledgeArticle[]): void {
    for (const article of articles) {
      this.articles.set(article.id, article);
      for (const signal of article.triggerSignals ?? []) {
        const normalized = signal.toLowerCase();
        const existing = this.signalIndex.get(normalized) ?? [];
        if (!existing.includes(article.id)) {
          existing.push(article.id);
          this.signalIndex.set(normalized, existing);
        }
      }
    }
  }

  add(article: KnowledgeArticle): void {
    this.articles.set(article.id, article);
    for (const signal of article.triggerSignals ?? []) {
      const normalized = signal.toLowerCase();
      const existing = this.signalIndex.get(normalized) ?? [];
      if (!existing.includes(article.id)) {
        existing.push(article.id);
        this.signalIndex.set(normalized, existing);
      }
    }
  }

  get(id: string): KnowledgeArticle | undefined {
    return this.articles.get(id);
  }

  findBySignal(text: string): KnowledgeArticle[] {
    const lower = text.toLowerCase();
    const matchedIds = new Set<string>();

    for (const [signal, articleIds] of this.signalIndex) {
      if (lower.includes(signal)) {
        for (const id of articleIds) matchedIds.add(id);
      }
    }

    return Array.from(matchedIds)
      .map((id) => this.articles.get(id)!)
      .filter(Boolean);
  }

  findByCategory(category: string): KnowledgeArticle[] {
    return Array.from(this.articles.values()).filter((a) => a.category === category);
  }

  findBySeverity(minSeverity: KnowledgeArticle['severity']): KnowledgeArticle[] {
    const levels: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const threshold = levels[minSeverity] ?? 0;
    return Array.from(this.articles.values()).filter(
      (a) => (levels[a.severity] ?? 0) >= threshold,
    );
  }

  listAll(): KnowledgeArticle[] {
    return Array.from(this.articles.values());
  }

  size(): number {
    return this.articles.size;
  }

  recordDrop(articleId: string): void {
    const article = this.articles.get(articleId);
    if (article) {
      article.dropCount = (article.dropCount ?? 0) + 1;
      article.updatedAt = new Date().toISOString();
    }
  }

  recordFeedback(articleId: string, score: number): void {
    const article = this.articles.get(articleId);
    if (!article) return;

    const dc = article.dropCount ?? 0;
    const fs = article.feedbackScore ?? 0;
    const totalWeight = fs * dc + score;
    article.feedbackScore = dc > 0 ? totalWeight / (dc + 1) : score;
    article.updatedAt = new Date().toISOString();
  }
}
